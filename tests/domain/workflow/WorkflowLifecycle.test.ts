import { describe, it, expect, afterAll } from 'vitest';
import { WorkflowIdentityService, WorkflowIdentity } from '../../../src/domain/workflow/WorkflowIdentity.js';
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
});
