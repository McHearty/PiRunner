---
name: author-tests
description: Transform accepted sprint specifications into executable acceptance tests
role: TEST_AUTHORING
---
# Procedure: Author Acceptance Tests
1. Read accepted SprintSpecification and MasterSpecification.
2. Formulate test cases with explicit preconditions, inputs, expected behavior, and failure conditions.
3. Write test code strictly under `tests/**`.
4. Output valid `TestSpecification` JSON payload declaring `testRootPaths: ["tests"]`.
