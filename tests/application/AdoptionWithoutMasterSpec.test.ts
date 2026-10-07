import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { WorkflowController } from '../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../src/infrastructure/agents/FakeAgentRunner.js';

describe('S9-P0-3: Adoption path authority — MasterSpecification or surgical SprintSpecification required', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  const validHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const hermeticAcceptanceDir = join(process.cwd(), '.hitm', 'hermetic-adoption-no-spec');

  beforeEach(() => {
    if (!existsSync(hermeticAcceptanceDir)) {
      mkdirSync(hermeticAcceptanceDir, { recursive: true });
    }

    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    testRunner = new FakeTestRunner();
    agentRunner = new FakeAgentRunner();

    controller = new WorkflowController(
      'wf-adoption-no-spec',
      artifactStore,
      eventStore,
      testRunner,
      agentRunner,
      {},
      'PROJECT_DISCOVERY',
      undefined,
      hermeticAcceptanceDir
    );

    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: true
    });
  });

  afterAll(() => {
    rmSync(hermeticAcceptanceDir, { recursive: true, force: true });
  });

  it('fails at PLANNING → SPRINT_READY when no accepted MasterSpecification and SprintSpecification not marked surgical', async () => {
    // Entry: ADOPT_EXISTING_PROJECT
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });

    // Project Baseline
    const baseline = {
      artifactId: 'art-baseline',
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'SUBMITTED' as const,
      payload: {
        repositoryIdentity: 'test-repo',
        baseRevision: 'a1b2c3d4e5f6',
        branch: 'main',
        workingTreeState: 'CLEAN' as const,
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
    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });

    // Knowledge Snapshot
    const knowledgeSnapshot = {
      artifactId: 'art-know',
      artifactType: 'KnowledgeSnapshot',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0048',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED' as const,
      payload: {
        sourceRevision: 'a1b2c3d4e5f6',
        dependencyLockHash: validHash,
        verifiedAt: new Date().toISOString(),
        freshnessPolicyVersion: '1.0.0',
        relevantSourceFiles: [],
        relevantSymbols: [],
        dependencies: [],
        documentationRefs: []
      }
    };
    artifactStore.save(knowledgeSnapshot);

    // Knowledge sync to planning
    await controller.transition('PLANNING', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('PLANNING');

    // Submit SprintSpecification WITHOUT surgical flag (as the planning agent might)
    // Note: No MasterSpecification was created — this is the adoption path without spec
    const sprintSpec = {
      artifactId: 'art-sprint',
      artifactType: 'SprintSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0036',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'plan' }],
      status: 'ACCEPTED' as const,
      payload: {
        masterSpecificationArtifactId: 'art-sprintspecification-hermetic-test-suite-verification', // Invented ID
        sprintNumber: 1,
        goals: ['Implement verification suite'],
        tasks: [{ id: 'T-1', title: 'Task', requirementIds: ['REQ-1'] }],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Criteria' }]
        // No surgicalChange flag
      }
    };
    artifactStore.save(sprintSpec);

    // Attempt PLANNING → SPRINT_READY
    // This should fail because G-ART-026 requires either accepted MasterSpecification or surgical flag
    let transitionFailed = false;
    let errorMessage = '';
    try {
      await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0036' }, { humanApproved: true });
    } catch (e: any) {
      transitionFailed = true;
      errorMessage = e.message;
    }

    expect(transitionFailed).toBe(true);
    expect(errorMessage).toContain('G-ART-026');
    expect(controller.getState()).toBe('PLANNING'); // Workflow remains in PLANNING
  });

  it('succeeds at PLANNING → SPRINT_READY when SprintSpecification is marked as surgical (no MasterSpecification)', async () => {
    // Entry: ADOPT_EXISTING_PROJECT
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });

    // Project Baseline
    const baseline = {
      artifactId: 'art-baseline',
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'SUBMITTED' as const,
      payload: {
        repositoryIdentity: 'test-repo',
        baseRevision: 'a1b2c3d4e5f6',
        branch: 'main',
        workingTreeState: 'CLEAN' as const,
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
    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });

    // Knowledge Snapshot
    const knowledgeSnapshot = {
      artifactId: 'art-know',
      artifactType: 'KnowledgeSnapshot',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0048',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED' as const,
      payload: {
        sourceRevision: 'a1b2c3d4e5f6',
        dependencyLockHash: validHash,
        verifiedAt: new Date().toISOString(),
        freshnessPolicyVersion: '1.0.0',
        relevantSourceFiles: [],
        relevantSymbols: [],
        dependencies: [],
        documentationRefs: []
      }
    };
    artifactStore.save(knowledgeSnapshot);

    // Knowledge sync to planning
    await controller.transition('PLANNING', { actorType: 'SYSTEM', actorId: '0000' });

    // Submit SprintSpecification WITH surgical flag (bug fix on someone else's code)
    const sprintSpec = {
      artifactId: 'art-sprint',
      artifactType: 'SprintSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0036',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'plan' }],
      status: 'ACCEPTED' as const,
      payload: {
        masterSpecificationArtifactId: null,
        surgicalChange: true, // Explicitly marked as surgical
        sprintNumber: 1,
        goals: ['Fix bug'],
        tasks: [{ id: 'T-1', title: 'Fix bug', requirementIds: [] }],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Bug is fixed' }]
      }
    };
    artifactStore.save(sprintSpec);

    // Persist surgical intent as canonical event (matches production Planning Intent Gate)
    const currentEvents = eventStore.getEvents('wf-adoption-no-spec');
    const nextSeq = currentEvents.length;
    eventStore.append({
      eventId: `evt-adoption-surgical-intent-${Date.now()}`,
      workflowId: 'wf-adoption-no-spec',
      sequence: nextSeq,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING' as any,
      stateAfter: 'PLANNING' as any,
      artifactIds: ['art-sprint'],
      metadata: { intent: 'SURGICAL_CHANGE' }
    });

    // PLANNING → SPRINT_READY should succeed with surgical intent in event history
    await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0036' }, { humanApproved: true });
    expect(controller.getState()).toBe('SPRINT_READY');
  });

  it('succeeds at PLANNING → SPRINT_READY when accepted MasterSpecification exists', async () => {
    // Entry: ADOPT_EXISTING_PROJECT
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });

    // Project Baseline
    const baseline = {
      artifactId: 'art-baseline',
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'SUBMITTED' as const,
      payload: {
        repositoryIdentity: 'test-repo',
        baseRevision: 'a1b2c3d4e5f6',
        branch: 'main',
        workingTreeState: 'CLEAN' as const,
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
    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });

    // Knowledge Snapshot
    const knowledgeSnapshot = {
      artifactId: 'art-know',
      artifactType: 'KnowledgeSnapshot',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0048',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED' as const,
      payload: {
        sourceRevision: 'a1b2c3d4e5f6',
        dependencyLockHash: validHash,
        verifiedAt: new Date().toISOString(),
        freshnessPolicyVersion: '1.0.0',
        relevantSourceFiles: [],
        relevantSymbols: [],
        dependencies: [],
        documentationRefs: []
      }
    };
    artifactStore.save(knowledgeSnapshot);

    // Knowledge sync to planning
    await controller.transition('PLANNING', { actorType: 'SYSTEM', actorId: '0000' });

    // Submit MasterSpecification (establish authority first)
    const masterSpec = {
      artifactId: 'art-spec',
      artifactType: 'MasterSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0024',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'spec' }],
      status: 'ACCEPTED' as const,
      payload: {
        title: 'Adoption Specification',
        version: '1.0.0',
        conceptArtifactId: 'art-concept',
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
    };
    artifactStore.save(masterSpec);

    // Submit SprintSpecification referencing the real MasterSpecification
    const sprintSpec = {
      artifactId: 'art-sprint',
      artifactType: 'SprintSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-adoption-no-spec',
      taskId: 't-1',
      agentId: '0036',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-spec'],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'plan' }],
      status: 'ACCEPTED' as const,
      payload: {
        masterSpecificationArtifactId: 'art-spec',
        sprintNumber: 1,
        goals: ['Implement verification suite'],
        tasks: [{ id: 'T-1', title: 'Task', requirementIds: ['REQ-1'] }],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Criteria' }]
      }
    };
    artifactStore.save(sprintSpec);

    // PLANNING → SPRINT_READY should succeed now
    await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0036' }, { humanApproved: true });
    expect(controller.getState()).toBe('SPRINT_READY');
  });
});