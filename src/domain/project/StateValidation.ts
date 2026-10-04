import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { WorkflowState } from '../workflow/WorkflowState.js';
import { RepositorySnapshot } from '../workflow/Guards.js';
import { StateRecoveryResult } from './StateRecovery.js';
import { TestSuiteLock } from '../testing/TestSuiteLock.js';
import { ArtifactStore } from '../artifacts/ArtifactStore.js';

export interface StateValidationResult {
  status: 'MATCH' | 'MISMATCH' | 'AMBIGUOUS';
  reasons: string[];
}

export class StateValidationService {
  public static validate(
    recovery: StateRecoveryResult,
    repository: RepositorySnapshot,
    artifactStore?: ArtifactStore,
    workspaceRoot: string = process.cwd()
  ): StateValidationResult {
    const reasons: string[] = [];

    if (!recovery.recovered) {
      return { status: 'MISMATCH', reasons: [recovery.error || 'State recovery failed'] };
    }

    const state = recovery.canonicalState;

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

    // 2. Validate TestSuiteLock and Live Test Files for test-locked states (§20, §30)
    const testLockedStates: WorkflowState[] = [
      'TEST_READY',
      'IMPLEMENTATION',
      'COMMIT_CREATED',
      'REVIEW',
      'SPRINT_ACCEPTED'
    ];
    if (testLockedStates.includes(state)) {
      const lock = TestSuiteLock.loadLock();
      if (!lock) {
        reasons.push(`Canonical state is [${state}] but no persistent TestSuiteLock exists`);
      } else if (artifactStore) {
        const testSpec = artifactStore.getLatestAccepted('TestSpecification');
        if (testSpec && (testSpec.payload as any).testSuiteContentHash !== lock.testSuiteContentHash) {
          reasons.push(`TestSuiteLock hash does not match accepted TestSpecification`);
        }
      }
    }

    // 3. Validate Live Lockfile Hash against accepted KnowledgeSnapshot (§20)
    if (artifactStore) {
      const knowledge = artifactStore.getLatestAccepted('KnowledgeSnapshot');
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
      const impl = artifactStore.getLatestAccepted('ImplementationResult');
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
}
