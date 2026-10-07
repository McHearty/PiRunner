/**
 * Planning Intent Gate
 *
 * Presents the human with the planning intent decision when:
 * - The Planning agent produces a SprintSpecification
 * - No accepted MasterSpecification exists
 *
 * Choices:
 * - Create/revise MasterSpecification (transition to SPECIFICATION via T-035)
 * - Declare surgical change (mark SprintSpecification, proceed to SPRINT_READY via T-030B)
 * - Continue planning (stay in PLANNING)
 */



export interface PlanningIntentResult {
  action: 'specification' | 'surgical' | 'skill_curation' | 'continue';
  payload?: any;
}

export async function promptPlanningIntentGate(
  ui: any,
  artifactStore: any,
  eventStore: any,
  workflowId: string,
  sprintSpec: any
): Promise<PlanningIntentResult> {
  // Check if MasterSpecification exists (workflow-scoped)
  const masterSpec = artifactStore.getLatestAccepted('MasterSpecification', workflowId);

  if (masterSpec) {
    // Governing spec exists — proceed normally
    return { action: 'surgical' }; // 'surgical' here means "proceed to SPRINT_READY"
  }

  // No governing spec — present intent gate
  const choice = await ui.select(
    'Planning Intent Gate',
    'No governing MasterSpecification exists for this workflow.\n\nHow should this sprint proceed?',
    [
      {
        id: 'specification',
        label: 'Create/revise MasterSpecification',
        detail: 'Author or revise the governing specification before proceeding.'
      },
      {
        id: 'surgical',
        label: 'Declare surgical change',
        detail: 'Proceed as a bounded, self-contained change with explicit scope declaration.'
      },
      {
        id: 'skill_curation',
        label: 'Curate reusable skill',
        detail: 'Identify recurring patterns and synthesize a reusable agent skill.'
      },
      {
        id: 'continue',
        label: 'Continue planning',
        detail: 'Return to planning discussion without formalizing.'
      }
    ]
  );

  if (choice === 'surgical') {
    // Persist surgical intent as canonical event
    const sequence = eventStore.getNextSequence(workflowId);
    eventStore.append({
      eventId: `evt-${workflowId}-${sequence}`,
      workflowId: workflowId,
      sequence: sequence,
      type: 'PLANNING_INTENT_ESTABLISHED',
      actorType: 'HUMAN',
      actorId: 'lead',
      timestamp: new Date().toISOString(),
      stateBefore: 'PLANNING' as any,
      stateAfter: 'PLANNING' as any,
      artifactIds: [sprintSpec.artifactId],
      metadata: {
        intent: 'SURGICAL_CHANGE',
        declaredAt: new Date().toISOString()
      }
    });
    return { action: 'surgical' };
  }

  return { action: choice };
}
