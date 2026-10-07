import { describe, it, expect } from 'vitest';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactIngestionService } from '../../../src/domain/artifacts/ArtifactIngestion.js';
import { JsonExtractor } from '../../../src/domain/artifacts/JsonExtractor.js';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';

describe('JsonExtractor Fault Tolerance (§12)', () => {
  it('extracts JSON from uppercase ```JSON blocks with trailing commas', () => {
    const raw = `
Some explanation.
\`\`\`JSON
{
  "title": "Title",
  "objectives": ["Obj1",],
}
\`\`\`
Trailing prose.`;
    const parsed = JsonExtractor.extractJson(raw);
    expect(parsed).toBeDefined();
    expect(parsed.title).toBe('Title');
    expect(parsed.objectives).toEqual(['Obj1']);
  });
});

describe('Closed-Loop Artifact Ingestion (§1, §12, §61)', () => {
  const validator = new ArtifactValidator();
  const store = new ArtifactStore(validator);
  const eventStore = new EventStore();

  it('ingests agent output and advances WorkflowController to CONCEPT_REVIEW', async () => {
    const controller = new WorkflowController('wf-loop-1', store, eventStore, new FakeTestRunner(), new FakeAgentRunner(), {}, 'CONCEPT');

    const rawOutput = `
\`\`\`json
{
  "title": "Closed Loop Concept",
  "objectives": ["Prove closed loop transition"],
  "intendedUsers": ["Engineers"],
  "majorCapabilities": ["Self-hosting"],
  "constraints": [],
  "assumptions": [],
  "nonGoals": [],
  "terminology": [],
  "unresolvedQuestions": []
}
\`\`\`
`;
    const execution = { invocationId: 'inv-1', status: 'COMPLETED' as const, rawOutput };
    const ingestion = ArtifactIngestionService.ingestFromExecution(
      execution,
      'ConceptPackage',
      'wf-loop-1',
      'task-1',
      '0012',
      validator,
      store
    );

    expect(ingestion.success).toBe(true);
    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' }, { artifactIds: [ingestion.artifact!.artifactId] });
    expect(controller.getState()).toBe('CONCEPT_REVIEW');
  });

  it('ingests KnowledgeSnapshot with complete required fields', () => {
    const rawOutput = `
Here is the snapshot:
\`\`\`json
{
  "sourceRevision": "a1b2c3d4e5f6",
  "dependencyLockHash": "${'a'.repeat(64)}",
  "verifiedAt": "2026-10-07T00:00:00Z",
  "freshnessPolicyVersion": "1.0.0",
  "relevantSourceFiles": [{ "path": "src/index.ts", "contentHash": "${'b'.repeat(64)}" }],
  "relevantSymbols": [],
  "dependencies": [{ "name": "vitest", "version": "2.1.9" }],
  "documentationRefs": [{ "identifier": "TECHSPEC.md" }]
}
\`\`\`
`;
    const execution = { invocationId: 'inv-know-auto', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'KnowledgeSnapshot',
      'wf-know-test',
      'task-know',
      '0048',
      validator,
      store
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.artifact?.artifactType).toBe('KnowledgeSnapshot');
    expect(result.artifact?.payload.dependencies[0].resolved).toBe('2.1.9');
  });
});

describe('0-Indexed AST Line Auto-Clamping (§12.8)', () => {
  const validator = new ArtifactValidator();
  const store = new ArtifactStore(validator);

  it('normalizes line: 0 to line: 1 and passes AJV strict validation', () => {
    const rawOutput = `
\`\`\`json
{
  "sourceRevision": "a1b2c3d4e5f6",
  "dependencyLockHash": "${'a'.repeat(64)}",
  "verifiedAt": "2026-10-07T00:00:00Z",
  "freshnessPolicyVersion": "1.0.0",
  "relevantSourceFiles": [],
  "relevantSymbols": [
    { "name": "rootSymbol", "kind": "function", "location": { "path": "src/index.ts", "line": 0, "column": 0 }, "exported": true }
  ],
  "dependencies": [{ "name": "vitest", "version": "2.1.9" }],
  "documentationRefs": []
}
\`\`\`
`;
    const execution = { invocationId: 'inv-zero-line', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'KnowledgeSnapshot',
      'wf-zero-test',
      'task-zero',
      '0048',
      validator,
      store
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.artifact?.payload.relevantSymbols[0].location.line).toBe(1);
  });
});

describe('P0-A: Artifact Authority Invariants', () => {
  const validator = new ArtifactValidator();
  const store = new ArtifactStore(validator);

  it('P0-A.1: Agent cannot self-declare ACCEPTED status', () => {
    // Agent tries to set status via envelope field, not payload
    const rawOutput = `
\`\`\`json
{
  "artifactId": "art-should-be-ignored",
  "status": "ACCEPTED",
  "payload": {
    "title": "Self-Declared Accepted",
    "objectives": ["Test"],
    "intendedUsers": ["Test"],
    "majorCapabilities": ["Test"],
    "constraints": [],
    "assumptions": [],
    "nonGoals": [],
    "terminology": [],
    "unresolvedQuestions": []
  }
}
\`\`\`
`;
    const execution = { invocationId: 'inv-accepted', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'ConceptPackage',
      'wf-authority',
      'task-authority',
      '0012',
      validator,
      store
    );
    expect(result.success).toBe(true);
    expect(result.artifact?.status).toBe('SUBMITTED');
  });

  it('P0-A.2: Actual invocation identity survives ingestion', () => {
    const rawOutput = `
\`\`\`json
{
  "title": "Provenance Test",
  "objectives": ["Test"],
  "intendedUsers": ["Test"],
  "majorCapabilities": ["Test"],
  "constraints": [],
  "assumptions": [],
  "nonGoals": [],
  "terminology": [],
  "unresolvedQuestions": []
}
\`\`\`
`;
    const execution = { invocationId: 'inv-real-123', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'ConceptPackage',
      'wf-authority',
      'task-real',
      '0055',
      validator,
      store
    );
    expect(result.success).toBe(true);
    expect(result.artifact?.sourceRefs).toEqual([{ type: 'SESSION', identifier: 'inv-real-123' }]);
    expect(result.artifact?.agentId).toBe('0055');
    expect(result.artifact?.taskId).toBe('task-real');
  });

  it('P0-A.3: Malformed KnowledgeSnapshot fails validation (no synthetic defaults)', () => {
    // Missing required sourceRevision and dependencyLockHash
    const rawOutput = `
\`\`\`json
{
  "relevantSourceFiles": [{ "path": "src/index.ts" }]
}
\`\`\`
`;
    const execution = { invocationId: 'inv-malformed', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'KnowledgeSnapshot',
      'wf-authority',
      'task-malformed',
      '0048',
      validator,
      store
    );
    // Should fail validation, not be silently fixed
    expect(result.success).toBe(false);
  });
});
