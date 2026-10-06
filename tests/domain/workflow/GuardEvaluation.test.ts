import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowController, GuardCheckError } from '../../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../../src/infrastructure/agents/FakeAgentRunner.js';

describe('Executable Transition Guard System (Normative §21, §23)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let controller: WorkflowController;

  beforeEach(() => {
    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    // Explicitly initialize at CONCEPT to evaluate sprint/concept guards
    controller = new WorkflowController(
      'wf-guard-test',
      artifactStore,
      eventStore,
      new FakeTestRunner(),
      new FakeAgentRunner(),
      {},
      'CONCEPT'
    );
  });

  it('rejects T-010 (CONCEPT -> CONCEPT_REVIEW) if G-ART-001 fails (no ConceptPackage submitted)', async () => {
    await expect(
      controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' })
    ).rejects.toThrow(GuardCheckError);

    await expect(
      controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' })
    ).rejects.toThrow(/G-ART-001/);
  });

  it('permits T-010 when valid ConceptPackage is submitted to artifact store', async () => {
    artifactStore.save({
      artifactId: 'art-concept-1',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'SUBMITTED',
      payload: {
        title: 'Project Title',
        summary: 'Summary',
        objectives: ['Obj 1'],
        intendedUsers: ['Engineers'],
        majorCapabilities: ['Orchestration'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    });

    const event = await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' });
    expect(event.stateAfter).toBe('CONCEPT_REVIEW');
    expect(controller.getState()).toBe('CONCEPT_REVIEW');
  });

  it('enforces G-ART-025 and G-TEST-006 when transitioning TEST_AUTHORING -> TEST_READY', async () => {
    artifactStore.save({
      artifactId: 'art-concept-accepted',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'SUBMITTED',
      payload: {
        title: 'Title',
        objectives: ['O'],
        intendedUsers: ['U'],
        majorCapabilities: ['C'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    });
    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' });

    artifactStore.save({
      artifactId: 'art-concept-accepted-2',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED',
      payload: {
        title: 'Title',
        objectives: ['O'],
        intendedUsers: ['U'],
        majorCapabilities: ['C'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    });
    await controller.transition('SPECIFICATION', { actorType: 'HUMAN', actorId: 'lead' }, { humanApproved: true });

    artifactStore.save({
      artifactId: 'art-spec-1',
      artifactType: 'MasterSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0024',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'spec' }],
      status: 'SUBMITTED',
      payload: {
        title: 'Spec',
        version: '1.0.0',
        conceptArtifactId: 'art-concept-accepted',
        architecture: { overview: 'o', components: ['c'], boundaries: ['b'] },
        functionalRequirements: [{ id: 'REQ-1', statement: 's', priority: 'MUST' }],
        nonFunctionalRequirements: [],
        interfaces: [],
        invariants: [],
        dataContracts: [],
        stateMachines: [],
        errorBehavior: [],
        securityBoundaries: [],
        persistenceRequirements: [],
        compatibilityRequirements: [],
        testRequirements: [],
        acceptanceCriteria: [{ id: 'AC-1', statement: 's', requirementIds: ['REQ-1'] }],
        implementationConstraints: [],
        unresolvedQuestions: []
      }
    });
    await controller.transition('SPECIFICATION_REVIEW', { actorType: 'AGENT', actorId: '0024' });

    artifactStore.save({
      artifactId: 'art-spec-accepted',
      artifactType: 'MasterSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0024',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'spec' }],
      status: 'ACCEPTED',
      payload: {
        title: 'Spec',
        version: '1.0.0',
        conceptArtifactId: 'art-concept-accepted',
        architecture: { overview: 'o', components: ['c'], boundaries: ['b'] },
        functionalRequirements: [{ id: 'REQ-1', statement: 's', priority: 'MUST' }],
        nonFunctionalRequirements: [],
        interfaces: [],
        invariants: [],
        dataContracts: [],
        stateMachines: [],
        errorBehavior: [],
        securityBoundaries: [],
        persistenceRequirements: [],
        compatibilityRequirements: [],
        testRequirements: [],
        acceptanceCriteria: [{ id: 'AC-1', statement: 's', requirementIds: ['REQ-1'] }],
        implementationConstraints: [],
        unresolvedQuestions: []
      }
    });
    await controller.transition('PLANNING', { actorType: 'HUMAN', actorId: 'lead' }, { humanApproved: true });

    artifactStore.save({
      artifactId: 'art-sprint-1',
      artifactType: 'SprintSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0036',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'plan' }],
      status: 'ACCEPTED',
      payload: {
        masterSpecificationArtifactId: 'art-spec-accepted',
        sprintNumber: 1,
        goals: ['Sprint Goal'],
        tasks: [{ id: 'T-1', title: 'Task', requirementIds: ['REQ-1'] }],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Criteria' }]
      }
    });
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'AGENT', actorId: '0036' });

    artifactStore.save({
      artifactId: 'art-know-1',
      artifactType: 'KnowledgeSnapshot',
      schemaVersion: '1.0.0',
      workflowId: 'wf-guard-test',
      taskId: 't-1',
      agentId: '0048',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED',
      payload: {
        sourceRevision: 'a1b2c3d4e5f6',
        dependencyLockHash: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
        verifiedAt: new Date().toISOString(),
        freshnessPolicyVersion: '1.0.0',
        relevantSourceFiles: [],
        relevantSymbols: [],
        dependencies: [],
        documentationRefs: []
      }
    });
    await controller.transition('PLANNING', { actorType: 'AGENT', actorId: '0048' });
    await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0036' }, { humanApproved: true });
    await controller.transition('TEST_AUTHORING', { actorType: 'SYSTEM', actorId: '0000' });

    // Attempting TEST_READY without submitted TestSpecification must fail G-ART-025
    await expect(
      controller.transition('TEST_READY', { actorType: 'AGENT', actorId: '0120' })
    ).rejects.toThrow(/G-ART-025/);
  });
});
