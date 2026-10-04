import { WorkflowState } from './WorkflowState.js';
import { WorkflowEvent } from './WorkflowEvent.js';
import { WorkflowConfig } from './WorkflowConfig.js';

export interface GuardContext {
  currentState: WorkflowState;
  validatedArtifacts: Map<string, Record<string, unknown>>;
  eventHistory: WorkflowEvent[];
  config: WorkflowConfig;
  repositorySnapshot?: {
    branch: string;
    headSha: string;
    isClean: boolean;
    remoteHeadSha?: string;
  };
  metrics?: {
    triageCycles: number;
    reviewIterations: number;
    implementationAttempts: number;
    testAuthoringAttempts: number;
    isStuck: boolean;
  };
}

export type GuardFunction = (context: GuardContext) => boolean;

export interface GuardDefinition {
  id: string;
  description: string;
  evaluate?: GuardFunction;
}

export const GUARDS: Record<string, GuardDefinition> = {
  'G-ART-001': { id: 'G-ART-001', description: 'ConceptPackage exists with status SUBMITTED' },
  'G-ART-003': { id: 'G-ART-003', description: 'ConceptPackage status == ACCEPTED' },
  'G-ART-005': { id: 'G-ART-005', description: 'ConceptPackage status == REJECTED or critical questions unresolved' },
  'G-ART-010': { id: 'G-ART-010', description: 'MasterSpecification status SUBMITTED' },
  'G-ART-013': { id: 'G-ART-013', description: 'MasterSpecification status == ACCEPTED' },
  'G-ART-015': { id: 'G-ART-015', description: 'MasterSpecification status == REJECTED' },
  'G-ART-020': { id: 'G-ART-020', description: 'Valid DailyPlan and SprintSpecification' },
  'G-ART-022': { id: 'G-ART-022', description: 'Valid KnowledgeSnapshot' },
  'G-ART-023': { id: 'G-ART-023', description: 'Active accepted SprintSpecification exists' },
  'G-ART-024': { id: 'G-ART-024', description: 'Active accepted MasterSpecification exists' },
  'G-ART-025': { id: 'G-ART-025', description: 'Valid TestSpecification submitted' },
  'G-ART-030': { id: 'G-ART-030', description: 'Active SprintSpecification accepted' },
  'G-ART-031': { id: 'G-ART-031', description: 'ImplementationResult status == COMPLETED' },
  'G-ART-032': { id: 'G-ART-032', description: 'commitSha non-null and valid' },
  'G-ART-034': { id: 'G-ART-034', description: 'Active TestSpecification accepted' },
  'G-ART-040': { id: 'G-ART-040', description: 'Triage disposition == RESUME_IMPLEMENTATION' },
  'G-ART-042': { id: 'G-ART-042', description: 'Triage disposition == SPECIFICATION_REVIEW' },
  'G-ART-044': { id: 'G-ART-044', description: 'Triage disposition == REPLAN' },
  'G-ART-045': { id: 'G-ART-045', description: 'Triage disposition == UPDATE_KNOWLEDGE' },
  'G-ART-046': { id: 'G-ART-046', description: 'Triage disposition == HUMAN_GATE' },
  'G-ART-047': { id: 'G-ART-047', description: 'Triage disposition == ABORT' },
  'G-ART-048': { id: 'G-ART-048', description: 'Triage disposition == TEST_AUTHORING' },
  'G-ART-051': { id: 'G-ART-051', description: 'ReviewResult status == PASS' },
  'G-ART-055': { id: 'G-ART-055', description: 'ReviewResult status == FAIL' },
  'G-ART-060': { id: 'G-ART-060', description: 'Sprint accepted, criteria met' },
  'G-TEST-001': { id: 'G-TEST-001', description: 'No active accepted TestSpecification exists for current sprint' },
  'G-TEST-006': { id: 'G-TEST-006', description: 'Test suite content hash recorded' },
  'G-TEST-007': { id: 'G-TEST-007', description: 'Test source contains no production-source modifications' },
  'G-TEST-012': { id: 'G-TEST-012', description: 'Authoritative test-suite content hash matches accepted TestSpecification' },
  'G-TEST-013': { id: 'G-TEST-013', description: 'Deterministic TestExecutionResult exists' },
  'G-TEST-019': { id: 'G-TEST-019', description: 'Required deterministic test execution completed' },
  'G-REPO-001': { id: 'G-REPO-001', description: 'Isolated implementation workspace prepared and clean' },
  'G-REPO-003': { id: 'G-REPO-003', description: 'Working tree matches post-commit state' },
  'G-REPO-006': { id: 'G-REPO-006', description: 'Repository clean, correct branch, expected HEAD' },
  'G-REPO-010': { id: 'G-REPO-010', description: 'Unexpected repository mutation detected' },
  'G-REPO-011': { id: 'G-REPO-011', description: 'Repository conflict confirmed' },
  'G-REPO-012': { id: 'G-REPO-012', description: 'Isolated test-authoring workspace prepared' },
  'G-VAL-001': { id: 'G-VAL-001', description: 'Deterministic schema/artifact validation failure' },
  'G-RUN-001': { id: 'G-RUN-001', description: 'AgentRunner reports failure or crash' },
  'G-HUMAN-001': { id: 'G-HUMAN-001', description: 'Explicit human push approval granted' },
  'G-HUMAN-003': { id: 'G-HUMAN-003', description: 'Explicit human abort requested' }
};
