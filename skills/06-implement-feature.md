---
name: implement-feature
description: Satisfy authoritative locked test suite without modifying tests
role: IMPLEMENTATION
---
# Procedure: Implement Feature
1. Read locked `TestSpecification` and inspect failing tests using `/hitm-test`.
2. Implement production logic strictly under `src/**`.
3. Verify that all tests pass deterministically.
4. Create a Git commit and emit `ImplementationResult` JSON with `status: "COMPLETED"`.
