import { FailureSignature } from './FailureSignature.js';
import { WorkflowConfig } from '../workflow/WorkflowConfig.js';

export interface ProgressContext {
  attemptCount: number;
  maxAttempts: number;
  recentSignatures: FailureSignature[];
  consecutiveUnchangedDiffs: number;
  unresolvedAmbiguityCount?: number;
  protectedPathViolations?: number;
}

export interface StuckAssessment {
  isStuck: boolean;
  reason: string;
  signatures: FailureSignature[];
  recommendedDisposition: 'TRIAGE' | 'HUMAN_GATE' | 'CONTINUE';
}

export class StuckDetector {
  constructor(private readonly config: WorkflowConfig) {}

  public evaluate(context: ProgressContext): StuckAssessment {
    // 1. Max attempt threshold exceeded -> HUMAN_GATE
    if (context.attemptCount >= context.maxAttempts) {
      return {
        isStuck: true,
        reason: `Max attempt limit reached (${context.attemptCount}/${context.maxAttempts})`,
        signatures: context.recentSignatures,
        recommendedDisposition: 'HUMAN_GATE'
      };
    }

    // 2. Protected path violations -> Immediate HUMAN_GATE
    if (context.protectedPathViolations && context.protectedPathViolations > 0) {
      return {
        isStuck: true,
        reason: `Protected path violation detected (${context.protectedPathViolations} incident(s))`,
        signatures: context.recentSignatures,
        recommendedDisposition: 'HUMAN_GATE'
      };
    }

    // 3. Repeated unchanged diff across attempts -> TRIAGE
    if (context.consecutiveUnchangedDiffs >= this.config.unchangedDiffThreshold) {
      return {
        isStuck: true,
        reason: `Agent emitted unchanged diff across ${context.consecutiveUnchangedDiffs} consecutive attempts`,
        signatures: context.recentSignatures,
        recommendedDisposition: 'TRIAGE'
      };
    }

    // 4. Repeated identical failure signatures -> TRIAGE
    if (context.recentSignatures.length >= this.config.stuckFailureThreshold) {
      const window = context.recentSignatures.slice(-this.config.stuckFailureThreshold);
      const firstFp = window[0].fingerprint;
      const allIdentical = window.every(s => s.fingerprint === firstFp);

      if (allIdentical) {
        return {
          isStuck: true,
          reason: `Repeated identical failure signature encountered ${this.config.stuckFailureThreshold} times in a row`,
          signatures: window,
          recommendedDisposition: 'TRIAGE'
        };
      }
    }

    return {
      isStuck: false,
      reason: 'Progressing within nominal operational boundaries',
      signatures: context.recentSignatures,
      recommendedDisposition: 'CONTINUE'
    };
  }
}
