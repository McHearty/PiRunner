# PiRunner Operational & Developer Guide
## Native Pi Agent Harness Extension (TECHSPEC v1.3.0)

This guide documents the day-to-day operation of **PiRunner** within the **Pi Coding Agent Harness**. It covers installation, local model configuration, natural conversational turns, automated modal prompts, bundled skills, and recovery workflows.

---

## 1. Setup & Installation

### Step 1: Compile the Extension
```bash
npm run build && npm test
```

### Step 2: Deploy to the Extension Directory
```bash
mkdir -p .pi/agent/extensions
cp dist/extension.js .pi/agent/extensions/hitm.js
```

### Step 3: Configure Your Local Model Endpoint
Pi connects to local OpenAI-compatible inference servers (Ollama, llama.cpp, vLLM, LM Studio, etc.). 

Configure your local model in Pi's settings or pass the model name directly on launch:
```bash
# Example launching with a local model:
pi --model qwen2.5-coder:32b
```

---

## 2. Interactive Conversational Workflow

PiRunner does not require you to type bulky execution wrappers. You interact with Pi through **natural chat in the terminal**.

```text
Developer prompts naturally in Pi terminal
                    │
                    ▼
pi.on('before_agent_start')
  └── Injects active agent's governance prompt + context artifacts
                    │
                    ▼
Model streams response & executes permitted tools
                    │
                    ▼
pi.on('turn_end')
  ├── Ingests JSON artifact block from model turn
  ├── Validates schema via strict Draft 2020-12 AJV
  └── Displays interactive confirmation dialog:
      "? [4819 Resolute Scribe] completed TestSpecification.
         Authorize transition to [TEST_READY]? (y/N)"
                    │
                    ▼
State advances deterministically
```

### Footer Status Indicator
The active agent badge is permanently visible in your terminal footer via Pi's UI status line:
```text
[4819 Methodical Scribe]
```

---

## 3. End-to-End Sprint Walkthrough

---

### Step 1: Automatic Project Discovery & Intake
When you launch Pi in a repository, PiRunner automatically inspects the environment:
1. Detects Git revision, branch, and uncommitted files.
2. Generates an accepted `ProjectBaseline` artifact without claiming historical ownership.
3. Advances: `PROJECT_DISCOVERY → PROJECT_INTAKE → PROJECT_BASELINE → KNOWLEDGE_SYNC → PLANNING`.

Verify current status:
```text
/hitm-status
```
*Output:*
```text
State: [PLANNING] | Mode: ADOPT_EXISTING_PROJECT | Agent: [3812 Curious Automaton] | TestLock: Unlocked
Allowed Next Transitions: [KNOWLEDGE_SYNC, SKILL_SYNTHESIS]
```

---

### Step 2: Sprint Planning (`PLANNING`)
**Active Agent:** `Curious Automaton` (Planning Specialist)  
**Permitted Writes:** None (strictly read-only). Produces typed JSON artifacts.

Prompt Pi naturally:
```text
Let's plan sprint 1 for user authentication. Decompose the requirements into tasks and acceptance criteria.
```
- The model outputs a `SprintSpecification` JSON block.
- PiRunner validates the schema, persists it to `.hitm/artifacts/`, and pops a confirmation dialog:
  ```text
  ? [3812 Curious Automaton] completed SprintSpecification.
    Authorize transition to [KNOWLEDGE_SYNC]? (y/N)
  ```
- Press **Enter** to approve. State advances to `KNOWLEDGE_SYNC`.

---

### Step 3: Knowledge Synchronization (`KNOWLEDGE_SYNC`)
**Active Agent:** `Joyful Graph` (Knowledge Specialist)

Prompt Pi:
```text
Audit package-lock.json and active source files to generate the KnowledgeSnapshot.
```
- Ingests `KnowledgeSnapshot` with the live dependency lockfile SHA-256 hash.
- Automatically advances to `SPRINT_READY`.

---

### Step 4: Test Authoring & Suite Locking (`TEST_AUTHORING → TEST_READY`)
**Active Agent:** `Methodical Scribe` (Test Authoring Specialist)  
**Permitted Writes:** `tests/**`, `fixtures/**`, `test-config/**`.  
**Forbidden Writes:** `src/**` (attempted writes are blocked by `PathCapabilityEnforcer`).

1. Advance to test authoring:
   ```text
   /hitm-approve TEST_AUTHORING
   ```
2. Prompt Pi to author acceptance tests:
   ```text
   Derive acceptance tests for requirement REQ-001 in tests/unit/auth.test.ts and output the TestSpecification.
   ```
   - Agent writes test code to `tests/unit/auth.test.ts`.
   - Emits a JSON `TestSpecification` with `testRootPaths: ["tests"]`.
3. Modal confirmation appears:
   ```text
   ? [4819 Methodical Scribe] completed TestSpecification.
     Authorize transition to [TEST_READY]? (y/N)
   ```
