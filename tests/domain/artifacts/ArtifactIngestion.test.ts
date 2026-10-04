import { describe, it, expect } from 'vitest';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactIngestionService } from '../../../src/domain/artifacts/ArtifactIngestion.js';
import { AgentExecution } from '../../../src/domain/agents/AgentRunner.js';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';

describe('Closed-Loop Artifact Ingestion to State Machine Transition (§1, §12, §61)', () => {
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
    const execution: AgentExecution = {
      invocationId: 'inv-1',
      status: 'COMPLETED',
      rawOutput
    };

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

    // Trigger transition using ingested artifact
    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' }, { artifactIds: [ingestion.artifact!.artifactId] });
    expect(controller.getState()).toBe('CONCEPT_REVIEW');
  });
});
