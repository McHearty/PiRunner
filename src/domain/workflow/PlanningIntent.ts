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
  action: 'specification' | 'surgical' | 'continue';
  payload?: any;
}

export async function promptPlanningIntentGate(
  ui: any,
  artifactStore: any,
  sprintSpec: any
): Promise<PlanningIntentResult> {
  // Check if MasterSpecification exists
  const masterSpec = artifactStore.getLatestAccepted('MasterSpecification');

  if (masterSpec) {
    // Governing spec exists — proceed normally
    return { action: 'surgical' }; // Use 'surgical' as "proceed normally"
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
        id: 'continue',
        label: 'Continue planning',
        detail: 'Return to planning discussion without formalizing.'
      }
    ]
  );

  if (choice === 'surgical') {
    // Mark SprintSpecification as surgical
    const payload = {
      ...sprintSpec.payload,
      surgicalChange: true,
      noGoverningSpec: true,
      declaredAt: new Date().toISOString()
    };
    return { action: 'surgical', payload };
  }

  return { action: choice };
}
