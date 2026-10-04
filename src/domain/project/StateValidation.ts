import { WorkflowState } from '../workflow/WorkflowState.js';
import { RepositorySnapshot } from '../workflow/Guards.js';
import { StateRecoveryResult } from './StateRecovery.js';
import { TestSuiteLock } from '../testing/TestSuiteLock.js';

export interface StateValidationResult {
  status: 'MATCH' | 'MISMATCH' | 'AMBIGUOUS';
  reasons: string[];
}

export class StateValidationService {
  public static validate(
    recovery: StateRecoveryResult,
    repository: RepositorySnapshot
  ): StateValidationResult {
    const reasons: string[] = [];

    if (!recovery.recovered) {
      return { status: 'MISMATCH', reasons: [recovery.error || 'State recovery failed'] };
    }

    const state = recovery.canonicalState;

    // Implementation, Commit, Review, and Publication paths require a clean working tree
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

    // States at or past TEST_READY require valid TestSuiteLock
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
      }
    }

    return {
      status: reasons.length === 0 ? 'MATCH' : 'MISMATCH',
      reasons
    };
  }
}
