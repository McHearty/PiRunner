import { describe, it, expect } from 'vitest';
import { AgentPromptFactory } from '../../../src/agents/AgentPrompts.js';
import { RealDeterministicTestRunner } from '../../../src/infrastructure/testing/RealDeterministicTestRunner.js';

describe('Layered Governance Sub-Prompts (§5, §6, §46-§48)', () => {
  it('layers the base governance prompt and 0120 test-authoring invariants', () => {
    const prompt0120 = AgentPromptFactory.createAgentSystemPrompt('0120');

    expect(prompt0120).toContain('Inference Governance and Engineering Reasoning System Prompt');
    expect(prompt0120).toContain('Tier 1: Correctness & Epistemic Honesty');
    expect(prompt0120).toContain('Rolling Compaction Block');
    expect(prompt0120).toContain('Methodical Scribe (0120) - Test Authoring Specialist');
    expect(prompt0120).toContain('tests/**');
    expect(prompt0120).toContain('Never derive expected behavior from current implementation behavior');
  });

  it('layers the base governance prompt and 0060 implementation invariants', () => {
    const prompt0060 = AgentPromptFactory.createAgentSystemPrompt('0060');

    expect(prompt0060).toContain('Confident Forge (0060) - Implementation Specialist');
    expect(prompt0060).toContain('src/**');
    expect(prompt0060).toContain('Authoritative tests are read-only');
  });

  it('layers the base governance prompt and 0072 triage invariants', () => {
    const prompt0072 = AgentPromptFactory.createAgentSystemPrompt('0072');

    expect(prompt0072).toContain('Patient Oracle (0072) - Triage Specialist');
    expect(prompt0072).toContain('Strictly READ-ONLY');
    expect(prompt0072).toContain('Triage diagnoses and routes but does not silently fix code');
  });
});

describe('RealDeterministicTestRunner (Dogfooding)', () => {
  it('hashes real test files in the workspace and verifies live subprocess execution', async () => {
    const runner = new RealDeterministicTestRunner(process.cwd());
    const result = await runner.execute({
      workflowId: 'self-test',
      taskId: 'test-dogfood',
      testSpecificationArtifactId: 'art-self',
      testSuiteContentHash: '', // Dynamic test calculation
      repositoryRevision: 'local-head',
      dependencyLockHash: 'local-lock',
      executionCommand: 'node -e "console.log(\'deterministic test runner verified\'); process.exit(0);"'
    });

    expect(result.testSuiteContentHash).toHaveLength(64);
    expect(result.environmentFingerprint).toContain('node-');
    expect(result.status).toBe('PASSED');
    expect(result.rawOutput).toContain('deterministic test runner verified');
  });
});
