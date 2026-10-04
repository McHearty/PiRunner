import { createHash } from 'node:crypto';

export type FailureClass =
  | 'COMPILER'
  | 'TEST'
  | 'RUNTIME'
  | 'DEPENDENCY'
  | 'ENVIRONMENT'
  | 'REPOSITORY'
  | 'UNKNOWN';

export interface FailureSignature {
  class: FailureClass;
  location: string;
  fingerprint: string;
  raw: string;
}

export function normalizeFailure(
  raw: string,
  context?: { workspaceRoot?: string }
): FailureSignature {
  // Step 1: Sanitization
  if (!raw || raw.trim().length === 0) {
    const emptyFingerprint = createHash('sha256').update('UNKNOWN\0\0').digest('hex');
    return {
      class: 'UNKNOWN',
      location: '',
      fingerprint: emptyFingerprint,
      raw: raw ?? ''
    };
  }

  // Step 2: Class detection (first match)
  let detectedClass: FailureClass = 'UNKNOWN';
  if (/error TS\d+:|SyntaxError:|tsc /i.test(raw)) {
    detectedClass = 'COMPILER';
  } else if (/FAIL|AssertionError|expected .* to (equal|match)|expect\(|Assertion failed|Test failed/i.test(raw)) {
    detectedClass = 'TEST';
  } else if (/TypeError:|ReferenceError:|RangeError:|UnhandledPromiseRejection/i.test(raw)) {
    detectedClass = 'RUNTIME';
  } else if (/ERR_MODULE_NOT_FOUND|Cannot find module|npm ERR!|package\.json/i.test(raw)) {
    detectedClass = 'DEPENDENCY';
  } else if (/ENOENT|EACCES|ECONNREFUSED|ENOSPC|spawn .* ENOENT/i.test(raw)) {
    detectedClass = 'ENVIRONMENT';
  } else if (/merge conflict|REPOSITORY_CONFLICT|uncommitted changes|fatal: not a git/i.test(raw)) {
    detectedClass = 'REPOSITORY';
  }

  // Step 3: Location extraction
  let location = '';
  // Try structured compiler location: path:line:col
  const compilerLocMatch = raw.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)/);
  if (compilerLocMatch) {
    location = compilerLocMatch[0];
  } else {
    // Try stack frame inside workspace
    const stackMatch = raw.match(/at (?:[a-zA-Z0-9_$.]+ )?\(?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+:\d+:\d+)\)?/);
    if (stackMatch) {
      location = stackMatch[1];
    } else {
      // Try test name pattern
      const testMatch = raw.match(/(?:✕|FAIL|×) (.+)/);
      if (testMatch) {
        location = testMatch[1].trim();
      }
    }
  }

  // Step 4 & 5: Normalize to relative forward-slash path and strip leading ./
  if (location) {
    if (context?.workspaceRoot && location.startsWith(context.workspaceRoot)) {
      location = location.slice(context.workspaceRoot.length);
    }
    location = location.replace(/\\/g, '/');
    location = location.replace(/^\.\//, '');
  }

  // Step 6: Message normalization for fingerprint only
  let norm = raw
    // Strip ANSI codes
    .replace(/\u001b\[[0-9;]*m/g, '')
    // Strip timestamps (ISO-8601 or HH:MM:SS)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '')
    .replace(/\b\d{2}:\d{2}:\d{2}\b/g, '')
    // Strip PIDs
    .replace(/\bpid[:= ]*\d+\b/gi, '')
    // Strip hex memory pointers (0x123abc)
    .replace(/0x[0-9a-fA-F]+/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  // Remove duplicate lines from normalized string
  norm = Array.from(new Set(norm.split('\n'))).join('\n');

  // Step 7: SHA-256 fingerprint
  const fingerprint = createHash('sha256')
    .update(`${detectedClass}\0${location}\0${norm}`)
    .digest('hex');

  // Step 8: Return structured signature
  return {
    class: detectedClass,
    location,
    fingerprint,
    raw
  };
}
