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

describe('SkillPackage Schema Validation (§37)', () => {
  const validator = new ArtifactValidator();

  it('validates a compliant SkillPackage satisfying the >=3 uses anti-proliferation rule', () => {
    const payload = {
      name: 'author-acceptance-tests',
      version: '1.0.0',
      targetRole: 'TEST_AUTHORING',
      description: 'Derive executable tests from accepted contracts',
      parameterizedInputs: [
        { name: 'sprintSpecArtifactId', type: 'string', description: 'Artifact ID of accepted SprintSpecification' }
      ],
      procedure: [
        'Read accepted specification',
        'Extract acceptance criteria',
        'Author tests under tests/**'
      ],
      successCriteria: [
        'TestSuiteLock hash matches',
        'All acceptance criteria have test dispositions'
      ],
      verifiedUses: [
        'evt-sprint-1-tc1',
        'evt-sprint-2-tc2',
        'evt-sprint-3-tc3'
      ]
    };

    const result = validator.validatePayload('SkillPackage', payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a SkillPackage with fewer than 3 verified uses (Anti-Proliferation Invariant)', () => {
    const invalidPayload = {
      name: 'unverified-skill',
      version: '1.0.0',
      targetRole: 'IMPLEMENTATION',
      description: 'One-off procedure',
      parameterizedInputs: [],
      procedure: ['Do something'],
      successCriteria: ['Done'],
      verifiedUses: ['only-one-use'] // Violates minItems: 3
    };

    const result = validator.validatePayload('SkillPackage', invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must NOT have fewer than 3 items'))).toBe(true);
  });
});
