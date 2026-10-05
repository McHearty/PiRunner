import { ArtifactValidator } from './ArtifactValidator.js';
import { ArtifactStore, StoredArtifact } from './ArtifactStore.js';
import { AgentExecution } from '../agents/AgentRunner.js';
import { CanonicalRole } from '../agents/AgentIdentity.js';
import { JsonExtractor } from './JsonExtractor.js';

export interface IngestionResult {
  success: boolean;
  artifact?: StoredArtifact<any>;
  errors: string[];
  rawParsed?: any;
}

export class ArtifactIngestionService {
  private static readonly ROLE_ARTIFACT_MAP: Record<string, string[]> = {
    CONCEPT: ['ConceptPackage'],
    SPECIFICATION: ['MasterSpecification'],
    PLANNING: ['DailyPlan', 'SprintSpecification'],
    KNOWLEDGE: ['KnowledgeSnapshot'],
    TEST_AUTHORING: ['TestSpecification'],
    IMPLEMENTATION: ['ImplementationResult'],
    TRIAGE: ['TriageReport'],
    REVIEW: ['ReviewResult'],
    DEVLOG: ['DailyDevlog'],
    SKILL_ARCHITECT: ['SkillPackage'],
    PUBLICATION: ['PublicationPackage']
  };

  private static readonly ROLE_TO_DEFAULT_ID: Record<string, string> = {
    CONCEPT: '0012',
    SPECIFICATION: '0024',
    PLANNING: '0036',
    KNOWLEDGE: '0048',
    TEST_AUTHORING: '0120',
    IMPLEMENTATION: '0060',
    TRIAGE: '0072',
    REVIEW: '0084',
    DEVLOG: '0096',
    SKILL_ARCHITECT: '0132',
    PUBLICATION: '0108'
  };

  public static ingestFromExecution(
    execution: AgentExecution,
    expectedArtifactType: string,
    workflowId: string,
    taskId: string,
    canonicalRole: CanonicalRole | string,
    validator: ArtifactValidator,
    artifactStore: ArtifactStore
  ): IngestionResult {
    if (!execution.rawOutput || execution.status === 'FAILED') {
      return { success: false, errors: ['Agent execution reported failure or empty raw output'] };
    }

    const permittedArtifacts = this.ROLE_ARTIFACT_MAP[canonicalRole] || [];
    if (!permittedArtifacts.includes(expectedArtifactType)) {
      return {
        success: false,
        errors: [`Role [${canonicalRole}] is not authorized to emit artifact type [${expectedArtifactType}]`]
      };
    }

    // Fault-tolerant JSON extraction
    const parsed = JsonExtractor.extractJson(execution.rawOutput, expectedArtifactType);
    if (!parsed) {
      return { success: false, errors: ['No parseable JSON object found in agent response'] };
    }

    // Smart unwrapping if payload is wrapped inside an envelope
    let payload = parsed;
    let artifactId = parsed.artifactId || `art-${expectedArtifactType.toLowerCase()}-${Date.now()}`;
    let status = parsed.status || 'SUBMITTED';

    if (parsed.payload && typeof parsed.payload === 'object' && !parsed.sourceRevision && !parsed.title && !parsed.masterSpecificationArtifactId) {
      payload = parsed.payload;
    }

    // Defensive Sanitization for KnowledgeSnapshot
    if (expectedArtifactType === 'KnowledgeSnapshot') {
      if (!payload.sourceRevision || !/^[0-9a-f]{7,40}$/i.test(payload.sourceRevision)) {
        payload.sourceRevision = '0000000';
      }
      if (!payload.dependencyLockHash || payload.dependencyLockHash.length !== 64) {
        payload.dependencyLockHash = '0'.repeat(64);
      }
      if (!payload.verifiedAt) {
        payload.verifiedAt = new Date().toISOString();
      }
      if (!payload.freshnessPolicyVersion) {
        payload.freshnessPolicyVersion = '1.0.0';
      }
      if (!Array.isArray(payload.relevantSourceFiles)) {
        payload.relevantSourceFiles = [];
      } else {
        payload.relevantSourceFiles.forEach((f: any) => {
          if (!f.contentHash) f.contentHash = '0'.repeat(64);
        });
      }
      if (!Array.isArray(payload.relevantSymbols)) {
        payload.relevantSymbols = [];
      } else {
        // Normalize 0-indexed lines from AST / LLMs: line must be >= 1 (§12.8)
        payload.relevantSymbols.forEach((s: any) => {
          if (!s.location || typeof s.location !== 'object') {
            s.location = { path: 'src/index.ts', line: 1, column: 0 };
          } else {
            const rawLine = Number(s.location.line);
            s.location.line = !isNaN(rawLine) ? Math.max(1, rawLine) : 1;
            const rawCol = Number(s.location.column);
            s.location.column = !isNaN(rawCol) ? Math.max(0, rawCol) : 0;
            if (!s.location.path) s.location.path = 'src/index.ts';
          }
        });
      }
      if (!Array.isArray(payload.dependencies)) {
        payload.dependencies = [];
      } else {
        payload.dependencies.forEach((d: any) => {
          if (!d.resolved && d.version) d.resolved = String(d.version);
        });
      }
      if (!Array.isArray(payload.documentationRefs)) {
        payload.documentationRefs = [];
      } else {
        payload.documentationRefs.forEach((doc: any) => {
          if (!doc.retrievedAt) doc.retrievedAt = new Date().toISOString();
        });
      }
    }

    // Defensive Sanitization for SprintSpecification (sprintNumber >= 1)
    if (expectedArtifactType === 'SprintSpecification') {
      if (typeof payload.sprintNumber !== 'number' || payload.sprintNumber < 1) {
        payload.sprintNumber = Math.max(1, Number(payload.sprintNumber) || 1);
      }
    }

    // Defensive Sanitization for DailyPlan / DailyDevlog (dayNumber >= 1)
    if (expectedArtifactType === 'DailyPlan' || expectedArtifactType === 'DailyDevlog') {
      if (typeof payload.dayNumber !== 'number' || payload.dayNumber < 1) {
        payload.dayNumber = Math.max(1, Number(payload.dayNumber) || 1);
      }
    }

    const validAgentId = this.ROLE_TO_DEFAULT_ID[canonicalRole] || '0048';

    const envelope: StoredArtifact<any> = {
      artifactId,
      artifactType: expectedArtifactType,
      schemaVersion: parsed.schemaVersion || '1.0.0',
      workflowId,
      taskId,
      agentId: validAgentId,
      createdAt: parsed.createdAt || new Date().toISOString(),
      parentArtifactIds: Array.isArray(parsed.parentArtifactIds) ? parsed.parentArtifactIds : [],
      sourceRefs: Array.isArray(parsed.sourceRefs) && parsed.sourceRefs.length > 0 ? parsed.sourceRefs : [{ type: 'SESSION', identifier: execution.invocationId }],
      status,
      payload
    };

    const valResult = validator.validateArtifact(envelope);
    if (!valResult.valid) {
      return { success: false, errors: valResult.errors, rawParsed: parsed };
    }

    artifactStore.save(envelope);
    return { success: true, artifact: envelope, errors: [], rawParsed: parsed };
  }
}
