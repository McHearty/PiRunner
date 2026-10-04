import { describe, it, expect } from 'vitest';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';

describe('Deterministic FakeTestRunner (Normative §17)', () => {
  const runner = new FakeTestRunner();
  const validRequest = {
    workflowId: 'wf-1',
    taskId: 'task-1',
    testSpecificationArtifactId: 'art-test-spec-1',
    testSuiteContentHash: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
    repositoryRevision: 'a1b2c3d4e5',
    dependencyLockHash: 'ffff0000111122223333444455556666777788889999aaaabbbbccccddddeeee',
    executionCommand: 'npm test'
  };

  it('executes and returns typed TestExecutionResult when hashes align', async () => {
    runner.configureExpectedState(validRequest.testSuiteContentHash, validRequest.repositoryRevision);
    const result = await runner.execute(validRequest);

    expect(result.status).toBe('PASSED');
    expect(result.passed).toBe(5);
    expect(result.testSuiteContentHash).toBe(validRequest.testSuiteContentHash);
  });

  it('rejects execution if the test-suite content hash does not match accepted artifact', async () => {
    runner.configureExpectedState('expected-hash-value', validRequest.repositoryRevision);

    await expect(runner.execute(validRequest)).rejects.toThrow('Hash mismatch');
  });
});
