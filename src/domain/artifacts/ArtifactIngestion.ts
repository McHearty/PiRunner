import { ArtifactValidator } from './ArtifactValidator.js';
import { ArtifactStore, StoredArtifact } from './ArtifactStore.js';
import { AgentExecution } from '../agents/AgentRunner.js';
import { JsonExtractor } from './JsonExtractor.js';
import { randomUUID } from 'node:crypto';

export interface IngestionResult {
  success: boolean;
  artifact?: StoredArtifact<any>;
  errors: string[];
  rawParsed?: any;
}

export class ArtifactIngestionService {
  public static ingestFromExecution(
    execution: AgentExecution,
    expectedArtifactType: string,
    workflowId: string,
    taskId: string,
    agentId: string,
    validator: ArtifactValidator,
    artifactStore: ArtifactStore
  ): IngestionResult {
    if (!execution.rawOutput || execution.status === 'FAILED') {
      return { success: false, errors: ['Agent execution reported failure or empty raw output'] };
    }

    // Fault-tolerant JSON extraction
    const parsed = JsonExtractor.extractJson(execution.rawOutput, expectedArtifactType);
    if (!parsed) {
      return { success: false, errors: ['No parseable JSON object found in agent response'] };
    }

    // Smart unwrapping if payload is wrapped inside an envelope
    let payload = parsed;
    if (parsed.payload && typeof parsed.payload === 'object' && !parsed.sourceRevision && !parsed.title && !parsed.masterSpecificationArtifactId) {
      payload = parsed.payload;
    }

    // Framework owns envelope; agent provides only payload
    const artifactId = `art-${expectedArtifactType.toLowerCase()}-${randomUUID()}`;
    const status = 'SUBMITTED'; // Agent never controls acceptance

    // Harmless normalization only — do not invent missing evidence
    if (expectedArtifactType === 'KnowledgeSnapshot') {
      // Normalize 0-indexed lines from AST / LLMs: line must be >= 1 (§12.8)
      if (Array.isArray(payload.relevantSymbols)) {
        payload.relevantSymbols.forEach((s: any) => {
          if (s.location && typeof s.location === 'object') {
            const rawLine = Number(s.location.line);
            s.location.line = !isNaN(rawLine) ? Math.max(1, rawLine) : 1;
            const rawCol = Number(s.location.column);
            s.location.column = !isNaN(rawCol) ? Math.max(0, rawCol) : 0;
          }
        });
      }
      // Normalize dependency version → resolved (data is already in payload)
      if (Array.isArray(payload.dependencies)) {
        payload.dependencies.forEach((d: any) => {
          if (!d.resolved && d.version) d.resolved = String(d.version);
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

    const envelope: StoredArtifact<any> = {
      artifactId,
      artifactType: expectedArtifactType,
      schemaVersion: '1.0.0', // Framework assigns, not agent
      workflowId,
      taskId,
      agentId, // Actual agent ID from invocation, not role-derived default
      createdAt: new Date().toISOString(), // Actual ingestion time, not agent-supplied
      parentArtifactIds: [], // Framework-managed, not agent-supplied
      sourceRefs: [{ type: 'SESSION', identifier: execution.invocationId }],
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
