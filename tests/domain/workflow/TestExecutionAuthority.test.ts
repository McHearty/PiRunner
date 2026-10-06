import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';
import { GUARDS } from '../../../src/domain/workflow/Guards.js';
import { GuardContext } from '../../../src/domain/workflow/Guards.js';
import { TestSuiteLock } from '../../../src/domain/testing/TestSuiteLock.js';

describe('Test Execution Authority Guards (Sprint 4)', () => {
  const validHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const validCommand = 'npm test';
  const validFramework = 'vitest';
  const validRevision = 'a1b2c3d4e5f6';
  const hermeticDir = join(process.cwd(), '.hitm', 'hermetic-test-auth');

  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  beforeEach(() => {
    if (!existsSync(hermeticDir)) {
      mkdirSync(hermeticDir, { recursive: true });
    }

    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    testRunner = new FakeTestRunner();
    agentRunner = new FakeAgentRunner();

    controller = new WorkflowController(
      'wf-test-auth',
      artifactStore,
      eventStore,
      testRunner,
      agentRunner,
      {},
      'PROJECT_DISCOVERY',
      undefined,
      hermeticDir
    );

    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: validRevision,
      isClean: true
    });

    // Create test suite lock in the hermetic test directory
    TestSuiteLock.createLock({
      workflowId: 'wf-test-auth',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      lockedAt: new Date().toISOString(),
      fileCount: 5
    }, hermeticDir);
  });



  function createTestSpec(artifactId: string = 'art-test-spec') {
    artifactStore.save({
      artifactId,
      artifactType: 'TestSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-test-auth',
      taskId: 't-1',
      agentId: '0120',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'TEST', identifier: 'test' }],
      status: 'ACCEPTED' as const,
      payload: {
        masterSpecificationArtifactId: 'art-spec',
        sprintSpecificationArtifactId: 'art-sprint',
        testCases: [{
          id: 'TC-1',
          requirementIds: ['REQ-1'],
          acceptanceCriteriaIds: ['AC-1'],
          category: 'UNIT',
          description: 'd',
          preconditions: [],
          inputs: [],
          expectedBehavior: ['pass'],
          failureCondition: ['fail'],
          testPath: 'tests/unit/core.test.ts',
          testSymbol: 'coreTest'
        }],
        requirementCoverage: [{ requirementId: 'REQ-1', disposition: 'AUTOMATED', testCaseIds: ['TC-1'] }],
        invariants: [],
        fixtures: [],
        testFramework: validFramework,
        testRootPaths: ['tests/unit'],
        protectedPaths: ['src/**'],
        executionCommand: validCommand,
        testSuiteContentHash: validHash,
        unresolvedQuestions: []
      }
    });
  }

  function createExecutionResult(resultPayload: any) {
    const artifactId = resultPayload.artifactId || 'art-exec-result';
    delete resultPayload.artifactId;
    const artifact = {
      artifactId,
      artifactType: 'TestExecutionResult',
      schemaVersion: '1.0.0',
      workflowId: 'wf-test-auth',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'COMMAND', identifier: 'npm test' }],
      status: 'ACCEPTED' as const,
      payload: resultPayload
    };
    artifactStore.save(artifact);
  }

  function buildGuardContext(artifacts?: any) {
    return {
      currentState: 'COMMIT_CREATED' as any,
      targetState: 'REVIEW' as any,
      workflowId: 'wf-test-auth',
      artifacts: artifacts || {
        get: (id: string) => artifactStore.get(id),
        getByType: (type: string) => artifactStore.getByType(type),
        getLatestAccepted: (type: string, workflowId?: string) => artifactStore.getLatestAccepted(type, workflowId || 'wf-test-auth')
      },
      eventHistory: eventStore.getEvents('wf-test-auth'),
      config: {},
      repository: { branch: 'main', headSha: validRevision, isClean: true },
      workspaceRoot: hermeticDir,
      metadata: {}
    } as GuardContext;
  }

  it('G-TEST-013: valid TestExecutionResult passes', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(true);
  });

  it('G-TEST-013: no TestExecutionResult fails', () => {
    createTestSpec();

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('No TestExecutionResult found');
  });

  it('G-TEST-013: FAILED status fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'FAILED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 4,
      failed: 1,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'FAILED' }],
      rawOutput: 'FAILED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('status is FAILED');
  });

  it('G-TEST-013: wrong testSpecificationArtifactId fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-wrong-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('art-wrong-spec');
  });

  it('G-TEST-013: wrong suite hash fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('suite hash');
  });

  it('G-TEST-013: wrong execution command fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: 'yarn test',
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('command');
  });

  it('G-TEST-013: wrong repository revision fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: 'b2c3d4e5f6a1',
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-013'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('revision');
  });

  it('G-TEST-016: valid TestExecutionResult for review passes', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: validRevision,
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });

    // Debug: check if artifact is in store
    const results = artifactStore.getByType('TestExecutionResult');
    expect(results.length).toBe(1);

    // Debug: check lock
    const rootHitmDir = join(process.cwd(), '.hitm');
    const lock = TestSuiteLock.loadLock(rootHitmDir);
    expect(lock).toBeTruthy();
    expect(lock?.testSuiteContentHash).toBe(validHash);

    const ctx = buildGuardContext();
    // Debug: check if guard can find the artifact
    const guardResults = ctx.artifacts.getByType('TestExecutionResult');
    expect(guardResults.length).toBe(1);

    const result = GUARDS['G-TEST-016'].evaluate(ctx);
    if (!result.satisfied) {
      console.log('Guard result:', result.reason);
    }
    expect(result.satisfied).toBe(true);
  });

  it('G-TEST-016: old result with wrong revision fails', () => {
    createTestSpec();
    createExecutionResult({
      artifactId: 'art-exec-result',
      status: 'PASSED',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      repositoryRevision: 'aabbccddeeff00112233445566778899aabbccdd',
      dependencyLockHash: validHash,
      executionCommand: validCommand,
      passed: 5,
      failed: 0,
      skipped: 0,
      errored: 0,
      executedTests: [{ testId: 'T1', status: 'PASSED' }],
      rawOutput: 'PASSED'
    });
    
    const ctx = buildGuardContext();
    const result = GUARDS['G-TEST-016'].evaluate(ctx);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('revision');
  });
});