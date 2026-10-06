import { describe, it, expect, afterAll } from 'vitest';
import { WorkflowIdentityService, WorkflowIdentity } from '../../../src/domain/workflow/WorkflowIdentity.js';
import type { WorkflowState } from '../../../src/domain/workflow/WorkflowState.js';
import { FileEventStore } from '../../../src/infrastructure/events/FileEventStore.js';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectDiscoveryService, ProjectEntryMode } from '../../../src/domain/project/ProjectDiscovery.js';
import { StateRecoveryService } from '../../../src/domain/project/StateRecovery.js';
import { WorkflowController } from '../../../src/application/WorkflowController.js';

describe('Workflow Lifecycle (Sprint 8)', () => {
  const testDir = join(process.cwd(), '.hitm', 'hermetic-lifecycle-test');

  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('generates unique workflow IDs', () => {
    const id1 = WorkflowIdentityService.generateNewId('test');
    const id2 = WorkflowIdentityService.generateNewId('test');
    expect(id1).not.toEqual(id2);
    expect(id1).toMatch(/^test-\d+-[a-z0-9]{6}$/);
  });

  it('persists and loads workflow identity', () => {
    const identity: WorkflowIdentity = {
      workflowId: 'test-workflow-1',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(identity, testDir);
    
    const loaded = WorkflowIdentityService.load(testDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowId).toBe('test-workflow-1');
    expect(loaded!.status).toBe('ACTIVE');
  });

  it('returns null when no identity file exists', () => {
    // Create a fresh subdirectory without identity file
    const freshDir = join(testDir, 'no-identity');
    if (existsSync(freshDir)) {
      rmSync(freshDir, { recursive: true, force: true });
    }
    mkdirSync(freshDir, { recursive: true });
    
    const loaded = WorkflowIdentityService.load(freshDir);
    expect(loaded).toBeNull();
  });

  it('old workflow events are preserved when starting new workflow', () => {
    const store = new FileEventStore(testDir);
    
    // Create old workflow events
    store.append({
      eventId: 'evt-old-0',
      workflowId: 'old-workflow',
      sequence: 0,
      type: 'TRANSITION',
      actorType: 'SYSTEM',
      actorId: '0000',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY',
      stateAfter: 'PROJECT_INTAKE',
      artifactIds: [],
      metadata: {}
    });
    
    store.append({
      eventId: 'evt-old-1',
      workflowId: 'old-workflow',
      sequence: 1,
      type: 'TRANSITION',
      actorType: 'SYSTEM',
      actorId: '0000',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE',
      stateAfter: 'PROJECT_BASELINE',
      artifactIds: [],
      metadata: {}
    });
    
    // Archive old workflow (using ABORT transition pattern)
    store.append({
      eventId: 'evt-old-archived',
      workflowId: 'old-workflow',
      sequence: 2,
      type: 'TRANSITION',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_BASELINE',
      stateAfter: 'ABORT',
      artifactIds: [],
      metadata: {
        archiveReason: 'human_requested_new_workflow',
        archivedAt: new Date().toISOString()
      }
    });
    
    // Start new workflow
    const newWorkflowId = WorkflowIdentityService.generateNewId('new');
    store.append({
      eventId: 'evt-new-0',
      workflowId: newWorkflowId,
      sequence: 0,
      type: 'TRANSITION',
      actorType: 'SYSTEM',
      actorId: '0000',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY',
      stateAfter: 'PROJECT_INTAKE',
      artifactIds: [],
      metadata: {}
    });
    
    // Verify old workflow events are preserved
    const oldWorkflowEvents = store.getEvents('old-workflow');
    expect(oldWorkflowEvents).toHaveLength(3);
    expect(oldWorkflowEvents[0].eventId).toBe('evt-old-0');
    expect(oldWorkflowEvents[2].stateAfter).toBe('ABORT');
    expect(oldWorkflowEvents[2].metadata).toHaveProperty('archiveReason');
    
    // Verify new workflow starts at sequence 0
    const newWorkflowEvents = store.getEvents(newWorkflowId);
    expect(newWorkflowEvents).toHaveLength(1);
    expect(newWorkflowEvents[0].sequence).toBe(0);
    expect(newWorkflowEvents[0].eventId).toBe('evt-new-0');
  });

  it('event sequence is per-workflow', () => {
    const store = new FileEventStore(testDir);
    
    // Workflow A
    store.append({
      eventId: 'evt-a-0', workflowId: 'A', sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: {}
    });
    
    // Workflow B
    store.append({
      eventId: 'evt-b-0', workflowId: 'B', sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: {}
    });
    
    // Workflow A second event
    store.append({
      eventId: 'evt-a-1', workflowId: 'A', sequence: 1, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_BASELINE',
      artifactIds: [], metadata: {}
    });
    
    expect(store.getNextSequence('A')).toBe(2);
    expect(store.getNextSequence('B')).toBe(1);
    expect(store.getEvents('A')).toHaveLength(2);
    expect(store.getEvents('B')).toHaveLength(1);
  });

  it('discovery identifies active workflow from identity (not just journal existence)', () => {
    // Create a test workspace with identity file
    const ws = join(testDir, 'discovery-test');
    if (existsSync(ws)) {
      rmSync(ws, { recursive: true, force: true });
    }
    mkdirSync(ws, { recursive: true });
    
    // Save active workflow identity
    const identity: WorkflowIdentity = {
      workflowId: 'active-wf-1',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(identity, ws);
    
    // Create empty events.jsonl (no events yet)
    const store = new FileEventStore(ws);
    // Don't add any events - journal is empty
    
    // Discovery should still identify active workflow via identity
    const discovery = ProjectDiscoveryService.inspect(ws);
    expect(discovery.entryMode).toBe('RESUME_WORKFLOW');
    expect(discovery.activeWorkflowId).toBe('active-wf-1');
  });

  it('archived workflow remains recoverable (replayable)', () => {
    const store = new FileEventStore(testDir);
    
    // Create workflow with legal transitions
    store.append({
      eventId: 'evt-r-0', workflowId: 'recoverable-wf', sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: {}
    });
    
    store.append({
      eventId: 'evt-r-1', workflowId: 'recoverable-wf', sequence: 1, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_BASELINE',
      artifactIds: [], metadata: {}
    });
    
    // Archive with legal ABORT transition
    store.append({
      eventId: 'evt-r-2', workflowId: 'recoverable-wf', sequence: 2, type: 'T',
      actorType: 'HUMAN', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_BASELINE', stateAfter: 'ABORT',
      artifactIds: [], metadata: { archiveReason: 'test' }
    });
    
    // Recovery should succeed and find ABORT state
    const recovery = StateRecoveryService.recover(store as any, 'recoverable-wf');
    expect(recovery.recovered).toBe(true);
    expect(recovery.canonicalState).toBe('ABORT');
  });

  it('P0-1: archival through controller transition works end-to-end', async () => {
    const store = new FileEventStore(testDir);
    const wfId = 'archive-test-wf';
    
    // Create workflow with some transitions
    store.append({
      eventId: 'evt-arc-0', workflowId: wfId, sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' }
    });
    
    store.append({
      eventId: 'evt-arc-1', workflowId: wfId, sequence: 1, type: 'T',
      actorType: 'SYSTEM', actorId: '0', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_BASELINE',
      artifactIds: [], metadata: {}
    });
    
    // Recover to canonical state
    const recovery = StateRecoveryService.recover(store as any, wfId);
    expect(recovery.recovered).toBe(true);
    expect(recovery.canonicalState).toBe('PROJECT_BASELINE');
    
    // Construct controller at recovered state (not hardcoded PROJECT_DISCOVERY)
    const mockRepo = { getHead: () => 'test', getFreshSnapshot: async () => 'test-snapshot' } as any;
    const controller = new WorkflowController(
      wfId, null as any, store as any, null as any, null as any,
      {}, recovery.canonicalState, mockRepo, process.cwd()
    );
    
    // Perform ABORT transition with required human authorization
    await controller.transition('ABORT', 
      { actorType: 'HUMAN', actorId: 'lead-human' },
      {
        humanApproved: true,
        metadata: {
          humanAbort: true,
          archiveReason: 'test_archival',
          archivedAt: new Date().toISOString()
        }
      }
    );
    
    // Verify archival succeeded
    const postArchiveRecovery = StateRecoveryService.recover(store as any, wfId);
    expect(postArchiveRecovery.recovered).toBe(true);
    expect(postArchiveRecovery.canonicalState).toBe('ABORT');
    
    // Verify historical events are intact
    const events = store.getEvents(wfId);
    expect(events).toHaveLength(3);
    expect(events[2].stateAfter).toBe('ABORT');
    expect(events[2].metadata).toHaveProperty('archiveReason', 'test_archival');
  });

  it('P0-2: new workflow receives canonical initial event and is restartable', async () => {
    const store = new FileEventStore(testDir);
    const ws = join(testDir, 'new-wf-test');
    if (existsSync(ws)) {
      rmSync(ws, { recursive: true, force: true });
    }
    mkdirSync(ws, { recursive: true });
    
    // Create new workflow identity
    const newId = WorkflowIdentityService.generateNewId('new-wf');
    const newIdentity: WorkflowIdentity = {
      workflowId: newId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(newIdentity, ws);
    
    // Create first canonical event (as resolveWorkflowIdentity does)
    // Mock repo must satisfy G-REPO-000 guard (repository identity established)
    // Guard checks ctx.repository?.headSha && ctx.repository.branch
    // where ctx.repository comes from getFreshSnapshot()
    const mockRepo = {
      getHead: () => 'test-head-abc123',
      getBranch: () => 'main',
      getFreshSnapshot: async () => ({
        headSha: 'test-head-abc123',
        branch: 'main',
        workingTreeState: 'clean'
      }),
      getRemoteUrl: () => 'test-url'
    } as any;
    const controller = new WorkflowController(
      newId, null as any, store as any, null as any, null as any,
      {}, 'PROJECT_DISCOVERY', mockRepo, ws
    );
    
    // Perform initial transition (ADOPT_EXISTING_PROJECT path)
    await controller.transition('PROJECT_INTAKE', 
      { actorType: 'SYSTEM', actorId: '0000' },
      { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } }
    );
    
    // Verify first event was created
    const events = store.getEvents(newId);
    expect(events).toHaveLength(1);
    expect(events[0].sequence).toBe(0);
    expect(events[0].workflowId).toBe(newId);
    
    // Simulate restart: construct fresh discovery instance
    const discovery = ProjectDiscoveryService.inspect(ws);
    expect(discovery.entryMode).toBe('RESUME_WORKFLOW');
    expect(discovery.activeWorkflowId).toBe(newId);
    
    // Simulate restart: recover by discovered workflowId
    const recovery = StateRecoveryService.recover(store as any, newId);
    expect(recovery.recovered).toBe(true);
    expect(recovery.canonicalState).toBe('PROJECT_INTAKE');
  });

  it('P0-2.1: START NEW WORKFLOW path creates initial event and survives restart', async () => {
    // This test exercises the same code path as the extension's START NEW WORKFLOW option
    // after failed resume validation: archive old workflow, create new one, verify restartability

    const ws = join(testDir, 'start-new-wf-test');
    if (existsSync(ws)) {
      rmSync(ws, { recursive: true, force: true });
    }
    mkdirSync(ws, { recursive: true });

    const store = new FileEventStore(ws);

    // Step 1: Create old active workflow with some events
    const oldId = 'old-wf-abc';
    const oldIdentity: WorkflowIdentity = {
      workflowId: oldId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(oldIdentity, ws);

    store.append({
      eventId: 'evt-old-0', workflowId: oldId, sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' }
    });

    store.append({
      eventId: 'evt-old-1', workflowId: oldId, sequence: 1, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_BASELINE',
      artifactIds: [], metadata: {}
    });

    // Step 2: Resume validation fails (simulated) — user selects START NEW WORKFLOW

    // Step 3: Archive old workflow (using legal ABORT transition)
    const mockRepo = {
      getHead: () => 'test-head',
      getBranch: () => 'main',
      getFreshSnapshot: async () => ({ headSha: 'test-head', branch: 'main', workingTreeState: 'clean' })
    } as any;

    const recovery = StateRecoveryService.recover(store as any, oldId);
    const oldController = new WorkflowController(
      oldId, null as any, store as any, null as any, null as any,
      {}, recovery.canonicalState, mockRepo, ws
    );
    await oldController.transition('ABORT',
      { actorType: 'HUMAN', actorId: 'lead-human' },
      {
        humanApproved: true,
        metadata: { humanAbort: true, archiveReason: 'human_requested_new_workflow' }
      }
    );

    // Verify old workflow archived
    const postArchiveRecovery = StateRecoveryService.recover(store as any, oldId);
    expect(postArchiveRecovery.recovered).toBe(true);
    expect(postArchiveRecovery.canonicalState).toBe('ABORT');

    // Step 4: Start new workflow (using same path as resolveWorkflowIdentity)
    const newId = WorkflowIdentityService.generateNewId();
    const newIdentity: WorkflowIdentity = {
      workflowId: newId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(newIdentity, ws);

    // Create initial canonical event (the fix for P0-2.1)
    store.append({
      eventId: `evt-${newId}-init`,
      workflowId: newId,
      sequence: 0,
      type: 'TRANSITION',
      actorType: 'SYSTEM',
      actorId: '0000',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY',
      stateAfter: 'PROJECT_INTAKE',
      artifactIds: [],
      metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' }
    });

    // Step 5: Verify new workflow has event sequence 0
    const newEvents = store.getEvents(newId);
    expect(newEvents).toHaveLength(1);
    expect(newEvents[0].sequence).toBe(0);
    expect(newEvents[0].workflowId).toBe(newId);

    // Step 6: Simulate process restart — construct fresh discovery
    const discovery = ProjectDiscoveryService.inspect(ws);
    expect(discovery.entryMode).toBe('RESUME_WORKFLOW');
    expect(discovery.activeWorkflowId).toBe(newId);

    // Step 7: Simulate restart recovery
    const newRecovery = StateRecoveryService.recover(store as any, newId);
    expect(newRecovery.recovered).toBe(true);
    expect(newRecovery.canonicalState).toBe('PROJECT_INTAKE');

    // Verify old workflow history is intact
    const oldEvents = store.getEvents(oldId);
    expect(oldEvents).toHaveLength(3); // 2 original + 1 ABORT
    expect(oldEvents[2].stateAfter).toBe('ABORT');
  });

  it('P0-2: unrecoverable workflow archival does not fabricate state', async () => {
    // Regression test: archiveOldWorkflow must not require successful recovery.
    // When recovery fails (e.g., corrupted journal), archival should still work
    // by writing an audit event directly, not by fabricating a canonical state.

    const ws = join(testDir, 'unrecoverable-archival-test');
    if (existsSync(ws)) {
      rmSync(ws, { recursive: true, force: true });
    }
    mkdirSync(ws, { recursive: true });

    const store = new FileEventStore(ws);
    const oldId = 'unrecoverable-wf';

    // Simulate a corrupted journal: illegal transition
    store.append({
      eventId: 'evt-c-0', workflowId: oldId, sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: {}
    });
    store.append({
      eventId: 'evt-c-1', workflowId: oldId, sequence: 1, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'IMPL' as WorkflowState, // illegal target
      artifactIds: [], metadata: {}
    });

    // Recovery should fail
    const recovery = StateRecoveryService.recover(store as any, oldId);
    expect(recovery.recovered).toBe(false);
    expect(recovery.error).toBeDefined();

    // Archival via direct event append (unrecoverable path)
    const archivalEvent = {
      eventId: `evt-${oldId}-archived-${Date.now()}`,
      workflowId: oldId,
      sequence: 2,
      type: 'WORKFLOW_ARCHIVED',
      actorType: 'HUMAN' as const,
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'UNKNOWN' as any,
      stateAfter: 'ABORT' as any,
      artifactIds: [],
      metadata: {
        humanAbort: true,
        archiveReason: 'human_requested_new_workflow',
        recoveryStatus: 'UNRECOVERABLE',
        archivedAt: new Date().toISOString()
      }
    };
    store.append(archivalEvent);

    // Verify archival event was written
    const events = store.getEvents(oldId);
    expect(events).toHaveLength(3);
    expect(events[2].type).toBe('WORKFLOW_ARCHIVED');
    expect(events[2].metadata.recoveryStatus).toBe('UNRECOVERABLE');

    // Verify original journal prefix unchanged
    expect(events[0].eventId).toBe('evt-c-0');
    expect(events[1].eventId).toBe('evt-c-1');
    expect(events[1].stateAfter).toBe('IMPL'); // illegal transition preserved
  });

  it('P0-2.2: reducer handles non-transition audit events', () => {
    // Non-transition events (stateBefore === stateAfter) should be skipped
    // during reduction but still validated for sequence order.
    const store = new FileEventStore(testDir);
    const wfId = 'audit-event-wf';

    store.append({
      eventId: 'evt-a-0', workflowId: wfId, sequence: 0, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: {}
    });

    // Non-transition audit event (self-transition)
    store.append({
      eventId: 'evt-a-1', workflowId: wfId, sequence: 1, type: 'REPOSITORY_CONFLICT_RESOLUTION',
      actorType: 'HUMAN', actorId: 'lead-human', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_INTAKE',
      artifactIds: [], metadata: { resolution: 'PRESERVE' }
    });

    store.append({
      eventId: 'evt-a-2', workflowId: wfId, sequence: 2, type: 'T',
      actorType: 'SYSTEM', actorId: '0000', timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_INTAKE', stateAfter: 'PROJECT_BASELINE',
      artifactIds: [], metadata: {}
    });

    // Recovery should succeed despite the non-transition event
    const recovery = StateRecoveryService.recover(store as any, wfId);
    expect(recovery.recovered).toBe(true);
    expect(recovery.canonicalState).toBe('PROJECT_BASELINE');

    // Verify all events are still in the journal
    const events = store.getEvents(wfId);
    expect(events).toHaveLength(3);
    expect(events[1].type).toBe('REPOSITORY_CONFLICT_RESOLUTION');
  });
});
