---
name: triage-diagnosis
description: Classify build/test failures and determine routing disposition
role: TRIAGE
---
# Procedure: Triage Diagnosis
1. Inspect failure signatures and error outputs.
2. Classify into `IMPLEMENTATION_DEFECT`, `TEST_DEFECT`, or `SPECIFICATION_DEFECT`.
3. Do not modify source or tests directly.
4. Emit `TriageReport` JSON declaring corrective action and disposition.
