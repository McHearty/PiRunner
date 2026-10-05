import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { WorkflowState } from '../workflow/WorkflowState.js';
import { WorkflowEvent } from '../workflow/WorkflowEvent.js';
import { RepositorySnapshot } from '../workflow/Guards.js';
import { StateRecoveryResult } from './StateRecovery.js';
import { TestSuiteLock } from '../testing/TestSuiteLock.js';
import { TestSuiteHasher, TestFileEntry } from '../testing/TestSuiteHasher.js';
import { ArtifactStore, StoredArtifact } from '../artifacts/ArtifactStore.js';

export interface StateValidationResult {
  status: 'MATCH' | 'MISMATCH' | 'AMBIGUOUS';
  reasons: string[];
}

export class StateValidationService {
  /**
   * Check if an artifact has canonical provenance in the event history.
   * An artifact has canonical provenance if it is referenced in at least one
   * event in the workflow's event history.
   */
  public static hasCanonicalProvenance(
    artifact: StoredArtifact,
    eventHistory: readonly WorkflowEvent[]
  ): boolean {
    // Check workflowId matches
    const workflowArtifacts = eventHistory.filter(e => 
      e.artifactIds && e.artifactIds.includes(artifact.artifactId)
    );
    return workflowArtifacts.length > 0;
  }

  /**
   * Detect orphaned accepted artifacts — artifacts marked ACCEPTED but with no
   * canonical provenance in the event history. These must fail closed.
   */
  public static detectOrphanedArtifacts(
    artifactStore: ArtifactStore,
    eventHistory: readonly WorkflowEvent[],
    workflowId: string
  ): string[] {
    const orphans: string[] = [];
    
    // Check all artifact types that are typically accepted
    const types = [
      'ConceptPackage', 'MasterSpecification', 'SprintSpecification',
      'TestSpecification', 'ImplementationResult', 'TestExecutionResult',
      'KnowledgeSnapshot', 'ReviewResult', 'ProjectBaseline'
    ];
    
    for (const type of types) {
      const accepted = artifactStore.getByType(type).filter(a => 
        a.status === 'ACCEPTED' && a.workflowId === workflowId
      );
      
      for (const artifact of accepted) {
        if (!this.hasCanonicalProvenance(artifact, eventHistory)) {
          orphans.push(`${artifact.artifactId} (${type})`);
        }
      }
    }
    
    return orphans;
  }

