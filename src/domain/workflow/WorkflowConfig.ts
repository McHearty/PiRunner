export interface KnowledgeFreshnessPolicy {
  version: string;
  maxAgeSeconds: number;
}

export interface WorkflowConfig {
  version: string; // semver
  maxTriageCyclesPerSprint: number;
  maxReviewIterationsPerSprint: number;
  maxImplementationAttempts: number;
  maxTestAuthoringAttempts: number;
  stuckFailureThreshold: number;
  unchangedDiffThreshold: number;
  knowledgeFreshnessPolicy: KnowledgeFreshnessPolicy;
  requireHumanConceptApproval: boolean;
  requireHumanSpecificationApproval: boolean;
  requireHumanPushApproval: boolean;
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  version: '1.3.0',
  maxTriageCyclesPerSprint: 3,
  maxReviewIterationsPerSprint: 3,
  maxImplementationAttempts: 3,
  maxTestAuthoringAttempts: 3,
  stuckFailureThreshold: 3,
  unchangedDiffThreshold: 2,
  knowledgeFreshnessPolicy: {
    version: '1.0.0',
    maxAgeSeconds: 86400
  },
  requireHumanConceptApproval: true,
  requireHumanSpecificationApproval: true,
  requireHumanPushApproval: true
};
