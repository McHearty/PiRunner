import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore } from '../../../src/domain/events/EventStore.js';

describe('Planning Intent Gate (Sprint A + B)', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = new EventStore();
  });

  it('establishes GOVERNED_FEATURE intent and persists to event store', () => {
    const workflowId = 'test-intent-governed';

    // Simulate intent establishment
    eventStore.append({
      eventId: `evt-${workflowId}-planning-intent-1`,
      workflowId,
      sequence: 0,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING',
      stateAfter: 'PLANNING',
      artifactIds: [],
      metadata: { intent: 'GOVERNED_FEATURE' }
    });

    // Verify intent is persisted
    const events = eventStore.getEvents(workflowId);
    const intentEvents = events.filter(e => e.type === 'PLANNING_INTENT_ESTABLISHED');
    expect(intentEvents.length).toBe(1);
    expect(intentEvents[0].metadata?.intent).toBe('GOVERNED_FEATURE');
  });

  it('establishes SURGICAL_CHANGE intent and persists to event store', () => {
    const workflowId = 'test-intent-surgical';

    // Simulate intent establishment
    eventStore.append({
      eventId: `evt-${workflowId}-planning-intent-2`,
      workflowId,
      sequence: 0,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING',
      stateAfter: 'PLANNING',
      artifactIds: [],
      metadata: { intent: 'SURGICAL_CHANGE' }
    });

    // Verify intent is persisted
    const events = eventStore.getEvents(workflowId);
    const intentEvents = events.filter(e => e.type === 'PLANNING_INTENT_ESTABLISHED');
    expect(intentEvents.length).toBe(1);
    expect(intentEvents[0].metadata?.intent).toBe('SURGICAL_CHANGE');
  });

  it('establishes CREATE_SPECIFICATION intent (Sprint B)', () => {
    const workflowId = 'test-intent-create-spec';

    // Simulate intent establishment
    eventStore.append({
      eventId: `evt-${workflowId}-planning-intent-4`,
      workflowId,
      sequence: 0,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING',
      stateAfter: 'PLANNING',
      artifactIds: [],
      metadata: { intent: 'CREATE_SPECIFICATION' }
    });

    // Verify intent is persisted
    const events = eventStore.getEvents(workflowId);
    const intentEvents = events.filter(e => e.type === 'PLANNING_INTENT_ESTABLISHED');
    expect(intentEvents.length).toBe(1);
    expect(intentEvents[0].metadata?.intent).toBe('CREATE_SPECIFICATION');
  });

  it('restores planning intent from event history on resume', () => {
    const workflowId = 'test-intent-resume';

    // First establish intent
    eventStore.append({
      eventId: `evt-${workflowId}-planning-intent-3`,
      workflowId,
      sequence: 0,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead-human',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING',
      stateAfter: 'PLANNING',
      artifactIds: [],
      metadata: { intent: 'GOVERNED_FEATURE' }
    });

    // Simulate resume by reading events back
    const events = eventStore.getEvents(workflowId);
    let restoredIntent: string | null = null;
    for (const evt of events) {
      if (evt.type === 'PLANNING_INTENT_ESTABLISHED') {
        restoredIntent = (evt.metadata as any)?.intent;
        break;
      }
    }

    expect(restoredIntent).toBe('GOVERNED_FEATURE');
  });
});