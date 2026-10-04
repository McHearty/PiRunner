import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';
import { GitRepository } from '../../../src/infrastructure/git/GitRepository.js';
import { ProjectDiscoveryService } from '../../../src/domain/project/ProjectDiscovery.js';
import { ProjectIntakeService } from '../../../src/domain/project/ProjectIntake.js';
import { StateRecoveryService } from '../../../src/domain/project/StateRecovery.js';
import { StateValidationService } from '../../../src/domain/project/StateValidation.js';

describe('Project Discovery, Adoption, and Canonical Resumption (Normative §5–§10, §18–§20)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let gitRepo: GitRepository;

  const virginRepoSnapshot = {
    branch: 'main',
    headSha: '0000000000000000000000000000000000000000',
    isClean: true
  };

  beforeEach(() => {
    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    gitRepo = new GitRepository(process.cwd());
  });

  it('classifies existing Git repo as ADOPT_EXISTING_PROJECT or RESUME_WORKFLOW', () => {
    const discovery = ProjectDiscoveryService.inspect(process.cwd());
    expect(['ADOPT_EXISTING_PROJECT', 'RESUME_WORKFLOW']).toContain(discovery.entryMode);
    expect(discovery.repositorySnapshot.branch).toBeDefined();
    expect(discovery.repositorySnapshot.headSha).toMatch(/^[0-9a-f]{7,40}$/i);
  });

  it('creates and validates a normative ProjectBaseline artifact during intake (§8, §44)', () => {
    const snapshot = ProjectDiscoveryService.captureRepositorySnapshot(process.cwd());
    const baseline = ProjectIntakeService.createBaselineArtifact('wf-adoption-test', snapshot, gitRepo, process.cwd());

    expect(baseline.artifactType).toBe('ProjectBaseline');
    expect(baseline.status).toBe('ACCEPTED');
    expect(Array.isArray(baseline.payload.detectedUncommittedChanges)).toBe(true);

    const validation = validator.validateArtifact(baseline);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('executes canonical adoption flow: DISCOVERY -> INTAKE -> BASELINE -> KNOWLEDGE_SYNC', async () => {
    const controller = new WorkflowController(
      'wf-adopt-flow',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY',
      gitRepo
    );
    expect(controller.getState()).toBe('PROJECT_DISCOVERY');

    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });
    expect(controller.getState()).toBe('PROJECT_INTAKE');

    const snapshot = ProjectDiscoveryService.captureRepositorySnapshot(process.cwd());
    const baseline = ProjectIntakeService.createBaselineArtifact('wf-adopt-flow', snapshot, gitRepo, process.cwd());
    artifactStore.save(baseline);

    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('PROJECT_BASELINE');

    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('KNOWLEDGE_SYNC');
  });

  it('executes canonical resumption pipeline on restart: DISCOVERY -> STATE_RECOVERY -> STATE_VALIDATION -> MATCH (§18, §19)', async () => {
    // 1. Session 1: advances workflow to CONCEPT on a fresh project
    const controller1 = new WorkflowController(
      'wf-restart-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY',
      gitRepo
    );
    controller1.setRepositorySnapshot(virginRepoSnapshot);

    await controller1.transition('CONCEPT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'NEW_PROJECT' } });
    expect(controller1.getState()).toBe('CONCEPT');

    // 2. Simulate process exit & restart: Controller 2 starts cleanly at PROJECT_DISCOVERY
    const controller2 = new WorkflowController(
      'wf-restart-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY',
      gitRepo
    );
    controller2.setRepositorySnapshot(virginRepoSnapshot);
    expect(controller2.getState()).toBe('PROJECT_DISCOVERY');

    // 3. Resumption Pipeline executes explicitly
    const recovery = StateRecoveryService.recover(eventStore, 'wf-restart-test');
    expect(recovery.recovered).toBe(true);
    expect(recovery.canonicalState).toBe('CONCEPT');

    await controller2.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } });
    expect(controller2.getState()).toBe('STATE_RECOVERY');

    await controller2.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller2.getState()).toBe('STATE_VALIDATION');

    // T-003B advances back to canonical recovered state
    await controller2.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
    expect(controller2.getState()).toBe('CONCEPT');
  });

  it('routes to REPOSITORY_CONFLICT when resume validation detects a mismatch (§20, §24)', async () => {
    const controller = new WorkflowController(
      'wf-conflict-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'PROJECT_DISCOVERY',
      gitRepo
    );
    controller.setRepositorySnapshot(virginRepoSnapshot);

    // Initial event
    await controller.transition('CONCEPT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'NEW_PROJECT' } });

    // New session enters recovery
    const controller2 = new WorkflowController('wf-conflict-test', artifactStore, eventStore, new FakeTestRunner(), new FakeAgentRunner(), {}, 'PROJECT_DISCOVERY', gitRepo);
    await controller2.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } });
    await controller2.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' });

    // T-003C: Validation reports MISMATCH -> freezes to REPOSITORY_CONFLICT
    await controller2.transition('REPOSITORY_CONFLICT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MISMATCH' } });
    expect(controller2.getState()).toBe('REPOSITORY_CONFLICT');
  });
});
