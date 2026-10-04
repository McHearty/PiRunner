---
name: author-acceptance-tests
description: Derive executable acceptance tests from accepted specifications
role: TEST_AUTHORING
---
# Procedure: Author Acceptance Tests
1. Read accepted `SprintSpecification` and acceptance criteria.
2. Formulate black-box test cases with explicit failure conditions and expected behaviors.
3. Write test code strictly under `tests/**`.
4. Emit valid `TestSpecification` JSON declaring `testRootPaths: ["tests"]`.
