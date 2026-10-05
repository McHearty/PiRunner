import { WorkflowState } from './WorkflowState.js';
import { GuardDefinition, GUARDS } from './Guards.js';

export type HumanApprovalPolicy = 'ALWAYS' | 'ON_FIRST' | 'ON_LIMIT_EXCEEDED' | 'NEVER';

export interface SideEffectDefinition {
  id: string;
  description: string;
}

export interface TransitionDefinition {
  id: string;
  from: WorkflowState | '*';
  to: WorkflowState | '*';
  guards: GuardDefinition[];
  sideEffects: SideEffectDefinition[];
  humanApproval: HumanApprovalPolicy;
}

const g = (id: string): GuardDefinition => {
  const guard = GUARDS[id];
  if (!guard) {
    throw new Error(`Transition registry configuration failure: Guard [${id}] is not defined in GUARDS dictionary`);
  }
  return guard;
};

export const TRANSITION_REGISTRY: TransitionDefinition[] = [
  // §24 Project Entry Transitions
  { id: 'T-000', from: 'PROJECT_DISCOVERY', to: 'CONCEPT', guards: [g('G-PROJECT-001'), g('G-PROJECT-002'), g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-000', description: 'NEW_PROJECT_INIT' }], humanApproval: 'NEVER' },
  { id: 'T-001A', from: 'PROJECT_DISCOVERY', to: 'PROJECT_INTAKE', guards: [g('G-PROJECT-003'), g('G-PROJECT-004'), g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-001A', description: 'ADOPT_INTAKE_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-001B', from: 'PROJECT_DISCOVERY', to: 'STATE_RECOVERY', guards: [g('G-PROJECT-005'), g('G-PROJECT-006'), g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-001B', description: 'RESUME_RECOVERY_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-002A', from: 'PROJECT_INTAKE', to: 'PROJECT_BASELINE', guards: [g('G-REPO-001A'), g('G-PROJECT-007')], sideEffects: [{ id: 'SE-EVT-002A', description: 'BASELINE_ESTABLISHED' }], humanApproval: 'NEVER' },
  { id: 'T-002B', from: 'PROJECT_BASELINE', to: 'KNOWLEDGE_SYNC', guards: [g('G-PROJECT-008'), g('G-REPO-002A')], sideEffects: [{ id: 'SE-EVT-002B', description: 'ADOPTION_ADVANCED_TO_SYNC' }], humanApproval: 'NEVER' },
  { id: 'T-002C', from: 'KNOWLEDGE_SYNC', to: 'PLANNING', guards: [g('G-ART-022')], sideEffects: [{ id: 'SE-EVT-002C', description: 'ADOPTION_ADVANCED_TO_PLANNING' }], humanApproval: 'NEVER' },
  { id: 'T-003A', from: 'STATE_RECOVERY', to: 'STATE_VALIDATION', guards: [g('G-STATE-001'), g('G-STATE-002'), g('G-STATE-003')], sideEffects: [{ id: 'SE-EVT-003A', description: 'STATE_REPLAY_VALIDATED' }], humanApproval: 'NEVER' },
  { id: 'T-003B', from: 'STATE_VALIDATION', to: '*', guards: [g('G-STATE-006'), g('G-STATE-007'), g('G-STATE-008'), g('G-STATE-009'), g('G-STATE-010')], sideEffects: [{ id: 'SE-EVT-003B', description: 'RESUME_TO_CANONICAL' }], humanApproval: 'NEVER' },
  { id: 'T-003C', from: 'STATE_VALIDATION', to: 'REPOSITORY_CONFLICT', guards: [g('G-STATE-011')], sideEffects: [{ id: 'SE-EVT-003C', description: 'RESUME_MISMATCH_FROZEN' }], humanApproval: 'NEVER' },

  // §25 Concept Path
  { id: 'T-010', from: 'CONCEPT', to: 'CONCEPT_REVIEW', guards: [g('G-ART-001')], sideEffects: [{ id: 'SE-EVT-010', description: 'CONCEPT_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-011', from: 'CONCEPT_REVIEW', to: 'SPECIFICATION', guards: [g('G-ART-003')], sideEffects: [{ id: 'SE-EVT-011', description: 'CONCEPT_ACCEPTED' }], humanApproval: 'ALWAYS' },
  { id: 'T-012', from: 'CONCEPT_REVIEW', to: 'HUMAN_GATE', guards: [g('G-ART-005')], sideEffects: [{ id: 'SE-EVT-012', description: 'CONCEPT_REJECTED' }], humanApproval: 'ALWAYS' },

  // §26 Specification Path
  { id: 'T-020', from: 'SPECIFICATION', to: 'SPECIFICATION_REVIEW', guards: [g('G-ART-010')], sideEffects: [{ id: 'SE-EVT-020', description: 'SPEC_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-021', from: 'SPECIFICATION_REVIEW', to: 'PLANNING', guards: [g('G-ART-013')], sideEffects: [{ id: 'SE-EVT-021', description: 'SPEC_ACCEPTED' }], humanApproval: 'ALWAYS' },
  { id: 'T-022', from: 'SPECIFICATION_REVIEW', to: 'HUMAN_GATE', guards: [g('G-ART-015')], sideEffects: [{ id: 'SE-EVT-022', description: 'SPEC_REJECTED' }], humanApproval: 'ALWAYS' },

  // §27 Planning & Knowledge Path
  { id: 'T-030', from: 'PLANNING', to: 'KNOWLEDGE_SYNC', guards: [g('G-ART-020')], sideEffects: [{ id: 'SE-EVT-030', description: 'PLAN_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-030B', from: 'PLANNING', to: 'SPRINT_READY', guards: [g('G-ART-020'), g('G-ART-022')], sideEffects: [{ id: 'SE-EVT-030B', description: 'PLAN_APPROVED_SPRINT_READY' }], humanApproval: 'ALWAYS' },
  { id: 'T-031', from: 'KNOWLEDGE_SYNC', to: 'SPRINT_READY', guards: [g('G-ART-022')], sideEffects: [{ id: 'SE-EVT-031', description: 'KNOWLEDGE_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-032', from: 'KNOWLEDGE_SYNC', to: 'HUMAN_GATE', guards: [g('G-KNOW-005')], sideEffects: [{ id: 'SE-EVT-032', description: 'KNOWLEDGE_STALE' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // §28 Test Authoring Path
  { id: 'T-040', from: 'SPRINT_READY', to: 'TEST_AUTHORING', guards: [g('G-ART-023'), g('G-ART-024'), g('G-TEST-001'), g('G-REPO-012')], sideEffects: [{ id: 'SE-EVT-040', description: 'TEST_AUTH_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-041', from: 'TEST_AUTHORING', to: 'TEST_READY', guards: [g('G-ART-025'), g('G-TEST-006'), g('G-TEST-007')], sideEffects: [{ id: 'SE-EVT-041', description: 'TESTS_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-042', from: 'TEST_AUTHORING', to: 'TRIAGE', guards: [g('G-TEST-010')], sideEffects: [{ id: 'SE-EVT-042', description: 'TEST_AUTH_BLOCKED' }], humanApproval: 'NEVER' },
  { id: 'T-043', from: 'TEST_AUTHORING', to: 'HUMAN_GATE', guards: [g('G-CFG-009')], sideEffects: [{ id: 'SE-EVT-043', description: 'TEST_AUTH_LIMIT' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // §33 Implementation Path
  { id: 'T-050', from: 'TEST_READY', to: 'IMPLEMENTATION', guards: [g('G-ART-030'), g('G-ART-034'), g('G-TEST-012'), g('G-REPO-001')], sideEffects: [{ id: 'SE-EVT-050', description: 'IMPL_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-051', from: 'IMPLEMENTATION', to: 'COMMIT_CREATED', guards: [g('G-ART-031'), g('G-ART-032'), g('G-TEST-013'), g('G-REPO-003')], sideEffects: [{ id: 'SE-EVT-051', description: 'COMMIT_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-052', from: 'IMPLEMENTATION', to: 'TRIAGE', guards: [g('G-STUCK-001')], sideEffects: [{ id: 'SE-EVT-052', description: 'IMPL_STUCK' }], humanApproval: 'NEVER' },
  { id: 'T-053', from: 'IMPLEMENTATION', to: 'AGENT_FAILED', guards: [g('G-RUN-001')], sideEffects: [{ id: 'SE-EVT-053', description: 'AGENT_CRASHED' }], humanApproval: 'NEVER' },
  { id: 'T-054', from: 'IMPLEMENTATION', to: 'HUMAN_GATE', guards: [g('G-CFG-002')], sideEffects: [{ id: 'SE-EVT-054', description: 'IMPL_LIMIT_EXCEEDED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // §34 Triage Path
  { id: 'T-060', from: 'TRIAGE', to: 'IMPLEMENTATION', guards: [g('G-ART-040')], sideEffects: [{ id: 'SE-EVT-060', description: 'RESUME_IMPL' }], humanApproval: 'NEVER' },
  { id: 'T-061', from: 'TRIAGE', to: 'SPECIFICATION_REVIEW', guards: [g('G-ART-042')], sideEffects: [{ id: 'SE-EVT-061', description: 'SPEC_DEFECT_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-062', from: 'TRIAGE', to: 'PLANNING', guards: [g('G-ART-044')], sideEffects: [{ id: 'SE-EVT-062', description: 'REPLAN_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-063', from: 'TRIAGE', to: 'KNOWLEDGE_SYNC', guards: [g('G-ART-045')], sideEffects: [{ id: 'SE-EVT-063', description: 'KNOWLEDGE_UPDATE_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-064', from: 'TRIAGE', to: 'TEST_AUTHORING', guards: [g('G-ART-048')], sideEffects: [{ id: 'SE-EVT-064', description: 'TEST_DEFECT_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-065', from: 'TRIAGE', to: 'HUMAN_GATE', guards: [g('G-ART-046')], sideEffects: [{ id: 'SE-EVT-065', description: 'TRIAGE_LIMIT_ROUTED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-066', from: 'TRIAGE', to: 'ABORT', guards: [g('G-ART-047')], sideEffects: [{ id: 'SE-EVT-066', description: 'ABORT_DECIDED' }], humanApproval: 'ALWAYS' },

  // §35 Review Path
  { id: 'T-070', from: 'COMMIT_CREATED', to: 'REVIEW', guards: [g('G-ART-050'), g('G-TEST-016')], sideEffects: [{ id: 'SE-EVT-070', description: 'REVIEW_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-071', from: 'REVIEW', to: 'SPRINT_ACCEPTED', guards: [g('G-ART-051'), g('G-TEST-019')], sideEffects: [{ id: 'SE-EVT-071', description: 'SPRINT_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-072', from: 'REVIEW', to: 'REWORK', guards: [g('G-ART-055')], sideEffects: [{ id: 'SE-EVT-072', description: 'REWORK_REQUESTED' }], humanApproval: 'NEVER' },
  { id: 'T-073', from: 'REVIEW', to: 'TRIAGE', guards: [g('G-ART-056')], sideEffects: [{ id: 'SE-EVT-073', description: 'REVIEW_BLOCKED' }], humanApproval: 'NEVER' },
  { id: 'T-074', from: 'REVIEW', to: 'HUMAN_GATE', guards: [g('G-CFG-005')], sideEffects: [{ id: 'SE-EVT-074', description: 'REWORK_LIMIT_EXCEEDED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-075', from: 'REWORK', to: 'IMPLEMENTATION', guards: [g('G-ART-057')], sideEffects: [{ id: 'SE-EVT-075', description: 'REWORK_STARTED' }], humanApproval: 'NEVER' },

  // §36 Publication Path
  { id: 'T-080', from: 'SPRINT_ACCEPTED', to: 'PUSH_GATE', guards: [g('G-ART-060'), g('G-REPO-006')], sideEffects: [{ id: 'SE-EVT-080', description: 'PUSH_GATE_ENTERED' }], humanApproval: 'NEVER' },
  { id: 'T-081', from: 'PUSH_GATE', to: 'REMOTE_PUBLISHED', guards: [g('G-HUMAN-001')], sideEffects: [{ id: 'SE-REPO-003', description: 'git push' }], humanApproval: 'ALWAYS' },
  { id: 'T-082', from: 'PUSH_GATE', to: 'HUMAN_GATE', guards: [g('G-REPO-008')], sideEffects: [{ id: 'SE-EVT-082', description: 'PRE_PUSH_FAILED' }], humanApproval: 'ALWAYS' },
  { id: 'T-083', from: 'REMOTE_PUBLISHED', to: 'SPRINT_COMPLETE', guards: [g('G-REPO-009')], sideEffects: [{ id: 'SE-EVT-083', description: 'REMOTE_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-084', from: 'SPRINT_COMPLETE', to: 'SPRINT_READY', guards: [g('G-PLAN-001')], sideEffects: [{ id: 'SE-EVT-084', description: 'NEXT_SPRINT' }], humanApproval: 'NEVER' },
  { id: 'T-085', from: 'SPRINT_COMPLETE', to: 'DAY_COMPLETE', guards: [g('G-TIME-001')], sideEffects: [{ id: 'SE-EVT-085', description: 'DAY_BOUNDARY' }], humanApproval: 'NEVER' },

  // §37 Diary, Skill Architect & Publication
  { id: 'T-090', from: 'DAY_COMPLETE', to: 'DIARY', guards: [g('G-EVT-001')], sideEffects: [{ id: 'SE-EVT-090', description: 'DIARY_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-091', from: 'DIARY', to: 'PUBLICATION_READY', guards: [g('G-ART-070')], sideEffects: [{ id: 'SE-EVT-091', description: 'DEVLOG_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-092', from: 'DIARY', to: 'PUBLISHED', guards: [g('G-ART-071')], sideEffects: [{ id: 'SE-EVT-092', description: 'NO_PUB_REQUESTED' }], humanApproval: 'NEVER' },
  { id: 'T-093', from: 'PUBLICATION_READY', to: 'PUBLISHED', guards: [g('G-ART-072'), g('G-HUMAN-002')], sideEffects: [{ id: 'SE-EVT-093', description: 'PACKAGE_PUBLISHED' }], humanApproval: 'ALWAYS' },
  { id: 'T-094', from: 'DIARY', to: 'SKILL_SYNTHESIS', guards: [g('G-EVT-001')], sideEffects: [{ id: 'SE-EVT-094', description: 'SKILL_SYNTHESIS_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-095', from: 'SKILL_SYNTHESIS', to: 'PUBLICATION_READY', guards: [g('G-SKILL-001')], sideEffects: [{ id: 'SE-EVT-095', description: 'SKILL_ACCEPTED' }], humanApproval: 'ALWAYS' },
  { id: 'T-096', from: 'PLANNING', to: 'SKILL_SYNTHESIS', guards: [g('G-ART-020')], sideEffects: [{ id: 'SE-EVT-096', description: 'DIRECT_SKILL_CURATION' }], humanApproval: 'ALWAYS' },
  { id: 'T-097', from: 'SKILL_SYNTHESIS', to: 'PLANNING', guards: [g('G-SKILL-001')], sideEffects: [{ id: 'SE-EVT-097', description: 'RETURN_TO_PLANNING' }], humanApproval: 'NEVER' },

  // §38 Failure, Conflict Resolution & Recovery Transitions
  { id: 'T-100', from: '*', to: 'ARTIFACT_INVALID', guards: [g('G-VAL-001')], sideEffects: [{ id: 'SE-EVT-100', description: 'VALIDATION_FAILED' }], humanApproval: 'NEVER' },
  { id: 'T-101', from: 'ARTIFACT_INVALID', to: 'HUMAN_GATE', guards: [g('G-CFG-006')], sideEffects: [{ id: 'SE-EVT-101', description: 'ARTIFACT_LIMIT' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-102', from: '*', to: 'REPOSITORY_CONFLICT', guards: [g('G-REPO-010')], sideEffects: [{ id: 'SE-EVT-102', description: 'CONFLICT_FREEZE' }], humanApproval: 'NEVER' },
  { id: 'T-103', from: 'REPOSITORY_CONFLICT', to: 'HUMAN_GATE', guards: [g('G-REPO-011')], sideEffects: [{ id: 'SE-EVT-103', description: 'CONFLICT_ESCALATE' }], humanApproval: 'ALWAYS' },
  { id: 'T-103A', from: 'REPOSITORY_CONFLICT', to: 'PROJECT_INTAKE', guards: [g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-103A', description: 'CONFLICT_RESOLVED_ADOPTION_PRESERVE' }], humanApproval: 'ALWAYS' },
  { id: 'T-103B', from: 'REPOSITORY_CONFLICT', to: 'STATE_VALIDATION', guards: [g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-103B', description: 'CONFLICT_RESOLVED_RETRY_VALIDATION' }], humanApproval: 'ALWAYS' },
  { id: 'T-103C', from: 'REPOSITORY_CONFLICT', to: 'KNOWLEDGE_SYNC', guards: [g('G-REPO-000')], sideEffects: [{ id: 'SE-EVT-103C', description: 'CONFLICT_RESOLVED_DIRECT_KNOWLEDGE' }], humanApproval: 'ALWAYS' },
  { id: 'T-104', from: 'AGENT_FAILED', to: 'TRIAGE', guards: [g('G-RUN-002')], sideEffects: [{ id: 'SE-EVT-104', description: 'AGENT_TRIAGE' }], humanApproval: 'NEVER' },
  { id: 'T-105', from: 'AGENT_FAILED', to: 'HUMAN_GATE', guards: [g('G-RUN-003')], sideEffects: [{ id: 'SE-EVT-105', description: 'AGENT_ESCALATE' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-106', from: '*', to: 'ABORT', guards: [g('G-HUMAN-003')], sideEffects: [{ id: 'SE-EVT-106', description: 'WORKFLOW_ABORTED' }], humanApproval: 'ALWAYS' }
];

export function findTransition(from: WorkflowState, to: WorkflowState): TransitionDefinition | undefined {
  const exact = TRANSITION_REGISTRY.find(t => t.from === from && t.to === to);
  if (exact) return exact;

  const fromMatch = TRANSITION_REGISTRY.find(t => t.from === from && t.to === '*');
  if (fromMatch) return fromMatch;

  const toMatch = TRANSITION_REGISTRY.find(t => t.from === '*' && t.to === to);
  if (toMatch) return toMatch;

  return TRANSITION_REGISTRY.find(t => t.from === '*' && t.to === '*');
}

export function getAllowedTargetStates(from: WorkflowState): WorkflowState[] {
  return TRANSITION_REGISTRY
    .filter(t => t.from === from || t.from === '*')
    .map(t => t.to as WorkflowState);
}

export function isTransitionLegal(from: WorkflowState, to: WorkflowState): boolean {
  return findTransition(from, to) !== undefined;
}
