import { TestRunner, TestExecutionRequest, TestExecutionResultData } from '../../domain/testing/TestRunner.js';

export class FakeTestRunner implements TestRunner {
  private expectedHash: string = '';
  private expectedRevision: string = '';
  private nextResultStatus: 'PASSED' | 'FAILED' | 'ERROR' = 'PASSED';

  public configureExpectedState(expectedHash: string, expectedRevision: string): void {
    this.expectedHash = expectedHash;
    this.expectedRevision = expectedRevision;
  }

  public setNextResultStatus(status: 'PASSED' | 'FAILED' | 'ERROR'): void {
    this.nextResultStatus = status;
  }

  public async execute(request: TestExecutionRequest): Promise<TestExecutionResultData> {
    // Deterministic validation checks
    if (this.expectedHash && request.testSuiteContentHash !== this.expectedHash) {
      throw new Error(`Hash mismatch: expected ${this.expectedHash}, received ${request.testSuiteContentHash}`);
    }

    if (this.expectedRevision && request.repositoryRevision !== this.expectedRevision) {
      throw new Error(`Revision mismatch: expected ${this.expectedRevision}, received ${request.repositoryRevision}`);
    }

    const isPassed = this.nextResultStatus === 'PASSED';
    return {
      status: this.nextResultStatus,
      testSpecificationArtifactId: request.testSpecificationArtifactId,
      testSuiteContentHash: request.testSuiteContentHash,
      repositoryRevision: request.repositoryRevision,
      dependencyLockHash: request.dependencyLockHash,
      executionCommand: request.executionCommand,
      passed: isPassed ? 5 : 4,
      failed: isPassed ? 0 : 1,
      skipped: 0,
      errored: 0,
      executedTests: [
        { testId: 'T1', status: 'PASSED' },
        { testId: 'T2', status: isPassed ? 'PASSED' : 'FAILED', failureOutput: isPassed ? undefined : 'AssertionError' }
      ],
      rawOutput: isPassed ? 'All 5 tests passed' : '1 test failed',
      environmentFingerprint: 'mock-env-hash-1234'
    };
  }
}
