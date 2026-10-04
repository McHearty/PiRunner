import { describe, it, expect } from 'vitest';
import { GitRepository } from '../../../src/infrastructure/git/GitRepository.js';
import { TestSuiteLock } from '../../../src/domain/testing/TestSuiteLock.js';
import { StateRecoveryService } from '../../../src/domain/project/StateRecovery.js';
import { StateValidationService } from '../../../src/domain/project/StateValidation.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';

describe('Dogfooding Enforcement Hardening (Normative §19, §20, §30, §53)', () => {
  it('GitRepository queries fresh repository status and commit verification', () => {
    const git = new GitRepository(process.cwd());
    const snap = git.getFreshSnapshot();

    expect(snap.branch).toBeDefined();
    expect(snap.headSha).toMatch(/^[0-9a-f]{7,40}$/i);
    expect(typeof snap.isClean).toBe('boolean');
    expect(git.verifyCommit(snap.headSha)).toBe(true);
    expect(git.verifyCommit('invalid-sha-1234')).toBe(false);
  });

  it('TestSuiteLock creates and loads authoritative lock file', () => {
    const mockLock = {
      workflowId: 'wf-lock-test',
      testSpecificationArtifactId: 'art-spec-1',
      testSuiteContentHash: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
      lockedAt: new Date().toISOString(),
      fileCount: 3
    };

    TestSuiteLock.createLock(mockLock);
    const loaded = TestSuiteLock.loadLock();

    expect(loaded).toBeDefined();
    expect(loaded?.testSuiteContentHash).toBe(mockLock.testSuiteContentHash);
    expect(loaded?.workflowId).toBe(mockLock.workflowId);
  });

  it('StateRecovery and StateValidation catch broken journals and dirty tree mismatches', () => {
    const eventStore = new EventStore();
    const emptyRecovery = StateRecoveryService.recover(eventStore, 'wf-empty');
    expect(emptyRecovery.recovered).toBe(false);

    // Mock successful recovery in COMMIT_CREATED state
    const recoveryResult = {
      recovered: true,
      canonicalState: 'COMMIT_CREATED' as const,
      eventCount: 5
    };

    // Dirty repository in COMMIT_CREATED must produce MISMATCH
    const dirtyRepo = {
      branch: 'main',
      headSha: '1111222233334444555566667777888899990000',
      isClean: false
    };

    const validation = StateValidationService.validate(recoveryResult, dirtyRepo);
    expect(validation.status).toBe('MISMATCH');
    expect(validation.reasons.some(r => r.includes('dirty'))).toBe(true);
  });
});
