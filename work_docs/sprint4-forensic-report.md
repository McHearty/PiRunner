# Sprint 4 Forensic Report: Test Regression Analysis

**Date:** 2026-10-05
**Subject:** Root cause analysis for increased failing test count during Sprint 4

## Summary

Sprint 4 increased the failing test count from 0 to 1 due to two distinct issues:

1. **G-TEST-016 lock file path bug** (fixed): The guard implementation was constructing an incorrect lock file path, causing it to fail with "No TestSuiteLock exists to validate suite hash" instead of finding the lock file created in the test setup.

2. **G-TEST-016 test fixture validation error** (fixed): The test was using an invalid repository revision hash that didn't match the schema pattern, causing the artifact store to silently reject the TestExecutionResult artifact.

## Issue 1: G-TEST-016 Lock File Path Bug

### Symptoms
Two G-TEST-016 guard tests failed despite correct test setup:
- `tests/domain/workflow/TestExecutionAuthority.test.ts:336` - "valid TestExecutionResult for review passes"
- `tests/domain/workflow/TestExecutionAuthority.test.ts:360` - "old result with wrong revision fails"

### Root Cause
The G-TEST-016 guard implementation was using a different lock file lookup logic than G-TEST-013:

- **G-TEST-013 (correct):** `ctx.workspaceRoot || join(process.cwd(), '.hitm')`
- **G-TEST-016 (incorrect):** `ctx.workspaceRoot ? join(ctx.workspaceRoot, '.hitm') : undefined`

The incorrect logic was appending `.hitm` to the workspace root, causing the lock file lookup to fail.

### Fix
Changed G-TEST-016 to use the same lock file lookup logic as G-TEST-013.

## Issue 2: G-TEST-016 Test Fixture Validation Error

### Symptoms
After fixing Issue 1, one G-TEST-016 test continued to fail:
- `tests/domain/workflow/TestExecutionAuthority.test.ts:360` - "old result with wrong revision fails"

### Root Cause
The test was using an invalid repository revision hash:

```typescript
repositoryRevision: 'old-revision-123'  // Invalid: doesn't match schema pattern
```

The TestExecutionResult schema requires `repositoryRevision` to match the pattern `'^[0-9a-f]{7,40}$'` (a 7-40 character lowercase hex string). The test fixture used `'old-revision-123'`, which doesn't match this pattern.

The artifact store's `save()` method validates artifacts before storing them. When the TestExecutionResult artifact was saved, the validation failed, and the artifact was silently rejected. The test continued executing without error, and the guard found no TestExecutionResult artifact in the store.

### Fix
Changed the test fixture to use a valid repository revision hash:

```typescript
repositoryRevision: 'aabbccddeeff00112233445566778899aabbccdd'  // Valid: matches schema pattern
```

## Resolution

Both issues were fixed in commits `7f02b52` and `d452ea0`. All 76 tests now pass.

## Key Learnings

1. **Test fixtures must match schema constraints:** Test fixtures should be validated against the same schema constraints as production data. In this case, the invalid repository revision hash should have been caught during test authoring.

2. **Silent failures are dangerous:** The artifact store's `save()` method silently rejected the invalid artifact, causing the test to fail in a non-obvious way. Adding logging to the artifact store could help debug similar issues in the future.

3. **Guard tests require careful fixture design:** Guard tests rely on specific artifact states. Test fixtures must be carefully designed to create the exact conditions that the guard is supposed to evaluate.