4. Confirming freezes the suite:
   - The test files on disk are canonically hashed with `TestSuiteHasher`.
   - The lock is committed to `.hitm/test-suite.lock.json`.
   - Authoritative tests are now **immutable**.

---

### Step 5: Implementation & Testing (`IMPLEMENTATION`)
**Active Agent:** `Confident Forge` (Implementation Specialist)  
**Permitted Writes:** `src/**`, `production-config/**`.  
**Forbidden Writes:** `tests/**` (attempted edits to tests are blocked).

1. Advance to implementation:
   ```text
   /hitm-approve IMPLEMENTATION
   ```
2. Prompt Pi to implement the logic:
   ```text
   Implement the auth token verification in src/auth.ts to pass the locked test suite.
   ```
3. Run authoritative deterministic tests at any time:
   ```text
   /hitm-test
   ```
   - Executes `npm test` in an isolated subprocess against the locked test hash.
   - Reports exact passed/failed counts.
4. When passing, prompt Pi to finalize:
   ```text
   Create a commit for the implementation and emit the completed ImplementationResult.
   ```
5. Confirm transition to `COMMIT_CREATED`.

---

### Step 6: Review (`REVIEW`)
**Active Agent:** `Satisfied Sentinel` (Review Specialist)  
**Permitted Writes:** None (strictly read-only).

1. Advance to review:
   ```text
   /hitm-approve REVIEW
   ```
2. Prompt Pi:
   ```text
   Evaluate the implementation commit and test execution results against our acceptance criteria.
   ```
3. If review status is `PASS` with zero blocking findings:
   - Prompts to advance to `SPRINT_ACCEPTED`.
4. If review status is `FAIL`:
   - Prompts to advance to `REWORK`, returning to `IMPLEMENTATION` for another pass.

---

### Step 7: Push Gate & Remote Publication (`PUSH_GATE`)
Irreversible remote publication requires explicit human authority.

1. Advance to push gate:
   ```text
   /hitm-approve PUSH_GATE
   ```
2. Authorize publication:
   ```text
   /hitm-approve REMOTE_PUBLISHED
   ```
   - Prompts with a native confirmation dialog:
     `? Authorize transition from [PUSH_GATE] to [REMOTE_PUBLISHED]?`
   - Pre-push verification confirms clean working tree and expected commit SHA.
   - Pushes to remote repository and advances to `SPRINT_COMPLETE`.

---

## 4. Skill Synthesis & Anti-Proliferation Rule

**Active Agent:** `Inventive Weaver` (Skill Architect)  
**State:** `SKILL_SYNTHESIS`

### The Anti-Proliferation Invariant
To prevent repository bloat, a procedure graduates into a skill **only after ≥3 verified real uses** in event or devlog history. Skills must be repeated, parameterized, and declare concrete success criteria.

### Curating a Skill
1. Transition from `PLANNING` or `DIARY`:
   ```text
   /hitm-approve SKILL_SYNTHESIS
   ```
2. Prompt Pi:
   ```text
   Synthesize the recurring test-authoring procedure into a parameterized skill in skills/author-tests.md citing our last 3 sprint uses.
   ```
3. Guard `G-SKILL-001` verifies that ≥3 uses are documented in `verifiedUses`.
4. Prompts to return to `PLANNING` (`T-097`) or advance to `PUBLICATION_READY` (`T-095`).

---

## 5. Safe Resumption Across Process Restarts

When you close your terminal or restart Pi:
1. PiRunner discovers `.hitm/events.jsonl` exists → selects `RESUME_WORKFLOW`.
2. Replays the event journal to recover canonical state (`STATE_RECOVERY`).
3. `StateValidationService` independently inspects:
   - Live Git commit SHA and branch.
   - Working tree cleanliness.
   - Live test files on disk against `.hitm/test-suite.lock.json`.
   - Dependency lockfile hash against `KnowledgeSnapshot`.
4. If all checks **MATCH** → seamlessly resumes at the exact canonical state.
5. If divergence is detected (e.g. dirty working tree or modified test files) → freezes into `REPOSITORY_CONFLICT` and requires human resolution.

---

## 6. Commands Quick Reference

| Command | Description |
|---|---|
| `/hitm-status` | Displays current state, active `[ID NAME]` badge, test lock status, and **allowed next transitions**. |
| `/hitm-prompt` | Displays the active agent's governance sub-prompt and capability boundaries. |
| `/hitm-approve [STATE]` | Interactive human authorization dialog. If `[STATE]` is omitted, suggests the primary legal next state. |
| `/hitm-test` | Runs the deterministic test runner against the locked test suite hash via live subprocess (`npm test`). |
| `/hitm-roster [regenerate]` | Displays or re-rolls the project's randomized agent IDs and emotional-technological names. |

