/**
 * Sprint 6: Make every guard prove its invariant.
 *
 * This test file provides explicit test evidence that all transition guards
 * can be evaluated without throwing errors. Each guard is tested with a
 * valid context to prove it can be evaluated.
 */

import { describe, it, expect } from 'vitest';
import { GUARDS, type GuardContext } from '../../../src/domain/workflow/Guards.js';
import type { StoredArtifact } from '../../../src/domain/artifacts/ArtifactStore.js';
import type { WorkflowConfig } from '../../../src/domain/workflow/WorkflowConfig.js';

// Helper to create a valid WorkflowConfig for testing
function createConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    version: '1.0.0',
    maxTriageCyclesPerSprint: 3,
    maxReviewIterationsPerSprint: 3,
    maxImplementationAttempts: 3,
    maxTestAuthoringAttempts: 3,
    stuckFailureThreshold: 3,
    unchangedDiffThreshold: 2,
    knowledgeFreshnessPolicy: {
      version: '1.0.0',
      maxAgeSeconds: 86400
    },
    requireHumanConceptApproval: true,
    requireHumanSpecificationApproval: true,
    requireHumanPushApproval: true,
    ...overrides
  };
}

// Helper to create a base guard context with overrides
function baseCtx(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    currentState: 'PROJECT_DISCOVERY' as any,
    targetState: 'PROJECT_INTAKE' as any,
    artifacts: {
      get: () => undefined,
      getByType: () => [],
      getLatestAccepted: () => undefined
    },
    eventHistory: [],
    config: createConfig(),
    repository: { branch: 'main', headSha: '0000000000000000000000000000000000000000', isClean: true },
    metadata: {},
    ...overrides
  };
}

describe('Guard Invariant Coverage (Sprint 6)', () => {
  const allGuardIds = Object.keys(GUARDS);

  it('all guards are defined and have evaluation functions', () => {
    expect(allGuardIds.length).toBeGreaterThan(0);
    for (const guardId of allGuardIds) {
      const guard = GUARDS[guardId];
      expect(guard).toBeDefined();
      expect(typeof guard.evaluate).toBe('function');
      expect(guard.id).toBe(guardId);
      expect(guard.description).toBeDefined();
    }
  });

  // Test each guard can be evaluated without throwing
  for (const guardId of allGuardIds) {
    it(`${guardId}: evaluates without error on valid context`, () => {
      const guard = GUARDS[guardId];
      expect(() => guard.evaluate(baseCtx())).not.toThrow();
    });
  }

  // Specific guard logic tests for complex guards
  describe('G-ART-001: ConceptPackage status == SUBMITTED', () => {
    it('passes when ConceptPackage is submitted', () => {
      const concept: StoredArtifact<any> = {
        artifactId: 'art-concept',
        artifactType: 'ConceptPackage',
        schemaVersion: '1.0.0',
        workflowId: 'wf-test',
        taskId: 't-1',
        agentId: '0012',
        createdAt: new Date().toISOString(),
        parentArtifactIds: [],
        sourceRefs: [],
        status: 'SUBMITTED',
        payload: {}
      };
      const result = GUARDS['G-ART-001'].evaluate(baseCtx({
        artifacts: {
          get: () => undefined,
          getByType: (type: string) => type === 'ConceptPackage' ? [concept] : [],
          getLatestAccepted: (type: string) => type === 'ConceptPackage' ? concept : undefined
        }
      }));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('G-ART-025: Valid TestSpecification submitted', () => {
    it('passes when TestSpecification has test cases', () => {
      const spec: StoredArtifact<any> = {
        artifactId: 'art-spec',
        artifactType: 'TestSpecification',
        schemaVersion: '1.0.0',
        workflowId: 'wf-test',
        taskId: 't-1',
        agentId: '0012',
        createdAt: new Date().toISOString(),
        parentArtifactIds: [],
        sourceRefs: [],
        status: 'SUBMITTED',
        payload: {
          testRootPaths: ['tests'],
          testFramework: 'vitest',
          executionCommand: 'npm test',
          testCases: [
            { name: 'Test 1', file: 'tests/example.test.ts', line: 1 }
          ]
        }
      };
      const result = GUARDS['G-ART-025'].evaluate(baseCtx({
        artifacts: {
          get: () => undefined,
          getByType: (type: string) => type === 'TestSpecification' ? [spec] : [],
          getLatestAccepted: (type: string) => type === 'TestSpecification' ? spec : undefined
        }
      }));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('G-TEST-001: No active TestSpecification without revision flag', () => {
    it('passes when no accepted TestSpecification exists', () => {
      const result = GUARDS['G-TEST-001'].evaluate(baseCtx({
        artifacts: {
          get: () => undefined,
          getByType: () => [],
          getLatestAccepted: () => undefined
        }
      }));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('G-HUMAN-001: Human push approval granted', () => {
    it('passes when humanApproved metadata is true', () => {
      const result = GUARDS['G-HUMAN-001'].evaluate(baseCtx({
        metadata: { humanApproved: true }
      }));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('G-SKILL-001: Anti-proliferation rule', () => {
    it('passes when SkillPackage has >=3 verified uses', () => {
      const skill: StoredArtifact<any> = {
        artifactId: 'art-skill',
        artifactType: 'SkillPackage',
        schemaVersion: '1.0.0',
        workflowId: 'wf-test',
        taskId: 't-1',
        agentId: '0012',
        createdAt: new Date().toISOString(),
        parentArtifactIds: [],
        sourceRefs: [],
        status: 'SUBMITTED',
        payload: {
          name: 'test-skill',
          version: '1.0.0',
          targetRole: 'IMPLEMENTATION',
          description: 'Test skill',
          parameterizedInputs: [],
          procedure: ['Step 1'],
          successCriteria: ['Success'],
          verifiedUses: ['use-1', 'use-2', 'use-3']
        }
      };
      const result = GUARDS['G-SKILL-001'].evaluate(baseCtx({
        artifacts: {
          get: () => undefined,
          getByType: (type: string) => type === 'SkillPackage' ? [skill] : [],
          getLatestAccepted: (type: string) => type === 'SkillPackage' ? skill : undefined
        }
      }));
      expect(result.satisfied).toBe(true);
    });

    it('fails when SkillPackage has fewer than 3 verified uses', () => {
      const skill: StoredArtifact<any> = {
        artifactId: 'art-skill',
        artifactType: 'SkillPackage',
        schemaVersion: '1.0.0',
        workflowId: 'wf-test',
        taskId: 't-1',
        agentId: '0012',
        createdAt: new Date().toISOString(),
        parentArtifactIds: [],
        sourceRefs: [],
        status: 'SUBMITTED',
        payload: {
          name: 'test-skill',
          version: '1.0.0',
          targetRole: 'IMPLEMENTATION',
          description: 'Test skill',
          parameterizedInputs: [],
          procedure: ['Step 1'],
          successCriteria: ['Success'],
          verifiedUses: ['use-1', 'use-2']
        }
      };
      const result = GUARDS['G-SKILL-001'].evaluate(baseCtx({
        artifacts: {
          get: () => undefined,
          getByType: (type: string) => type === 'SkillPackage' ? [skill] : [],
          getLatestAccepted: (type: string) => type === 'SkillPackage' ? skill : undefined
        }
      }));
      expect(result.satisfied).toBe(false);
    });

    it('fails when no SkillPackage artifact exists', () => {
      const result = GUARDS['G-SKILL-001'].evaluate(baseCtx({}));
      expect(result.satisfied).toBe(false);
    });
  });
});
