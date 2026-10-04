import { describe, it, expect } from 'vitest';
import { TestSuiteHasher } from '../../../src/domain/testing/TestSuiteHasher.js';

describe('TestSuiteHasher (Normative §33)', () => {
  it('generates identical 64-char SHA-256 regardless of file insertion order', () => {
    const bundleA = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [
        { relativePath: 'tests/b.test.ts', content: 'test("b", () => {})' },
        { relativePath: 'tests/a.test.ts', content: 'test("a", () => {})' }
      ]
    };

    const bundleB = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [
        { relativePath: 'tests/a.test.ts', content: 'test("a", () => {})' },
        { relativePath: 'tests/b.test.ts', content: 'test("b", () => {})' }
      ]
    };

    const hashA = TestSuiteHasher.hash(bundleA);
    const hashB = TestSuiteHasher.hash(bundleB);

    expect(hashA).toHaveLength(64);
    expect(hashA).toBe(hashB);
  });

  it('normalizes CRLF and LF newlines to produce identical hashes', () => {
    const crlfBundle = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [{ relativePath: 'tests/a.test.ts', content: 'line1\r\nline2\r\n' }]
    };

    const lfBundle = {
      testFramework: 'vitest',
      executionCommand: 'npm test',
      files: [{ relativePath: 'tests/a.test.ts', content: 'line1\nline2\n' }]
    };

    expect(TestSuiteHasher.hash(crlfBundle)).toBe(TestSuiteHasher.hash(lfBundle));
  });
});
