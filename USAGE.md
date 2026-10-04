
# PiRunner Workflow & Operational Guide
## Native Pi Agent Harness Extension (TECHSPEC v1.3.0)

This guide documents the complete operational lifecycle of **PiRunner** within the **Pi Coding Agent Harness**. It explains how human engineers and specialized agents collaborate through deterministic state transitions, strict capability sandboxing, and authoritative test locking.

---

## Table of Contents

1. [Installation & Launch](#1-installation--launch)
2. [Project Entry: Discovery, Adoption & Resumption](#2-project-entry-discovery-adoption--resumption)
3. [The End-to-End Sprint Workflow](#3-the-end-to-end-sprint-workflow)
   - [Phase 1: Planning (Agent 0036)](#phase-1-planning-curious-automaton)
   - [Phase 2: Knowledge Synchronization (Agent 0048)](#phase-2-knowledge-synchronization-joyful-graph)
   - [Phase 3: Test Authoring & Suite Locking (Agent 0120)](#phase-3-test-authoring--suite-locking-methodical-scribe)
   - [Phase 4: Implementation (Agent 0060)](#phase-4-implementation-confident-forge)
   - [Phase 5: Review (Agent 0084)](#phase-5-review-satisfied-sentinel)
   - [Phase 6: Push Gate & Publication (Human Authority)](#phase-6-push-gate--publication-human-authority)
4. [Triage & Recovery (Agent 0072)](#4-triage--recovery-patient-oracle)
5. [Process Restart & Safe Resumption](#5-process-restart--safe-resumption)
6. [Commands Quick Reference](#6-commands-quick-reference)

---

## 1. Installation & Launch

### Step 1: Build the Extension
```bash
npm run build && npm test
```

### Step 2: Deploy to Pi Extensions Directory
```bash
mkdir -p .pi/agent/extensions
cp dist/extension.js .pi/agent/extensions/hitm.js
```

### Step 3: Launch Pi
Start Pi in your repository with your model configuration (cloud or local):
```bash
# Example with a local model endpoint:
pi --model <local-model-name>
```

---

## 2. Project Entry: Discovery, Adoption & Resumption

When Pi starts up, PiRunner's `ProjectDiscoveryService` automatically inspects the workspace before any prompt is processed:

```text
                       PROJECT_DISCOVERY
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
       NEW_PROJECT     ADOPT_EXISTING    RESUME_WORKFLOW
             │                │                │
             ▼                ▼                ▼
          CONCEPT       PROJECT_INTAKE   STATE_RECOVERY
                              │                │
                              ▼                ▼
                       PROJECT_BASELINE  STATE_VALIDATION
                              │                │
                              ▼                ├─ MATCH ──► [Recovered State]
                        KNOWLEDGE_SYNC         │
                              │                └─ MISMATCH ► REPOSITORY_CONFLICT
                              ▼
                           PLANNING
```

### Automatic Adoption Flow
If starting in an existing repository with code but no previous `.hitm/events.jsonl`, PiRunner automatically executes:
1. `PROJECT_DISCOVERY → PROJECT_INTAKE`: Inspects manifests, git history, and uncommitted files.
2. `PROJECT_INTAKE → PROJECT_BASELINE`: Generates and validates a typed `ProjectBaseline` artifact capturing historical state without claiming retroactive ownership.
3. `PROJECT_BASELINE → KNOWLEDGE_SYNC → PLANNING`: Advances the workflow to `PLANNING`, ready for sprint decomposition.

Check the initial state in Pi:
```text
/hitm-status
```
*Expected output:*
```text
State: [PLANNING] | Mode: ADOPT_EXISTING_PROJECT | Agent: 0036 | TestLock: Unlocked
Allowed Next Transitions: [KNOWLEDGE_SYNC]
```

---

## 3. The End-to-End Sprint Workflow

### Phase 1: Planning (Curious Automaton — `0036`)

**Goal:** Decompose requirements into an accepted `DailyPlan` and `SprintSpecification`.

1. **Verify Active Prompt:**
   ```text
   /hitm-prompt
   ```
   *(Confirms Agent 0036's planning persona and governance invariants).*

2. **Execute Agent Planning:**
   ```text
   /hitm-run Decompose the current sprint objectives into a SprintSpecification for feature authentication
   ```
   - Agent `0036` generates a JSON payload conforming to `sprint-specification.schema.json`.
   - `ArtifactIngestionService` validates the schema and commits the artifact to `.hitm/artifacts/`.
   - PiRunner automatically triggers `T-030` (`PLANNING → KNOWLEDGE_SYNC`).

---

### Phase 2: Knowledge Synchronization (Joyful Graph — `0048`)

**Goal:** Compute live dependency lockfile hashes and map source files to produce `KnowledgeSnapshot`.

1. **Execute Knowledge Sync:**
   ```text
   /hitm-run Inspect package-lock.json and active source files to generate a KnowledgeSnapshot
   ```
   - Ingests `KnowledgeSnapshot` and validates lockfile hash.
   - Automatically advances `KNOWLEDGE_SYNC → SPRINT_READY` (`T-031`).

2. **Check Status:**
   ```text
   /hitm-status
   ```
   *Output shows:* `State: [SPRINT_READY] | Allowed Next Transitions: [TEST_AUTHORING]`

---

### Phase 3: Test Authoring & Suite Locking (Methodical Scribe — `0120`)

**Goal:** Derive executable acceptance tests from accepted specifications *before* any implementation begins.

1. **Authorize Transition to Test Authoring:**
   ```text
   /hitm-approve TEST_AUTHORING
   ```
   - State becomes `TEST_AUTHORING`.
   - Active agent switches to `0120 Methodical Scribe`.
   - **Capability Policy:** `0120` is permitted to write to `tests/**`, `fixtures/**`. Writes to `src/**` are **strictly blocked**.

2. **Execute Test Authoring:**
   ```text
   /hitm-run Write unit tests for requirement REQ-001 in tests/unit/auth.test.ts and output TestSpecification
   ```
   - Agent `0120` writes tests into `tests/unit/`.
   - Emits a JSON `TestSpecification` declaring `testRootPaths: ["tests"]`.
   - `ArtifactIngestionService` validates coverage and test cases.

3. **Automatic Freezing & Test Locking:**
   - PiRunner advances `TEST_AUTHORING → TEST_READY` (`T-041`).
   - The authoritative test suite is canonically hashed (SHA-256) and locked into `.hitm/test-suite.lock.json`.
   - Test files are now **immutable**.

---

### Phase 4: Implementation (Confident Forge — `0060`)

**Goal:** Implement production source in `src/**` to satisfy the locked test suite without touching tests.

1. **Authorize Transition to Implementation:**
   ```text
   /hitm-approve IMPLEMENTATION
   ```
   - State becomes `IMPLEMENTATION`.
   - Active agent switches to `0060 Confident Forge`.
   - **Capability Policy:** `0060` can write to `src/**`. Attempts to modify `tests/**` are **strictly blocked**.

2. **Execute Implementation:**
   ```text
   /hitm-run Implement the auth token verification logic in src/auth.ts to pass the locked test suite
   ```
   - Agent writes production code into `src/`.

3. **Run Authoritative Deterministic Tests:**
   At any point during implementation, verify code against the locked suite:
   ```text
   /hitm-test
   ```
   - PiRunner retrieves the locked hash from `.hitm/test-suite.lock.json` and executes `npm test` in an isolated subprocess.
   - Proves whether tests pass without relying on LLM claims.

4. **Complete Implementation & Create Commit:**
   ```text
   /hitm-run Produce git commit and emit ImplementationResult with status COMPLETED
   ```
   - Validates `commitSha`, changed files, and execution evidence.
   - Advances `IMPLEMENTATION → COMMIT_CREATED` (`T-051`).

---

### Phase 5: Review (Satisfied Sentinel — `0084`)

**Goal:** Evaluate implementation and test execution evidence against the accepted specification.

1. **Authorize Review Transition:**
   ```text
   /hitm-approve REVIEW
   ```
   - State becomes `REVIEW`.
   - Active agent switches to `0084 Satisfied Sentinel` (strictly read-only).

2. **Execute Review:**
   ```text
   /hitm-run Evaluate implementation commit and test execution results against acceptance criteria
   ```
   - Agent `0084` produces a `ReviewResult`.
   - If status is `PASS` with zero blocking findings:
     - Automatically advances `REVIEW → SPRINT_ACCEPTED` (`T-071`).
   - If status is `FAIL`:
     - Routes to `REWORK` (`T-072`) to allow another implementation pass.

---

### Phase 6: Push Gate & Publication (Human Authority)

**Goal:** Lead engineer authorizes irreversible remote repository publication.

1. **Enter Push Gate:**
   ```text
   /hitm-approve PUSH_GATE
   ```
   - State becomes `PUSH_GATE`.
   - All automated agent mutations are frozen.

2. **Authorize Remote Publication:**
   ```text
   /hitm-approve REMOTE_PUBLISHED
   ```
   - Pi prompts with a native interactive confirmation dialog:
     `? Authorize transition from [PUSH_GATE] to [REMOTE_PUBLISHED]?`
   - Pre-push verification runs (`git status` clean check, branch check).
   - Remote publication occurs.
   - Workflow advances to `SPRINT_COMPLETE → DAY_COMPLETE → DIARY`.

---

## 4. Triage & Recovery (Patient Oracle — `0072`)

If tests fail repeatedly or stuck implementation is detected:
1. `StuckDetector` intercepts execution loops and transitions to `TRIAGE`.
2. Agent `0072 Patient Oracle` is invoked (strictly read-only).
3. Classifies root cause:
   - `IMPLEMENTATION_DEFECT` → Routes back to `IMPLEMENTATION`.
   - `TEST_DEFECT` → Routes back to `TEST_AUTHORING` for test revision.
   - `SPECIFICATION_DEFECT` → Routes back to `SPECIFICATION_REVIEW`.
   - `AMBIGUOUS_REQUIREMENT` → Routes to `HUMAN_GATE`.

---

## 5. Process Restart & Safe Resumption

When Pi exits or restarts:
1. Startup detects `.hitm/events.jsonl` exists → selects `RESUME_WORKFLOW`.
2. Transitions: `PROJECT_DISCOVERY → STATE_RECOVERY`.
3. Replays canonical event journal to determine canonical state.
4. Transitions: `STATE_RECOVERY → STATE_VALIDATION`.
   - Verifies live Git HEAD matches recorded commit.
   - Verifies live test files on disk match `.hitm/test-suite.lock.json`.
   - Verifies working tree cleanliness.
5. If all checks **MATCH** → advances via `T-003B` directly to the recovered state.
6. If any check **MISMATCHES** → freezes via `T-003C` into `REPOSITORY_CONFLICT`, requiring human resolution.

---

## 6. Commands Quick Reference

| Command | Description |
|---|---|
| `/hitm-status` | Displays current state, entry mode, active agent, test lock status, and **allowed next transitions**. |
| `/hitm-prompt` | Displays the active agent's governance sub-prompt (identity, boundaries, and schema requirements). |
| `/hitm-approve [STATE]` | Interactive Human-In-The-Middle transition gate. Prompts with a confirmation dialog. If `[STATE]` is omitted, suggests the primary legal next state. |
| `/hitm-run [PROMPT]` | Dispatches the active agent with its governance prompt and context artifacts. Ingests emitted JSON, validates against schema, and advances the workflow. |
| `/hitm-test` | Executes deterministic `TestRunner` against the locked test suite hash using live subprocess execution (`npm test`). |