  public static validate(
    recovery: StateRecoveryResult,
    repository: RepositorySnapshot,
    artifactStore?: ArtifactStore,
    workspaceRoot: string = process.cwd(),
    workflowId?: string,
    eventHistory?: readonly WorkflowEvent[]
  ): StateValidationResult {
    const reasons: string[] = [];

    if (!recovery.recovered) {
      return { status: 'MISMATCH', reasons: [recovery.error || 'State recovery failed'] };
    }

    const state = recovery.canonicalState;

    // Detect orphaned accepted artifacts (must fail closed)
    if (artifactStore && eventHistory && workflowId) {
      const orphans = this.detectOrphanedArtifacts(artifactStore, eventHistory, workflowId);
      if (orphans.length > 0) {
        reasons.push(`Orphaned accepted artifacts detected (no canonical provenance): ${orphans.join(', ')}`);
      }
    }

    // 1. Validate Working Tree Cleanliness for post-commit states (§20)
    const cleanRequiredStates: WorkflowState[] = [
      'COMMIT_CREATED',
      'REVIEW',
      'SPRINT_ACCEPTED',
      'PUSH_GATE',
      'REMOTE_PUBLISHED',
      'SPRINT_COMPLETE'
    ];
    if (cleanRequiredStates.includes(state) && !repository.isClean) {
      reasons.push(`Working tree is dirty in state [${state}] where clean tree is mandatory`);
    }

    // 2. Fail-Closed Live Test Suite Verification (§20, §30) Derived from Accepted TestSpecification
    const testLockedStates: WorkflowState[] = [
      'TEST_READY',
      'IMPLEMENTATION',
      'COMMIT_CREATED',
      'REVIEW',
      'SPRINT_ACCEPTED'
    ];

    if (testLockedStates.includes(state)) {
      const lock = TestSuiteLock.loadLock(join(workspaceRoot, '.hitm'));
      if (!lock) {
        reasons.push(`Canonical state is [${state}] but no persistent TestSuiteLock exists`);
      } else if (!artifactStore) {
        reasons.push('ArtifactStore unavailable to resolve accepted TestSpecification during resume validation');
      } else {
        const testSpec = artifactStore.getLatestAccepted('TestSpecification', workflowId);
        if (!testSpec) {
          reasons.push(`Cannot validate test suite on resume: No accepted TestSpecification found for state [${state}]`);
        } else {
          const specPayload = testSpec.payload as any;
          const specRoots = specPayload?.testRootPaths;
          const specFramework = specPayload?.testFramework || 'vitest';
          const specCommand = specPayload?.executionCommand || 'npm test';

          if (!Array.isArray(specRoots) || specRoots.length === 0) {
            reasons.push('Cannot validate test suite on resume: Accepted TestSpecification does not define valid testRootPaths');
          } else {
            if (specPayload.testSuiteContentHash !== lock.testSuiteContentHash) {
              reasons.push('TestSuiteLock hash does not match accepted TestSpecification');
            }

            const liveFiles = this.gatherFiles(specRoots, workspaceRoot);
            if (liveFiles.length === 0) {
              reasons.push(`No live test files found in declared testRootPaths: [${specRoots.join(', ')}]`);
            } else {
              const liveHash = TestSuiteHasher.hash({
                testFramework: specFramework,
                executionCommand: specCommand,
                files: liveFiles
              });

              if (liveHash !== lock.testSuiteContentHash) {
                reasons.push(`Live test files on disk do not match authoritative TestSuiteLock (live: ${liveHash}, locked: ${lock.testSuiteContentHash})`);
              }
            }
          }
        }
      }
    }

    // 3. Validate Live Lockfile Hash against accepted KnowledgeSnapshot (§20)
    if (artifactStore) {
      const knowledge = artifactStore.getLatestAccepted('KnowledgeSnapshot', workflowId);
      if (knowledge && (knowledge.payload as any).dependencyLockHash) {
        const lockPath = join(workspaceRoot, 'package-lock.json');
        if (existsSync(lockPath)) {
          const liveHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
          if (liveHash !== (knowledge.payload as any).dependencyLockHash) {
            reasons.push('Live dependency lockfile hash does not match accepted KnowledgeSnapshot');
          }
        }
      }
    }

    // 4. Validate Commit Reachability for reviewed commit (§20)
    if (artifactStore && ['COMMIT_CREATED', 'REVIEW', 'SPRINT_ACCEPTED'].includes(state)) {
      const impl = artifactStore.getLatestAccepted('ImplementationResult', workflowId);
      const sha = (impl?.payload as any)?.commitSha;
      if (sha && sha !== repository.headSha) {
        reasons.push(`Current HEAD revision (${repository.headSha}) does not match implementation commit (${sha})`);
      }
    }

    return {
      status: reasons.length === 0 ? 'MATCH' : 'MISMATCH',
      reasons
    };
  }

  private static gatherFiles(roots: string[], workspaceRoot: string): TestFileEntry[] {
    const entries: TestFileEntry[] = [];
    for (const root of roots) {
      const absRoot = join(workspaceRoot, root);
      if (!existsSync(absRoot)) continue;

      const walk = (dir: string) => {
        for (const item of readdirSync(dir)) {
          const full = join(dir, item);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (stat.isFile() && (item.endsWith('.test.ts') || item.endsWith('.spec.ts'))) {
            entries.push({
              relativePath: relative(workspaceRoot, full).replace(/\\/g, '/'),
              content: readFileSync(full, 'utf8')
            });
          }
        }
      };
      walk(absRoot);
    }
    return entries;
  }
}
