import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowController } from '../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../src/infrastructure/agents/FakeAgentRunner.js';

describe('MVP Acceptance Workflow (§43 Normative End-to-End)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  beforeEach(() => {
    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    testRunner = new FakeTestRunner();
    agentRunner = new FakeAgentRunner();
    controller = new WorkflowController('wf-mvp-1', artifactStore, eventStore, testRunner, agentRunner);
  });

  it('executes canonical workflow from Concept through Push Gate with exact capability and HITM enforcement', async () => {
    // 1. Initial State
    expect(controller.getState()).toBe('CONCEPT');

    // 2. Submit Concept
    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' });
    expect(controller.getState()).toBe('CONCEPT_REVIEW');

    // 3. Human Gate: CONCEPT_REVIEW -> SPECIFICATION mandates human approval
    await expect(
      controller.transition('SPECIFICATION', { actorType: 'SYSTEM', actorId: '0000' }, { humanApproved: false })
    ).rejects.toThrow(/mandates explicit human approval/);

    await controller.transition('SPECIFICATION', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });
    expect(controller.getState()).toBe('SPECIFICATION');

    // 4. Progress Spec -> Spec Review -> Planning (Human) -> Knowledge -> Sprint Ready
    await controller.transition('SPECIFICATION_REVIEW', { actorType: 'AGENT', actorId: '0024' });
    await controller.transition('PLANNING', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'AGENT', actorId: '0036' });
    await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0048' });
    expect(controller.getState()).toBe('SPRINT_READY');

    // 5. Test Authoring Path (0120 Methodical Scribe)
    await controller.transition('TEST_AUTHORING', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('TEST_AUTHORING');

    // Verify 0120 path capability: can write test, cannot write src
    const testMutations = controller.validateAgentFileMutations('0120', ['tests/unit/core.test.ts']);
    expect(testMutations.allowed).toBe(true);
    const illegalTestMutations = controller.validateAgentFileMutations('0120', ['src/core.ts']);
    expect(illegalTestMutations.allowed).toBe(false);

    // Enter TEST_READY (Hash frozen)
    const testHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
    await controller.transition('TEST_READY', { actorType: 'AGENT', actorId: '0120' });
    expect(controller.getState()).toBe('TEST_READY');

    // 6. Implementation Path (0060 Confident Forge)
    await controller.transition('IMPLEMENTATION', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('IMPLEMENTATION');

    // Verify 0060 path capability: can write src, CANNOT mutate authoritative tests
    const implMutations = controller.validateAgentFileMutations('0060', ['src/core.ts']);
    expect(implMutations.allowed).toBe(true);
    const illegalImplMutations = controller.validateAgentFileMutations('0060', ['tests/unit/core.test.ts']);
    expect(illegalImplMutations.allowed).toBe(false);

    // 7. Deterministic TestRunner Execution
    testRunner.configureExpectedState(testHash, 'commit-sha-1234');
    const testResult = await controller.executeAuthoritativeTests({
      taskId: 'task-1',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: testHash,
      repositoryRevision: 'commit-sha-1234',
      dependencyLockHash: 'lock-hash-abcd',
      executionCommand: 'npm test'
    });
    expect(testResult.status).toBe('PASSED');

    // 8. Commit and Review
    await controller.transition('COMMIT_CREATED', { actorType: 'AGENT', actorId: '0060' });
    await controller.transition('REVIEW', { actorType: 'SYSTEM', actorId: '0000' });
    await controller.transition('SPRINT_ACCEPTED', { actorType: 'AGENT', actorId: '0084' });
    expect(controller.getState()).toBe('SPRINT_ACCEPTED');

    // 9. Push Gate & Publication (Human Authority Boundary)
    await controller.transition('PUSH_GATE', { actorType: 'SYSTEM', actorId: '0000' });
    
    // Remote push requires explicit human approval
    await expect(
      controller.transition('REMOTE_PUBLISHED', { actorType: 'SYSTEM', actorId: '0000' }, { humanApproved: false })
    ).rejects.toThrow(/mandates explicit human approval/);

    await controller.transition('REMOTE_PUBLISHED', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });
    expect(controller.getState()).toBe('REMOTE_PUBLISHED');

    // 10. Verify Deterministic Replay
    const reconstructed = controller.reconstructState();
    expect(reconstructed).toBe('REMOTE_PUBLISHED');
  });
});
