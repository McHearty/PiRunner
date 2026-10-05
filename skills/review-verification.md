---
name: review-verification
description: Review implementation commit against accepted specifications and test evidence
role: REVIEW
---
# Procedure: Review Verification
1. Verify commit exists and inspect changed files.
2. Verify deterministic `TestExecutionResult` passed with zero failures.
3. Confirm all mandatory acceptance criteria are satisfied.
4. Emit `ReviewResult` JSON with status `PASS` or `FAIL`.
