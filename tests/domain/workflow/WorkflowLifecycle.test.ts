import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { WorkflowIdentityService, WorkflowIdentity } from '../../../src/domain/workflow/WorkflowIdentity.js';
import { FileEventStore } from '../../../src/infrastructure/events/FileEventStore.js';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
    
    // Archive old workflow
    store.append({
      eventId: 'evt-old-archived',
      workflowId: 'old-workflow',
      sequence: 2,
      type: 'WORKFLOW_ARCHIVED',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY',
      stateAfter: 'PROJECT_DISCOVERY',
      artifactIds: [],
      metadata: { reason: 'human_requested_new_workflow' }
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
    expect(oldWorkflowEvents[2].type).toBe('WORKFLOW_ARCHIVED');
    
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
});
