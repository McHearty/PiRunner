import { describe, it, expect } from 'vitest';
import { PathCapabilityEnforcer } from '../../../src/domain/repository/PathCapability.js';

describe('Runtime PathCapabilityEnforcer (Normative §35, §36)', () => {
  it('permits Methodical Scribe (0120) to write test paths but forbids src paths', () => {
    expect(PathCapabilityEnforcer.isWriteAllowed('0120', 'tests/unit/core.test.ts')).toBe(true);
    expect(PathCapabilityEnforcer.isWriteAllowed('0120', 'fixtures/sample.json')).toBe(true);

    // Forbidden production write
    expect(PathCapabilityEnforcer.isWriteAllowed('0120', 'src/domain/core.ts')).toBe(false);
  });

  it('permits Confident Forge (0060) to write src paths but forbids test paths', () => {
    expect(PathCapabilityEnforcer.isWriteAllowed('0060', 'src/domain/core.ts')).toBe(true);

    // Forbidden test suite tampering
    expect(PathCapabilityEnforcer.isWriteAllowed('0060', 'tests/unit/core.test.ts')).toBe(false);
  });

  it('enforces total read-only policy on Triage (0072) and Review (0084)', () => {
    expect(PathCapabilityEnforcer.isWriteAllowed('0072', 'src/index.ts')).toBe(false);
    expect(PathCapabilityEnforcer.isWriteAllowed('0084', 'tests/test.ts')).toBe(false);
  });
});
