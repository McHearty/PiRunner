import { describe, it, expect } from 'vitest';
import { TestSuiteHasher } from '../../../src/domain/testing/TestSuiteHasher.js';

describe('TestSpecification Authority (Re-Audit Defect)', () => {
  it('TestSuiteHasher uses testFramework and executionCommand from bundle for canonicalization', () => {
    // Verify that the hash incorporates the framework and command,
    // ensuring they must match the authoritative TestSpecification values.
    const bundleVitest = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [{ relativePath: 'tests/a.test.ts', content: 'test("a", () => {})' }]
    };

    const bundleJest = {
      testFramework: 'jest',
      executionCommand: 'npm run test:jest',
      files: [{ relativePath: 'tests/a.test.ts', content: 'test("a", () => {})' }]
    };

    // Different framework/command should produce different hashes
    expect(TestSuiteHasher.hash(bundleVitest)).not.toBe(TestSuiteHasher.hash(bundleJest));

    // Same framework/command with different content should differ
    const bundleVitestDiff = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [{ relativePath: 'tests/a.test.ts', content: 'test("b", () => {})' }]
    };
    expect(TestSuiteHasher.hash(bundleVitest)).not.toBe(TestSuiteHasher.hash(bundleVitestDiff));
  });

  it('TestSuiteHasher is deterministic for identical TestSpecification bundles', () => {
    const bundle = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [
        { relativePath: 'tests/a.test.ts', content: 'test("a", () => {})' },
        { relativePath: 'tests/b.test.ts', content: 'test("b", () => {})' }
      ]
    };

    const hash1 = TestSuiteHasher.hash(bundle);
    const hash2 = TestSuiteHasher.hash(bundle);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});