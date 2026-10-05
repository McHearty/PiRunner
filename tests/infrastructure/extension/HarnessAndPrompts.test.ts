import { describe, it, expect } from 'vitest';
import { AgentPromptFactory } from '../../../src/agents/AgentPrompts.js';
import { RealDeterministicTestRunner } from '../../../src/infrastructure/testing/RealDeterministicTestRunner.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';

describe('Layered Governance Sub-Prompts (§5, §6, §46-§48)', () => {
  it('layers the base governance prompt and test-authoring invariants', () => {
    const prompt0120 = AgentPromptFactory.createAgentSystemPrompt('TEST_AUTHORING');

    expect(prompt0120).toContain('Inference Governance and Engineering Reasoning System Prompt');
    expect(prompt0120).toContain('Tier 1: Correctness & Epistemic Honesty');
    expect(prompt0120).toContain('Rolling Compaction Block');
    expect(prompt0120).toContain('Agent Role: TEST_AUTHORING');
    expect(prompt0120).toContain('ROLE CONTRACT: Test Authoring Specialist (Methodical Scribe)');
    expect(prompt0120).toContain('tests/**');
    expect(prompt0120).toContain('Never derive expected behavior from current implementation behavior');
  });

  it('layers the base governance prompt and implementation invariants', () => {
    const prompt0060 = AgentPromptFactory.createAgentSystemPrompt('IMPLEMENTATION');

    expect(prompt0060).toContain('Agent Role: IMPLEMENTATION');
    expect(prompt0060).toContain('ROLE CONTRACT: Implementation Specialist (Confident Forge)');
    expect(prompt0060).toContain('src/**');
    expect(prompt0060).toContain('Authoritative tests are read-only');
  });

  it('layers the base governance prompt and triage invariants', () => {
    const prompt0072 = AgentPromptFactory.createAgentSystemPrompt('TRIAGE');

    expect(prompt0072).toContain('Agent Role: TRIAGE');
    expect(prompt0072).toContain('ROLE CONTRACT: Triage Specialist (Patient Oracle)');
    expect(prompt0072).toContain('Strictly READ-ONLY');
    expect(prompt0072).toContain('Triage diagnoses and routes but does not silently fix code');
  });
});

describe('RealDeterministicTestRunner (Authoritative Scoping §28, §31)', () => {
  const validator = new ArtifactValidator();
  const store = new ArtifactStore(validator);

  it('refuses execution if accepted TestSpecification is missing (Fail-Closed)', async () => {
    const runner = new RealDeterministicTestRunner(process.cwd(), store);
    await expect(runner.execute({
      workflowId: 'self-test',
      taskId: 'test-fail-closed',
      testSpecificationArtifactId: 'non-existent-spec',
      testSuiteContentHash: '',
      repositoryRevision: 'local-head',
      dependencyLockHash: 'local-lock',
      executionCommand: 'npm test'
    })).rejects.toThrow(/Accepted TestSpecification \[non-existent-spec\] not found in store/);
  });

  it('hashes real test files strictly within declared testRootPaths and executes', async () => {
    store.save({
      artifactId: 'art-self-spec',
      artifactType: 'TestSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'self-test',
      taskId: 'task-1',
      agentId: '0120',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [],
      status: 'ACCEPTED',
      payload: {
        masterSpecificationArtifactId: 'art-spec',
        sprintSpecificationArtifactId: 'art-sprint',
        testCases: [{ id: 'TC1', requirementIds: ['R1'], acceptanceCriteriaIds: ['A1'], category: 'UNIT', description: 'd', preconditions: [], inputs: [], expectedBehavior: ['p'], failureCondition: ['f'], testPath: 'tests/a.ts', testSymbol: 's' }],
        requirementCoverage: [{ requirementId: 'R1', disposition: 'AUTOMATED' }],
        invariants: [],
        fixtures: [],
        testFramework: 'vitest',
        testRootPaths: ['tests'],
        protectedPaths: ['src/**'],
        executionCommand: 'node -e "console.log(\'authoritative test runner verified\'); process.exit(0);"',
        testSuiteContentHash: '0'.repeat(64),
        unresolvedQuestions: []
      }
    });

    const runner = new RealDeterministicTestRunner(process.cwd(), store);
    const result = await runner.execute({
      workflowId: 'self-test',
      taskId: 'test-dogfood',
      testSpecificationArtifactId: 'art-self-spec',
      testSuiteContentHash: '',
      repositoryRevision: 'local-head',
      dependencyLockHash: 'local-lock',
      executionCommand: 'node -e "console.log(\'authoritative test runner verified\'); process.exit(0);"'
    });

    expect(result.testSuiteContentHash).toHaveLength(64);
    expect(result.environmentFingerprint).toContain('node-');
    expect(result.status).toBe('PASSED');
    expect(result.rawOutput).toContain('authoritative test runner verified');
  });
});
