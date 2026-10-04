import { describe, it, expect } from 'vitest';
import { GitKnowledgeProvider } from '../../../src/infrastructure/knowledge/GitKnowledgeProvider.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';

describe('GitKnowledgeProvider Adapter (Normative §12.8, §20)', () => {
  const provider = new GitKnowledgeProvider();
  const validator = new ArtifactValidator();

  it('produces a snapshot adhering strictly to KnowledgeSnapshot schema', async () => {
    const snapshot = await provider.produceSnapshot({
      workflowId: 'wf-1',
      taskId: 'task-1'
    });

    expect(snapshot.sourceRevision).toMatch(/^[0-9a-f]{7,40}$/i);
    expect(snapshot.dependencyLockHash).toHaveLength(64);
    expect(snapshot.verifiedAt).toBeDefined();
    expect(snapshot.freshnessPolicyVersion).toBe('1.0.0');
    expect(Array.isArray(snapshot.relevantSourceFiles)).toBe(true);
    expect(Array.isArray(snapshot.dependencies)).toBe(true);

    // Validate payload against Draft 2020-12 schema
    const validation = validator.validatePayload('KnowledgeSnapshot', snapshot);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
