export interface TestExecutionRequest {
  workflowId: string;
  taskId: string;
  testSpecificationArtifactId: string;
  testSuiteContentHash: string;
  repositoryRevision: string;
  dependencyLockHash: string;
  executionCommand: string;
}

export interface IndividualTestRecord {
  testId: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  durationMs?: number;
  failureOutput?: string;
}

export interface TestExecutionResultData {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  testSpecificationArtifactId: string;
  testSuiteContentHash: string;
  repositoryRevision: string;
  dependencyLockHash: string;
  executionCommand: string;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  executedTests: IndividualTestRecord[];
  rawOutput: string;
  environmentFingerprint: string;
}

export interface TestRunner {
  execute(request: TestExecutionRequest): Promise<TestExecutionResultData>;
}
