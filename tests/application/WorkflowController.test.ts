import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { WorkflowController } from '../../src/application/WorkflowController.js';
import { ArtifactStore } from '../../src/domain/artifacts/ArtifactStore.js';
import { ArtifactValidator } from '../../src/domain/artifacts/ArtifactValidator.js';
import { EventStore } from '../../src/domain/events/EventStore.js';
import { FakeTestRunner } from '../../src/infrastructure/testing/FakeTestRunner.js';
import { FakeAgentRunner } from '../../src/infrastructure/agents/FakeAgentRunner.js';
import { TestSuiteLock } from '../../src/domain/testing/TestSuiteLock.js';

describe('MVP Acceptance Workflow (§43 Normative End-to-End with Guards)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  const validHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const hermeticAcceptanceDir = join(process.cwd(), '.hitm', 'hermetic-acceptance');

  beforeEach(() => {
    if (!existsSync(hermeticAcceptanceDir)) {
      mkdirSync(hermeticAcceptanceDir, { recursive: true });
    }

    validator = new ArtifactValidator();
    artifactStore = new ArtifactStore(validator);
    eventStore = new EventStore();
    testRunner = new FakeTestRunner();
    agentRunner = new FakeAgentRunner();

    // Pass hermetic acceptance directory as workspaceRoot to protect canonical repo lock
    controller = new WorkflowController(
      'wf-mvp-1',
      artifactStore,
      eventStore,
      testRunner,
      agentRunner,
      {},
      'CONCEPT',
      undefined,
      hermeticAcceptanceDir
    );

    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: true
    });

    // Create test suite lock for the hermetic acceptance directory
    TestSuiteLock.createLock({
      workflowId: 'wf-mvp-1',
      testSpecificationArtifactId: 'art-test-spec',
      testSuiteContentHash: validHash,
      lockedAt: new Date().toISOString(),
      fileCount: 5
    }, hermeticAcceptanceDir);
  });

  afterAll(() => {
    rmSync(hermeticAcceptanceDir, { recursive: true, force: true });
  });

  it('executes canonical workflow from Concept through Push Gate with exact capability, guard, and HITM enforcement', async () => {
    expect(controller.getState()).toBe('CONCEPT');

    // Submit ConceptPackage
    artifactStore.save({
      artifactId: 'art-concept',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'SUBMITTED',
      payload: {
        title: 'Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    });

    await controller.transition('CONCEPT_REVIEW', { actorType: 'AGENT', actorId: '0012' });
    expect(controller.getState()).toBe('CONCEPT_REVIEW');

    // Accept ConceptPackage
    artifactStore.save({
      artifactId: 'art-concept-acc',
      artifactType: 'ConceptPackage',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0012',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-concept'],
      sourceRefs: [{ type: 'HUMAN_DECISION', identifier: 'brief' }],
      status: 'ACCEPTED',
      payload: {
        title: 'Concept',
        objectives: ['O1'],
        intendedUsers: ['Devs'],
        majorCapabilities: ['M1'],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        terminology: [],
        unresolvedQuestions: []
      }
    });

    await controller.transition('SPECIFICATION', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });

    // Submit MasterSpecification
    artifactStore.save({
      artifactId: 'art-spec',
      artifactType: 'MasterSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0024',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-concept-acc'],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'spec' }],
      status: 'SUBMITTED',
      payload: {
        title: 'Spec',
        version: '1.0.0',
        conceptArtifactId: 'art-concept-acc',
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

    // Accept MasterSpecification
    artifactStore.save({
      artifactId: 'art-spec-acc',
      artifactType: 'MasterSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0024',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-spec'],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'spec' }],
      status: 'ACCEPTED',
      payload: {
        title: 'Spec',
        version: '1.0.0',
        conceptArtifactId: 'art-concept-acc',
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

    await controller.transition('PLANNING', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });

    // Submit SprintSpecification
    artifactStore.save({
      artifactId: 'art-sprint',
      artifactType: 'SprintSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0036',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-spec-acc'],
      sourceRefs: [{ type: 'DOCUMENTATION', identifier: 'plan' }],
      status: 'ACCEPTED',
      payload: {
        masterSpecificationArtifactId: 'art-spec-acc',
        sprintNumber: 1,
        goals: ['Implement feature'],
        tasks: [{ id: 'T-1', title: 'Task', requirementIds: ['REQ-1'] }],
        acceptanceCriteria: [{ id: 'AC-1', statement: 'Criteria' }]
      }
    });

    await controller.transition('KNOWLEDGE_SYNC', { actorType: 'AGENT', actorId: '0036' });

    // Submit KnowledgeSnapshot
    artifactStore.save({
      artifactId: 'art-know',
      artifactType: 'KnowledgeSnapshot',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0048',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: 'rev' }],
      status: 'ACCEPTED',
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
    });

    await controller.transition('SPRINT_READY', { actorType: 'AGENT', actorId: '0048' });
    expect(controller.getState()).toBe('SPRINT_READY');

    // 0120 Methodical Scribe
    await controller.transition('TEST_AUTHORING', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('TEST_AUTHORING');

    // Save TestSpecification with valid hash
    artifactStore.save({
      artifactId: 'art-test-spec',
      artifactType: 'TestSpecification',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0120',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-sprint'],
      sourceRefs: [{ type: 'TEST', identifier: 'test' }],
      status: 'ACCEPTED',
      payload: {
        masterSpecificationArtifactId: 'art-spec-acc',
        sprintSpecificationArtifactId: 'art-sprint',
        testCases: [{
          id: 'TC-1',
          requirementIds: ['REQ-1'],
          acceptanceCriteriaIds: ['AC-1'],
          category: 'UNIT',
          description: 'd',
          preconditions: [],
          inputs: [],
          expectedBehavior: ['pass'],
          failureCondition: ['fail'],
          testPath: 'tests/unit/core.test.ts',
          testSymbol: 'coreTest'
        }],
        requirementCoverage: [{ requirementId: 'REQ-1', disposition: 'AUTOMATED', testCaseIds: ['TC-1'] }],
        invariants: [],
        fixtures: [],
        testFramework: 'vitest',
        testRootPaths: ['tests/unit'],
        protectedPaths: ['src/**'],
        executionCommand: 'npm test',
        testSuiteContentHash: validHash,
        unresolvedQuestions: []
      }
    });

    await controller.transition('TEST_READY', { actorType: 'AGENT', actorId: '0120' }, { metadata: { testSuiteHash: validHash } });
    expect(controller.getState()).toBe('TEST_READY');

    // 0060 Confident Forge
    await controller.transition('IMPLEMENTATION', { actorType: 'SYSTEM', actorId: '0000' });
    expect(controller.getState()).toBe('IMPLEMENTATION');

    // Save TestExecutionResult
    artifactStore.save({
      artifactId: 'art-exec-result',
      artifactType: 'TestExecutionResult',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-test-spec'],
      sourceRefs: [{ type: 'COMMAND', identifier: 'npm test' }],
      status: 'ACCEPTED',
      payload: {
        status: 'PASSED',
        testSpecificationArtifactId: 'art-test-spec',
        testSuiteContentHash: validHash,
        repositoryRevision: 'a1b2c3d4e5f6',
        dependencyLockHash: validHash,
        executionCommand: 'npm test',
        passed: 5,
        failed: 0,
        skipped: 0,
        errored: 0,
        executedTests: [{ testId: 'T1', status: 'PASSED' }],
        rawOutput: 'PASSED'
      }
    });

    // Save ImplementationResult
    artifactStore.save({
      artifactId: 'art-impl-result',
      artifactType: 'ImplementationResult',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0060',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-sprint'],
      sourceRefs: [{ type: 'GIT', identifier: 'commit' }],
      status: 'ACCEPTED',
      payload: {
        status: 'COMPLETED',
        sprintSpecificationArtifactId: 'art-sprint',
        testSpecificationArtifactId: 'art-test-spec',
        testSuiteContentHash: validHash,
        commitSha: 'a1b2c3d4e5f6',
        changedFiles: ['src/core.ts'],
        testsExecuted: true,
        testSummary: { passed: 5, failed: 0, skipped: 0 },
        blockingIssues: []
      }
    });

    await controller.transition('COMMIT_CREATED', { actorType: 'AGENT', actorId: '0060' });
    await controller.transition('REVIEW', { actorType: 'SYSTEM', actorId: '0000' });

    // ReviewResult
    artifactStore.save({
      artifactId: 'art-review-result',
      artifactType: 'ReviewResult',
      schemaVersion: '1.0.0',
      workflowId: 'wf-mvp-1',
      taskId: 't-1',
      agentId: '0084',
      createdAt: new Date().toISOString(),
      parentArtifactIds: ['art-impl-result'],
      sourceRefs: [{ type: 'COMMAND', identifier: 'review' }],
      status: 'ACCEPTED',
      payload: {
        status: 'PASS',
        sprintSpecificationArtifactId: 'art-sprint',
        implementationResultArtifactId: 'art-impl-result',
        testExecutionResultArtifactId: 'art-exec-result',
        commitSha: 'a1b2c3d4e5f6',
        blockingFindings: [],
        acceptanceCriteriaResults: [{ criterionId: 'AC-1', satisfied: true }],
        summary: 'All pass'
      }
    });

    await controller.transition('SPRINT_ACCEPTED', { actorType: 'AGENT', actorId: '0084' });
    expect(controller.getState()).toBe('SPRINT_ACCEPTED');

    await controller.transition('PUSH_GATE', { actorType: 'SYSTEM', actorId: '0000' });
    await controller.transition('REMOTE_PUBLISHED', { actorType: 'HUMAN', actorId: 'admin' }, { humanApproved: true });
    expect(controller.getState()).toBe('REMOTE_PUBLISHED');
  });
});

describe('Journal Preservation on PRESERVE Resolution (Sprint 1 Regression)', () => {
  let validator: ArtifactValidator;
  let artifactStore: ArtifactStore;
  let eventStore: EventStore;
  let testRunner: FakeTestRunner;
  let agentRunner: FakeAgentRunner;
  let controller: WorkflowController;

  const validHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const hermeticAcceptanceDir = join(process.cwd(), '.hitm', 'hermetic-journal-preserve');

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
      'wf-journal-preserve',
      artifactStore,
      eventStore,
      testRunner,
      agentRunner,
      {},
      'PROJECT_DISCOVERY',
      undefined,
      hermeticAcceptanceDir
    );
  });

  afterAll(() => {
    rmSync(hermeticAcceptanceDir, { recursive: true, force: true });
  });

  it('PRESERVE resolution retains historical events and appends resolution event', async () => {
    // Establish canonical history with multiple events
    controller.setRepositorySnapshot({
      branch: 'main',
      headSha: 'a1b2c3d4e5f6',
      isClean: false // Dirty working tree
    });

    // Transition through several states to build event history
    await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });
    const baseline = {
      artifactId: 'art-baseline',
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId: 'wf-journal-preserve',
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
        detectedUncommittedChanges: ['src/test.ts'],
        unresolvedProjectQuestions: [],
        intakeTimestamp: new Date().toISOString(),
        repositorySnapshotHash: validHash
      }
    };
    artifactStore.save(baseline);

    await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });

    // Record the events before PRESERVE resolution
    const eventsBeforePreserve = eventStore.getEvents('wf-journal-preserve');
    expect(eventsBeforePreserve.length).toBe(2); // PROJECT_INTAKE + PROJECT_BASELINE

    // Simulate PRESERVE resolution by appending a resolution event
    // (In the actual extension, this is done by promptConflictResolution)
    const resolutionEvent: any = {
      eventId: `evt-wf-journal-preserve-resolution-${Date.now()}`,
      workflowId: 'wf-journal-preserve',
      sequence: eventStore.getNextSequence('wf-journal-preserve'),
      type: 'REPOSITORY_CONFLICT_RESOLUTION',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_BASELINE',
      stateAfter: 'PROJECT_BASELINE',
      artifactIds: [],
      metadata: {
        resolution: 'PRESERVE',
        repositoryRevision: 'a1b2c3d4e5f6',
        uncommittedFiles: ['src/test.ts'],
        conflictContext: 'dirty working tree at session start'
      }
    };
    eventStore.append(resolutionEvent);

    // Verify historical events survived and resolution was appended
    const eventsAfterPreserve = eventStore.getEvents('wf-journal-preserve');
    expect(eventsAfterPreserve.length).toBe(3); // 2 original + 1 resolution

    // Verify original events still exist
    expect(eventsAfterPreserve[0].type).toBe('TRANSITION_T-001A'); // PROJECT_INTAKE
    expect(eventsAfterPreserve[1].type).toBe('TRANSITION_T-002A'); // PROJECT_BASELINE

    // Verify resolution event was appended
    expect(eventsAfterPreserve[2].type).toBe('REPOSITORY_CONFLICT_RESOLUTION');
    expect(eventsAfterPreserve[2].metadata.resolution).toBe('PRESERVE');

    // Verify sequence numbers remain monotonic
    for (let i = 0; i < eventsAfterPreserve.length; i++) {
      expect(eventsAfterPreserve[i].sequence).toBe(i);
    }

    // Verify no sequence was reused
    const sequences = eventsAfterPreserve.map(e => e.sequence);
    const uniqueSequences = new Set(sequences);
    expect(uniqueSequences.size).toBe(sequences.length);
  });
});
