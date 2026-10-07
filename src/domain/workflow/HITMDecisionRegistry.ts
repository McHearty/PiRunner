/**
 * HITM Decision Registry
 *
 * First-class declaration of every human decision boundary in the workflow.
 * Maps transition IDs to the decision UI that presents them.
 *
 * This is the canonical source of truth for which transitions require
 * explicit HITM presentation vs. generic-command-only paths.
 */

export interface HITMDecision {
  transitionIds: string[];
  decisionName: string;
  state: string;
  choices: { id: string; label: string; targetTransition?: string }[];
}

export const HITM_DECISION_REGISTRY: HITMDecision[] = [
  {
    transitionIds: ['T-011', 'T-012'],
    decisionName: 'Concept Review Decision',
    state: 'CONCEPT_REVIEW',
    choices: [
      { id: 'accept', label: 'Accept concept', targetTransition: 'T-011' },
      { id: 'reject', label: 'Reject/unresolved', targetTransition: 'T-012' }
    ]
  },
  {
    transitionIds: ['T-021', 'T-022'],
    decisionName: 'Specification Review Decision',
    state: 'SPECIFICATION_REVIEW',
    choices: [
      { id: 'accept', label: 'Accept specification', targetTransition: 'T-021' },
      { id: 'reject', label: 'Reject/unresolved', targetTransition: 'T-022' }
    ]
  },
  {
    transitionIds: ['T-030B'],
    decisionName: 'Planning Intent Gate',
    state: 'PLANNING',
    choices: [
      { id: 'specification', label: 'Create/revise MasterSpecification', targetTransition: 'T-035' },
      { id: 'surgical', label: 'Declare surgical change', targetTransition: 'T-030B' },
      { id: 'skill_curation', label: 'Curate reusable skill', targetTransition: 'T-096' },
      { id: 'continue', label: 'Continue planning' }
    ]
  },
  {
    transitionIds: ['T-096'],
    decisionName: 'Skill Curation Decision',
    state: 'PLANNING',
    choices: [
      { id: 'curate', label: 'Curate skill', targetTransition: 'T-096' }
    ]
  },
  {
    transitionIds: ['T-081', 'T-082'],
    decisionName: 'Push Decision Gate',
    state: 'PUSH_GATE',
    choices: [
      { id: 'push', label: 'Push to remote', targetTransition: 'T-081' },
      { id: 'hold', label: 'Hold locally', targetTransition: 'T-082' }
    ]
  },
  {
    transitionIds: ['T-084', 'T-085'],
    decisionName: 'Sprint Complete Decision',
    state: 'SPRINT_COMPLETE',
    choices: [
      { id: 'next_sprint', label: 'Begin next sprint', targetTransition: 'T-084' },
      { id: 'end_day', label: 'End workday', targetTransition: 'T-085' }
    ]
  },
  {
    transitionIds: ['T-095', 'T-097'],
    decisionName: 'Skill Publication Decision',
    state: 'SKILL_SYNTHESIS',
    choices: [
      { id: 'publish', label: 'Publish skill', targetTransition: 'T-095' },
      { id: 'keep_local', label: 'Keep local', targetTransition: 'T-097' }
    ]
  },
  {
    transitionIds: ['T-093'],
    decisionName: 'Publication Decision Gate',
    state: 'PUBLICATION_READY',
    choices: [
      { id: 'publish', label: 'Publish release', targetTransition: 'T-093' },
      { id: 'hold', label: 'Hold' }
    ]
  },
  {
    transitionIds: ['T-091', 'T-092', 'T-094'],
    decisionName: 'Diary Decision',
    state: 'DIARY',
    choices: [
      { id: 'publish', label: 'Publish devlog', targetTransition: 'T-091' },
      { id: 'skill', label: 'Skill synthesis', targetTransition: 'T-094' },
      { id: 'complete', label: 'Complete/skip' }
    ]
  }
];

/**
 * Explicitly registered exceptional transitions that are intentionally
 * generic-command-only (not natural workflow decisions).
 */
export const EXCEPTIONAL_TRANSITIONS = new Set([
  'T-066',   // TRIAGE → ABORT
  'T-106',   // * → ABORT
  'T-103',   // REPOSITORY_CONFLICT → HUMAN_GATE (recovery)
  'T-103A',  // REPOSITORY_CONFLICT → PROJECT_INTAKE (recovery)
  'T-103B',  // REPOSITORY_CONFLICT → STATE_VALIDATION (recovery)
  'T-103C'   // REPOSITORY_CONFLICT → KNOWLEDGE_SYNC (recovery)
]);
