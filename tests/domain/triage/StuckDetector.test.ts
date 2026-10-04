import { describe, it, expect } from 'vitest';
import { StuckDetector } from '../../../src/domain/triage/StuckDetector.js';
import { normalizeFailure } from '../../../src/domain/triage/FailureSignature.js';
import { DEFAULT_WORKFLOW_CONFIG } from '../../../src/domain/workflow/WorkflowConfig.js';

describe('FailureSignature Normalization (Normative §19)', () => {
  it('classifies compiler errors and normalizes relative locations', () => {
    const raw = 'src/domain/test.ts:15:3 - error TS2322: Type "string" is not assignable to type "number".';
    const sig = normalizeFailure(raw);

    expect(sig.class).toBe('COMPILER');
    expect(sig.location).toBe('src/domain/test.ts:15:3');
    expect(sig.fingerprint).toHaveLength(64);
  });

  it('produces identical fingerprints for identical errors with different timestamps or PIDs', () => {
    const raw1 = '[2026-10-01T12:00:00Z] [pid 1234] AssertionError: expected false to be true at src/foo.ts:10:2';
    const raw2 = '[2026-10-01T14:35:10Z] [pid 9999] AssertionError: expected false to be true at src/foo.ts:10:2';

    const sig1 = normalizeFailure(raw1);
    const sig2 = normalizeFailure(raw2);

    expect(sig1.class).toBe('TEST');
    expect(sig1.fingerprint).toBe(sig2.fingerprint);
  });
});

describe('StuckDetector (Normative §21)', () => {
  const detector = new StuckDetector(DEFAULT_WORKFLOW_CONFIG);

  it('permits continuous operation when below failure thresholds', () => {
    const sig = normalizeFailure('Error TS1005: ";" expected in src/a.ts:1:1');
    const assessment = detector.evaluate({
      attemptCount: 1,
      maxAttempts: 3,
      recentSignatures: [sig],
      consecutiveUnchangedDiffs: 0
    });

    expect(assessment.isStuck).toBe(false);
    expect(assessment.recommendedDisposition).toBe('CONTINUE');
  });

  it('routes to TRIAGE when identical failure signatures exceed threshold', () => {
    const sig = normalizeFailure('Error TS1005: ";" expected in src/a.ts:1:1');
    const assessment = detector.evaluate({
      attemptCount: 2,
      maxAttempts: 3,
      recentSignatures: [sig, sig, sig], // 3 identical failures = threshold
      consecutiveUnchangedDiffs: 0
    });

    expect(assessment.isStuck).toBe(true);
    expect(assessment.recommendedDisposition).toBe('TRIAGE');
    expect(assessment.reason).toContain('Repeated identical failure signature');
  });

  it('routes to HUMAN_GATE when max attempts are exhausted', () => {
    const assessment = detector.evaluate({
      attemptCount: 3,
      maxAttempts: 3,
      recentSignatures: [],
      consecutiveUnchangedDiffs: 0
    });

    expect(assessment.isStuck).toBe(true);
    expect(assessment.recommendedDisposition).toBe('HUMAN_GATE');
  });

  it('escalates to HUMAN_GATE on protected path violations', () => {
    const assessment = detector.evaluate({
      attemptCount: 1,
      maxAttempts: 3,
      recentSignatures: [],
      consecutiveUnchangedDiffs: 0,
      protectedPathViolations: 1
    });

    expect(assessment.isStuck).toBe(true);
    expect(assessment.recommendedDisposition).toBe('HUMAN_GATE');
  });
});
