import { describe, it, expect } from 'vitest';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';

describe('Complete 12-Artifact Schema Validation (Normative §12)', () => {
  const validator = new ArtifactValidator();

  it('validates ReviewResult schema', () => {
    const payload = {
      status: 'PASS',
      sprintSpecificationArtifactId: 'art-sprint-1',
      implementationResultArtifactId: 'art-impl-1',
      testExecutionResultArtifactId: 'art-exec-1',
      commitSha: 'a1b2c3d4e5f6',
      blockingFindings: [],
      acceptanceCriteriaResults: [{ criterionId: 'AC-1', satisfied: true }],
      summary: 'All requirements satisfied and tests pass.'
    };
    expect(validator.validatePayload('ReviewResult', payload).valid).toBe(true);
  });

  it('validates SprintSpecification schema', () => {
    const payload = {
      masterSpecificationArtifactId: 'art-spec-1',
      sprintNumber: 1,
      goals: ['Implement core authentication'],
      tasks: [{ id: 'TASK-1', title: 'Token verification', requirementIds: ['REQ-01'] }],
      acceptanceCriteria: [{ id: 'AC-1', statement: 'Token expired produces 401' }]
    };
    expect(validator.validatePayload('SprintSpecification', payload).valid).toBe(true);
  });

  it('validates PublicationPackage schema', () => {
    const payload = {
      sprintSpecificationArtifactId: 'art-sprint-1',
      headline: 'v1.3.0 Engine Released',
      summary: 'HITM Multi-Agent Orchestration deterministic core verified.',
      highlights: ['10 agents specialized', 'Independent test authoring'],
      targetChannels: ['blog', 'github']
    };
    expect(validator.validatePayload('PublicationPackage', payload).valid).toBe(true);
  });
});
