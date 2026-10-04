import { describe, it, expect } from 'vitest';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';

describe('ArtifactValidator (Draft 2020-12)', () => {
  const validator = new ArtifactValidator();

  const validEnvelope = {
    artifactId: 'art-001',
    artifactType: 'ConceptPackage',
    schemaVersion: '1.0.0',
    workflowId: 'wf-1',
    taskId: 'task-1',
    agentId: '0012',
    createdAt: new Date().toISOString(),
    parentArtifactIds: [],
    sourceRefs: [
      {
        type: 'HUMAN_DECISION',
        identifier: 'initial-brief'
      }
    ],
    status: 'SUBMITTED',
    payload: {
      title: 'HITM Workflow Test',
      summary: 'Testing concept package',
      objectives: ['Verify artifact schemas'],
      intendedUsers: ['Developers'],
      majorCapabilities: ['Deterministic validation'],
      constraints: [],
      assumptions: [],
      nonGoals: [],
      terminology: [],
      unresolvedQuestions: []
    }
  };

  it('validates a conformant ArtifactEnvelope and payload', () => {
    const result = validator.validateArtifact(validEnvelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an envelope missing mandatory fields', () => {
    const invalidEnv = { ...validEnvelope };
    delete (invalidEnv as any).agentId;

    const result = validator.validateEnvelope(invalidEnv);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid agent ID pattern (must be 4 digits)', () => {
    const invalidEnv = { ...validEnvelope, agentId: '007' };
    const result = validator.validateEnvelope(invalidEnv);
    expect(result.valid).toBe(false);
  });

  it('rejects a payload violating the specific artifact contract', () => {
    const invalidPayload = {
      ...validEnvelope,
      payload: {
        title: 'Missing required fields'
      }
    };
    const result = validator.validateArtifact(invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('payload'))).toBe(true);
  });
});
