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
  to: WorkflowState;
  guards: GuardDefinition[];
  sideEffects: SideEffectDefinition[];
  humanApproval: HumanApprovalPolicy;
}

const g = (id: string): GuardDefinition => GUARDS[id] ?? { id, description: id };

export const TRANSITION_REGISTRY: readonly TransitionDefinition[] = [
  // 11.1 Concept Path
  { id: 'T-001', from: 'CONCEPT', to: 'CONCEPT_REVIEW', guards: [g('G-ART-001')], sideEffects: [{ id: 'SE-EVT-001', description: 'CONCEPT_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-002', from: 'CONCEPT_REVIEW', to: 'SPECIFICATION', guards: [g('G-ART-003')], sideEffects: [{ id: 'SE-EVT-002', description: 'CONCEPT_ACCEPTED' }], humanApproval: 'ALWAYS' },
  { id: 'T-003', from: 'CONCEPT_REVIEW', to: 'HUMAN_GATE', guards: [g('G-ART-005')], sideEffects: [{ id: 'SE-EVT-003', description: 'CONCEPT_REJECTED' }], humanApproval: 'ALWAYS' },

  // 11.2 Specification Path
  { id: 'T-010', from: 'SPECIFICATION', to: 'SPECIFICATION_REVIEW', guards: [g('G-ART-010')], sideEffects: [{ id: 'SE-EVT-010', description: 'SPEC_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-011', from: 'SPECIFICATION_REVIEW', to: 'PLANNING', guards: [g('G-ART-013')], sideEffects: [{ id: 'SE-EVT-011', description: 'SPEC_ACCEPTED' }], humanApproval: 'ALWAYS' },
  { id: 'T-012', from: 'SPECIFICATION_REVIEW', to: 'HUMAN_GATE', guards: [g('G-ART-015')], sideEffects: [{ id: 'SE-EVT-012', description: 'SPEC_REJECTED' }], humanApproval: 'ALWAYS' },

  // 11.3 Planning & Knowledge
  { id: 'T-020', from: 'PLANNING', to: 'KNOWLEDGE_SYNC', guards: [g('G-ART-020')], sideEffects: [{ id: 'SE-EVT-020', description: 'PLAN_SUBMITTED' }], humanApproval: 'NEVER' },
  { id: 'T-021', from: 'KNOWLEDGE_SYNC', to: 'SPRINT_READY', guards: [g('G-ART-022')], sideEffects: [{ id: 'SE-EVT-021', description: 'KNOWLEDGE_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-022', from: 'KNOWLEDGE_SYNC', to: 'HUMAN_GATE', guards: [g('G-KNOW-005')], sideEffects: [{ id: 'SE-EVT-022', description: 'KNOWLEDGE_STALE' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // 11.4 Test Authoring Path
  { id: 'T-023', from: 'SPRINT_READY', to: 'TEST_AUTHORING', guards: [g('G-ART-023'), g('G-ART-024'), g('G-TEST-001'), g('G-REPO-012')], sideEffects: [{ id: 'SE-EVT-023', description: 'TEST_AUTH_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-024', from: 'TEST_AUTHORING', to: 'TEST_READY', guards: [g('G-ART-025'), g('G-TEST-006'), g('G-TEST-007')], sideEffects: [{ id: 'SE-EVT-024', description: 'TESTS_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-025', from: 'TEST_AUTHORING', to: 'TRIAGE', guards: [g('G-TEST-010')], sideEffects: [{ id: 'SE-EVT-025', description: 'TEST_AUTH_BLOCKED' }], humanApproval: 'NEVER' },
  { id: 'T-026', from: 'TEST_AUTHORING', to: 'HUMAN_GATE', guards: [g('G-CFG-009')], sideEffects: [{ id: 'SE-EVT-026', description: 'TEST_AUTH_LIMIT' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // 11.5 Implementation Path
  { id: 'T-030', from: 'TEST_READY', to: 'IMPLEMENTATION', guards: [g('G-ART-030'), g('G-ART-034'), g('G-TEST-012'), g('G-REPO-001')], sideEffects: [{ id: 'SE-EVT-030', description: 'IMPL_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-031', from: 'IMPLEMENTATION', to: 'COMMIT_CREATED', guards: [g('G-ART-031'), g('G-ART-032'), g('G-TEST-013'), g('G-REPO-003')], sideEffects: [{ id: 'SE-EVT-031', description: 'COMMIT_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-032', from: 'IMPLEMENTATION', to: 'TRIAGE', guards: [g('G-STUCK-001')], sideEffects: [{ id: 'SE-EVT-032', description: 'IMPL_STUCK' }], humanApproval: 'NEVER' },
  { id: 'T-033', from: 'IMPLEMENTATION', to: 'AGENT_FAILED', guards: [g('G-RUN-001')], sideEffects: [{ id: 'SE-EVT-033', description: 'AGENT_CRASHED' }], humanApproval: 'NEVER' },
  { id: 'T-034', from: 'IMPLEMENTATION', to: 'HUMAN_GATE', guards: [g('G-CFG-002')], sideEffects: [{ id: 'SE-EVT-034', description: 'IMPL_LIMIT_EXCEEDED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },

  // 11.6 Triage Path
  { id: 'T-040', from: 'TRIAGE', to: 'IMPLEMENTATION', guards: [g('G-ART-040')], sideEffects: [{ id: 'SE-EVT-040', description: 'RESUME_IMPL' }], humanApproval: 'NEVER' },
  { id: 'T-041', from: 'TRIAGE', to: 'SPECIFICATION_REVIEW', guards: [g('G-ART-042')], sideEffects: [{ id: 'SE-EVT-041', description: 'SPEC_DEFECT_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-042', from: 'TRIAGE', to: 'PLANNING', guards: [g('G-ART-044')], sideEffects: [{ id: 'SE-EVT-042', description: 'REPLAN_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-043', from: 'TRIAGE', to: 'KNOWLEDGE_SYNC', guards: [g('G-ART-045')], sideEffects: [{ id: 'SE-EVT-043', description: 'KNOWLEDGE_UPDATE_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-044', from: 'TRIAGE', to: 'TEST_AUTHORING', guards: [g('G-ART-048')], sideEffects: [{ id: 'SE-EVT-046', description: 'TEST_DEFECT_ROUTED' }], humanApproval: 'NEVER' },
  { id: 'T-045', from: 'TRIAGE', to: 'HUMAN_GATE', guards: [g('G-ART-046')], sideEffects: [{ id: 'SE-EVT-044', description: 'TRIAGE_LIMIT_ROUTED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-046', from: 'TRIAGE', to: 'ABORT', guards: [g('G-ART-047')], sideEffects: [{ id: 'SE-EVT-045', description: 'ABORT_DECIDED' }], humanApproval: 'ALWAYS' },

  // 11.7 Review Path
  { id: 'T-050', from: 'COMMIT_CREATED', to: 'REVIEW', guards: [g('G-ART-050'), g('G-TEST-016')], sideEffects: [{ id: 'SE-EVT-050', description: 'REVIEW_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-051', from: 'REVIEW', to: 'SPRINT_ACCEPTED', guards: [g('G-ART-051'), g('G-TEST-019')], sideEffects: [{ id: 'SE-EVT-051', description: 'SPRINT_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-052', from: 'REVIEW', to: 'REWORK', guards: [g('G-ART-055')], sideEffects: [{ id: 'SE-EVT-052', description: 'REWORK_REQUESTED' }], humanApproval: 'NEVER' },
  { id: 'T-053', from: 'REVIEW', to: 'TRIAGE', guards: [g('G-ART-056')], sideEffects: [{ id: 'SE-EVT-053', description: 'REVIEW_BLOCKED' }], humanApproval: 'NEVER' },
  { id: 'T-054', from: 'REVIEW', to: 'HUMAN_GATE', guards: [g('G-CFG-005')], sideEffects: [{ id: 'SE-EVT-054', description: 'REWORK_LIMIT_EXCEEDED' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-055', from: 'REWORK', to: 'IMPLEMENTATION', guards: [g('G-ART-057')], sideEffects: [{ id: 'SE-EVT-055', description: 'REWORK_STARTED' }], humanApproval: 'NEVER' },

  // 11.8 Publication Path
  { id: 'T-060', from: 'SPRINT_ACCEPTED', to: 'PUSH_GATE', guards: [g('G-ART-060'), g('G-REPO-006')], sideEffects: [{ id: 'SE-EVT-060', description: 'PUSH_GATE_ENTERED' }], humanApproval: 'NEVER' },
  { id: 'T-061', from: 'PUSH_GATE', to: 'REMOTE_PUBLISHED', guards: [g('G-HUMAN-001')], sideEffects: [{ id: 'SE-REPO-003', description: 'git push' }], humanApproval: 'ALWAYS' },
  { id: 'T-062', from: 'PUSH_GATE', to: 'HUMAN_GATE', guards: [g('G-REPO-008')], sideEffects: [{ id: 'SE-EVT-062', description: 'PRE_PUSH_FAILED' }], humanApproval: 'ALWAYS' },
  { id: 'T-063', from: 'REMOTE_PUBLISHED', to: 'SPRINT_COMPLETE', guards: [g('G-REPO-009')], sideEffects: [{ id: 'SE-EVT-063', description: 'REMOTE_VERIFIED' }], humanApproval: 'NEVER' },
  { id: 'T-064', from: 'SPRINT_COMPLETE', to: 'SPRINT_READY', guards: [g('G-PLAN-001')], sideEffects: [{ id: 'SE-EVT-064', description: 'NEXT_SPRINT' }], humanApproval: 'NEVER' },
  { id: 'T-065', from: 'SPRINT_COMPLETE', to: 'DAY_COMPLETE', guards: [g('G-TIME-001')], sideEffects: [{ id: 'SE-EVT-065', description: 'DAY_BOUNDARY' }], humanApproval: 'NEVER' },

  // 11.9 Diary & Publication
  { id: 'T-070', from: 'DAY_COMPLETE', to: 'DIARY', guards: [g('G-EVT-001')], sideEffects: [{ id: 'SE-EVT-070', description: 'DIARY_STARTED' }], humanApproval: 'NEVER' },
  { id: 'T-071', from: 'DIARY', to: 'PUBLICATION_READY', guards: [g('G-ART-070')], sideEffects: [{ id: 'SE-EVT-071', description: 'DEVLOG_ACCEPTED' }], humanApproval: 'NEVER' },
  { id: 'T-072', from: 'DIARY', to: 'PUBLISHED', guards: [g('G-ART-071')], sideEffects: [{ id: 'SE-EVT-072', description: 'NO_PUB_REQUESTED' }], humanApproval: 'NEVER' },
  { id: 'T-073', from: 'PUBLICATION_READY', to: 'PUBLISHED', guards: [g('G-ART-072'), g('G-HUMAN-002')], sideEffects: [{ id: 'SE-EVT-073', description: 'PACKAGE_PUBLISHED' }], humanApproval: 'ALWAYS' },

  // 11.10 Failure & Recovery
  { id: 'T-080', from: '*', to: 'ARTIFACT_INVALID', guards: [g('G-VAL-001')], sideEffects: [{ id: 'SE-EVT-080', description: 'VALIDATION_FAILED' }], humanApproval: 'NEVER' },
  { id: 'T-081', from: 'ARTIFACT_INVALID', to: 'HUMAN_GATE', guards: [g('G-CFG-006')], sideEffects: [{ id: 'SE-EVT-081', description: 'ARTIFACT_LIMIT' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-082', from: '*', to: 'REPOSITORY_CONFLICT', guards: [g('G-REPO-010')], sideEffects: [{ id: 'SE-EVT-082', description: 'CONFLICT_FREEZE' }], humanApproval: 'NEVER' },
  { id: 'T-083', from: 'REPOSITORY_CONFLICT', to: 'HUMAN_GATE', guards: [g('G-REPO-011')], sideEffects: [{ id: 'SE-EVT-083', description: 'CONFLICT_ESCALATE' }], humanApproval: 'ALWAYS' },
  { id: 'T-084', from: 'AGENT_FAILED', to: 'TRIAGE', guards: [g('G-RUN-002')], sideEffects: [{ id: 'SE-EVT-084', description: 'AGENT_TRIAGE' }], humanApproval: 'NEVER' },
  { id: 'T-085', from: 'AGENT_FAILED', to: 'HUMAN_GATE', guards: [g('G-RUN-003')], sideEffects: [{ id: 'SE-EVT-085', description: 'AGENT_ESCALATE' }], humanApproval: 'ON_LIMIT_EXCEEDED' },
  { id: 'T-086', from: '*', to: 'ABORT', guards: [g('G-HUMAN-003')], sideEffects: [{ id: 'SE-EVT-086', description: 'WORKFLOW_ABORTED' }], humanApproval: 'ALWAYS' }
];

export function findTransition(from: WorkflowState, to: WorkflowState): TransitionDefinition | undefined {
  return TRANSITION_REGISTRY.find(t => (t.from === from || t.from === '*') && t.to === to);
}

export function getAllowedTargetStates(from: WorkflowState): WorkflowState[] {
  return TRANSITION_REGISTRY
    .filter(t => t.from === from || t.from === '*')
    .map(t => t.to);
}

export function isTransitionLegal(from: WorkflowState, to: WorkflowState): boolean {
  return findTransition(from, to) !== undefined;
}
