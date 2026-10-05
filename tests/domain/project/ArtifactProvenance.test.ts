import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { WorkflowController } from '../../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';
import { StateValidationService } from '../../../src/domain/project/StateValidation.js';
import { StateRecoveryService } from '../../../src/domain/project/StateRecovery.js';

describe('Artifact Provenance and Orphan Detection (Sprint 2)', () => {
  const validHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const hermeticDir = join(process.cwd(), '.hitm', 'hermetic-provenance');

  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  beforeEach(() => {
    if (!existsSync(hermeticDir)) {
      mkdirSync(hermeticDir, { recursive: true });
    }

    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    testRunner = new FakeTestRunner();
    agentRunner = new FakeAgentRunner();

    controller = new WorkflowController(
      'wf-provenance',
      artifactStore,
      eventStore,
      testRunner,
      agentRunner,
      {},
      'PROJECT_DISCOVERY',
      undefined,
      hermeticDir
    );
  });

  afterAll(() => {
    rmSync(hermeticDir, { recursive: true, force: true });
  });

  it('accepted artifact with canonical provenance is VALID', async () => {
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false
    });

    // Transition and save an artifact with event reference
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, {
      metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' }
    });

    const baseline = {
      artifactId: 'art-baseline-provenance',
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId: 'wf-provenance',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED' as const,
      payload: {
        repositoryIdentity: 'test-repo',
        baseRevision: 'a1b2c3d4e5f6',
        branch: 'main',
        workingTreeState: 'DIRTY' as const,
        projectType: 'typescript',
        buildSystem: 'npm',
        specificationRefs: [],
        testRefs: [],
        documentationRefs: [],
        dependencyLockHash: validHash,
        sourceInventory: [],
        testInventory: [],
        existingCiConfiguration: [],
        detectedUncommittedChanges: [],
        unresolvedProjectQuestions: [],
        intakeTimestamp: new Date().toISOString(),
        repositorySnapshotHash: validHash
      }
    };
    artifactStore.save(baseline);

    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' }, {
      artifactIds: ['art-baseline-provenance']
    });

    // Verify artifact has canonical provenance
    const events = eventStore.getEvents('wf-provenance');
    const hasProvenance = StateValidationService.hasCanonicalProvenance(baseline, events);
    expect(hasProvenance).toBe(true);
  });

  it('accepted artifact without acceptance event is INVALID (orphan)', async () => {
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false
    });

    // Save an artifact without any event reference
    const orphan = {
      artifactId: 'art-orphan',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-provenance',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Orphan Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(orphan);

    // No events reference this artifact
    const events = eventStore.getEvents('wf-provenance');
    const hasProvenance = StateValidationService.hasCanonicalProvenance(orphan, events);
    expect(hasProvenance).toBe(false);

    // Detect orphans
    const orphans = StateValidationService.detectOrphanedArtifacts(artifactStore, events, 'wf-provenance');
    expect(orphans).toContain('art-orphan (ConceptPackage)');
  });

  it('accepted artifact belonging to another workflow is INVALID', async () => {
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false
    });

    // Save an artifact with different workflowId
    const foreign = {
      artifactId: 'art-foreign',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-other',  // Different workflow
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Foreign Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(foreign);

    // Detect orphans for current workflow
    const events = eventStore.getEvents('wf-provenance');
    const orphans = StateValidationService.detectOrphanedArtifacts(artifactStore, events, 'wf-provenance');
    expect(orphans.length).toBe(0);  // Foreign artifact is not in current workflow
  });

  it('two accepted artifacts select deterministic latest', async () => {
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false
    });

    const now = new Date();
    const earlier = new Date(now.getTime() - 10000);

    // Save two accepted artifacts of the same type
    const first = {
      artifactId: 'art-first',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-provenance',
      taskId: 't-1',
      agentId: '0012',
      createdAt: earlier.toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'First Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(first);

    const second = {
      artifactId: 'art-second',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-provenance',
      taskId: 't-1',
      agentId: '0012',
      createdAt: now.toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Second Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(second);

    // getLatestAccepted should return the second (newer) artifact
    const latest = artifactStore.getLatestAccepted('ConceptPackage', 'wf-provenance');
    expect(latest?.artifactId).toBe('art-second');
  });

  it('getLatestAccepted filters by workflowId', async () => {
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false
    });

    const now = new Date();

    // Save artifact for current workflow
    const current = {
      artifactId: 'art-current',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-provenance',
      taskId: 't-1',
      agentId: '0012',
      createdAt: now.toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Current Workflow Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(current);

    // Save artifact for different workflow
    const foreign = {
      artifactId: 'art-foreign',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-other',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date(now.getTime() + 1000).toISOString(),  // Newer
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Foreign Workflow Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    };
    artifactStore.save(foreign);

    // Without workflowId filter, would get foreign (newer)
    const allLatest = artifactStore.getLatestAccepted('ConceptPackage');
    expect(allLatest?.artifactId).toBe('art-foreign');

    // With workflowId filter, should get current workflow's artifact
    const filteredLatest = artifactStore.getLatestAccepted('ConceptPackage', 'wf-provenance');
    expect(filteredLatest?.artifactId).toBe('art-current');
  });
});