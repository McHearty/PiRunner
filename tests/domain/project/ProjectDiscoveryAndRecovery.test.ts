import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';
import { ProjectDiscoveryService } from '../../../src/domain/project/ProjectDiscovery.js';
import { ProjectIntakeService } from '../../../src/domain/project/ProjectIntake.js';

describe('Project Discovery, Adoption, and Resumption (Normative §5–§10, §19–§20)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;

  beforeEach(() => {
    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
  });

  it('classifies an existing Git repository with source files as ADOPT_EXISTING_PROJECT', () => {
    const discovery = ProjectDiscoveryService.inspect(process.cwd());
    expect(['ADOPT_EXISTING_PROJECT', 'RESUME_WORKFLOW']).toContain(discovery.entryMode);
    expect(discovery.repositorySnapshot.branch).toBeDefined();
    expect(discovery.repositorySnapshot.headSha).toMatch(/^[0-9a-f]{7,40}$/i);
  });

  it('creates and validates a normative ProjectBaseline artifact during intake (§8, §44)', () => {
    const snapshot = ProjectDiscoveryService.captureRepositorySnapshot(process.cwd());
    const baseline = ProjectIntakeService.createBaselineArtifact('wf-adoption-test', snapshot, process.cwd());

    expect(baseline.artifactType).toBe('ProjectBaseline');
    expect(baseline.status).toBe('ACCEPTED');

    // Strict schema validation
    const validation = validator.validateArtifact(baseline);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('executes adoption flow: PROJECT_DISCOVERY -> PROJECT_INTAKE -> PROJECT_BASELINE -> KNOWLEDGE_SYNC', async () => {
    const controller = new WorkflowController(
      'wf-adopt-flow',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY'
    );
    expect(controller.getState()).toBe('PROJECT_DISCOVERY');

    // T-001A: Discovery -> Intake
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });
    expect(controller.getState()).toBe('PROJECT_INTAKE');

    // Establish ProjectBaseline
    const snapshot = ProjectDiscoveryService.captureRepositorySnapshot(process.cwd());
    const baseline = ProjectIntakeService.createBaselineArtifact('wf-adopt-flow', snapshot, process.cwd());
    artifactStore.save(baseline);

    // T-002A: Intake -> Baseline
    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('PROJECT_BASELINE');

    // T-002B: Baseline -> Knowledge Sync
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('KNOWLEDGE_SYNC');
  });

  it('recovers workflow state accurately across controller re-instantiation (Resumption §16, §19)', async () => {
    const controller1 = new WorkflowController(
      'wf-resume-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY'
    );

    await controller1.transition('CONCEPT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'NEW_PROJECT' } });
    expect(controller1.getState()).toBe('CONCEPT');

    // Simulate process restart: instantiate brand new controller sharing the same EventStore
    const controller2 = new WorkflowController(
      'wf-resume-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner()
    );

    // Reconstituted state matches previous state exactly
    expect(controller2.getState()).toBe('CONCEPT');
  });
});
