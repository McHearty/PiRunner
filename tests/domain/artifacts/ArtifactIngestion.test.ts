import { describe, it, expect } from 'vitest';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactIngestionService } from '../../../src/domain/artifacts/ArtifactIngestion.js';
import { AgentExecution } from '../../../src/domain/agents/AgentRunner.js';

describe('Closed-Loop Artifact Ingestion (§1, §12, §61)', () => {
  const validator = new ArtifactValidator();
  const store = new ArtifactStore(validator);

  it('ingests and validates valid JSON markdown block emitted by an LLM agent', () => {
    const rawOutput = `
Here is the completed concept package:
\`\`\`json
{
  "title": "Dogfooding Engine",
  "objectives": ["Prove self-development loop"],
  "intendedUsers": ["Engineers"],
  "majorCapabilities": ["Self-hosting"],
  "constraints": [],
  "assumptions": [],
  "nonGoals": [],
  "terminology": [],
  "unresolvedQuestions": []
}
\`\`\`
All requirements satisfied.
`;

    const execution: AgentExecution = {
      invocationId: 'inv-concept-1',
      status: 'COMPLETED',
      rawOutput
    };

    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'ConceptPackage',
      'wf-ingest-1',
      'task-1',
      '0012',
      validator,
      store
    );

    expect(result.success).toBe(true);
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.artifactType).toBe('ConceptPackage');
    expect(result.artifact?.status).toBe('SUBMITTED');

    // Confirms persisted in ArtifactStore
    const retrieved = store.get(result.artifact!.artifactId);
    expect(retrieved).toBeDefined();
    expect((retrieved?.payload as any).title).toBe('Dogfooding Engine');
  });

  it('rejects malformed or invalid schema output from agent execution', () => {
    const rawOutput = `
\`\`\`json
{
  "title": "Invalid package missing mandatory fields"
}
\`\`\`
`;
    const execution: AgentExecution = {
      invocationId: 'inv-bad',
      status: 'COMPLETED',
      rawOutput
    };

    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'ConceptPackage',
      'wf-ingest-1',
      'task-1',
      '0012',
      validator,
      store
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
