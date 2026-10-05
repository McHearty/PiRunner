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
      'CONCEPT',
      validator,
      store
    );

    expect(ingestion.success).toBe(true);
    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' }, { artifactIds: [ingestion.artifact!.artifactId] });
    expect(controller.getState()).toBe('CONCEPT_REVIEW');
  });

  it('ingests and auto-sanitizes KnowledgeSnapshot with minor model omissions', () => {
    const rawOutput = `
Here is the snapshot:
\`\`\`json
{
  "sourceRevision": "a1b2c3d4e5f6",
  "relevantSourceFiles": [{ "path": "src/index.ts" }],
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
      'KNOWLEDGE',
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
  "relevantSymbols": [
    { "name": "rootSymbol", "kind": "function", "location": { "path": "src/index.ts", "line": 0, "column": 0 }, "exported": true }
  ],
  "dependencies": [{ "name": "vitest", "version": "2.1.9" }]
}
\`\`\`
`;
    const execution = { invocationId: 'inv-zero-line', status: 'COMPLETED' as const, rawOutput };
    const result = ArtifactIngestionService.ingestFromExecution(
      execution,
      'KnowledgeSnapshot',
      'wf-zero-test',
      'task-zero',
      'KNOWLEDGE',
      validator,
      store
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.artifact?.payload.relevantSymbols[0].location.line).toBe(1);
  });
});
