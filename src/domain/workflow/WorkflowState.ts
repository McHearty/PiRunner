export type ProjectEntryWorkflowState =
  | 'PROJECT_DISCOVERY'
  | 'PROJECT_INTAKE'
  | 'PROJECT_BASELINE'
  | 'STATE_RECOVERY'
  | 'STATE_VALIDATION';

export type PrimaryWorkflowState =
  | ProjectEntryWorkflowState
  | 'CONCEPT'
  | 'CONCEPT_REVIEW'
  | 'SPECIFICATION'
  | 'SPECIFICATION_REVIEW'
  | 'PLANNING'
  | 'KNOWLEDGE_SYNC'
  | 'SPRINT_READY'
  | 'TEST_AUTHORING'
  | 'TEST_READY'
  | 'IMPLEMENTATION'
  | 'TRIAGE'
  | 'REWORK'
  | 'COMMIT_CREATED'
  | 'REVIEW'
  | 'SPRINT_ACCEPTED'
  | 'PUSH_GATE'
  | 'REMOTE_PUBLISHED'
  | 'SPRINT_COMPLETE'
  | 'DAY_COMPLETE'
  | 'DIARY'
  | 'SKILL_SYNTHESIS'
  | 'PUBLICATION_READY'
  | 'PUBLISHED';

export type FailureWorkflowState =
  | 'BLOCKED'
  | 'HUMAN_GATE'
  | 'AGENT_FAILED'
  | 'REPOSITORY_CONFLICT'
  | 'ARTIFACT_INVALID'
  | 'ABORT';

export type WorkflowState = PrimaryWorkflowState | FailureWorkflowState;
