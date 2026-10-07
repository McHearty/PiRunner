# PiRunner

[![Tests](https://img.shields.io/badge/tests-53%20passed-brightgreen.svg)](#)
[![Agent Runtime](https://img.shields.io/badge/runtime-Pi%20Agent%20Harness-purple.svg)](https://github.com/earendil-works/pi)
[![Language](https://img.shields.io/badge/language-TypeScript%205.5%20(NodeNext)-blue.svg)](#)
[![Architecture](https://img.shields.io/badge/architecture-Hexagonal%20%2F%20HITM-orange.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#)

> **Deterministic Human-In-The-Middle (HITM) Orchestration Extension for the Pi Coding Agent.**

**PiRunner** wraps specialized LLM coding agents in an authoritative, deterministic control plane. Pi provides the underlying probabilistic agent runtime, session management, model connectivity, TUI, and tool execution. **PiRunner governs the authority:** determining which agent runs, enforcing strict capability boundaries, evaluating fail-closed transition guards, locking authoritative test suites, and guaranteeing reproducible state recovery across process restarts.

PiRunner is explicitly **not** an autonomous multi-agent swarm. Human engineers retain exclusive authority over project intent, specification acceptance, architectural decisions, ambiguous requirements, exceptional recovery, and remote repository publication.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Pi Agent Harness (TUI)                      │
│     Agent Sessions · Local/Cloud Models · Tool Dispatch         │
└────────────────────────────────┬────────────────────────────────┘
                                 │ native extension
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                            PiRunner                             │
│                                                                 │
│   Workflow Controller      Transition Registry      Guard Engine│
│   Event Journal (Append)   Artifact Store (AJV)     Test Lock   │
│   Capability Sandbox       Subprocess Runner        HITM Gates  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Invariants

1. **Natural Chat with Explicit HITM Decision Gates:** Chat normally in the Pi terminal. The active agent answers within its governance persona. When a task produces a typed artifact, PiRunner intercepts turn completion and presents an explicit HITM decision dialog (`ctx.ui.confirm` / `ctx.ui.select`) appropriate to the workflow context — accept/reject reviews, push/hold decisions, sprint continuation, skill publication, and planning intent. Each decision is naturally presented at the point where the decision becomes necessary.
2. **Authoritative Test Authoring Before Implementation:** Acceptance tests are derived exclusively from accepted specifications by the test-authoring specialist before implementation begins. Tests never derive expected behavior from implementation control flow.
3. **Immutable Test-Suite Locking:** Reaching `TEST_READY` hashes the declared test suite (SHA-256) into `.hitm/test-suite.lock.json`. The implementation agent consumes the suite as a read-only contract and cannot modify tests.
4. **Deterministic Subprocess Test Execution:** Test results are evaluated by deterministic infrastructure (`RealDeterministicTestRunner`) in an isolated subprocess (`npm test`), never by an LLM self-reporting success.
5. **Fail-Closed Guard Engine:** 83 transition guards actively verify live Git state, artifact schemas, review findings, and test locks. Any missing evaluator or unsatisfied condition immediately aborts the transition.
6. **Invocation-Scoped Sandboxing:** Tool calls are authorized per executing agent invocation. Destructive operations (`git push`, `git reset --hard`, `git checkout -f`, `rm -rf`) are blocked at the capability boundary.
7. **Skill Anti-Proliferation Invariant:** A procedure graduates into a reusable skill only after **≥3 verified real uses** in event or devlog records.
8. **Durable Resumption without Guesswork:** Restarting Pi replays `.hitm/events.jsonl` and independently validates Git revision, branch, working tree cleanliness, and test locks before allowing continuation.

---

## Project-Scoped Agent Roster

PiRunner canonicalizes backend roles while generating unique randomized 4-digit IDs and `(Positive Emotion) (Technological Descriptor)` operational names per project:

| Canonical Role | Default Operational Name | Write Boundary | Authority Boundary |
|---|---|:---:|---|
| **`CONCEPT`** | Resolute Aether | None | Concept development; produces `ConceptPackage` |
| **`SPECIFICATION`** | Serene Codex | None | Technical architecture; produces `MasterSpecification` |
| **`PLANNING`** | Curious Automaton | None | Sprint planning; produces `DailyPlan` + `SprintSpecification` |
| **`KNOWLEDGE`** | Joyful Graph | None | Lockfile & symbol synchronization; produces `KnowledgeSnapshot` |
| **`TEST_AUTHORING`** | Methodical Scribe | `tests/**` only | Derives black-box tests; produces `TestSpecification` |
| **`IMPLEMENTATION`** | Confident Forge | `src/**` only | Satisfies locked tests; produces `ImplementationResult` |
| **`TRIAGE`** | Patient Oracle | None | Diagnoses failure root causes; produces `TriageReport` |
| **`REVIEW`** | Satisfied Sentinel | None | Evaluates implementation vs tests; produces `ReviewResult` |
| **`DEVLOG`** | Reflective Ledger | None | Daily engineering records; produces `DailyDevlog` |
| **`SKILL_ARCHITECT`** | Inventive Weaver | `skills/**` only | Synthesizes skills under the ≥3 uses rule; produces `SkillPackage` |
| **`PUBLICATION`** | Inspired Signal | None | Release preparation; produces `PublicationPackage` |

The active agent is permanently displayed in the Pi terminal footer as `[ID OPERATIONAL NAME]` (e.g. `[4819 Resolute Scribe]`).

---

## Canonical Lifecycle

```text
PROJECT_DISCOVERY
      │
      ├─► NEW_PROJECT ──────► CONCEPT ──► SPECIFICATION ──► PLANNING
      │                                                          │
      ├─► ADOPT_EXISTING ───► INTAKE ──► BASELINE ──► KNOWLEDGE ─┘
      │                                                  │
      └─► RESUME ───────────► RECOVERY ──► VALIDATION ───┘
                                                │
       ┌────────────────────────────────────────┘
       ▼
  SPRINT_READY
       │
       ▼
  TEST_AUTHORING ──────► TEST_READY (Authoritative Suite Locked)
                               │
       ┌───────────────────────┘
       ▼
  IMPLEMENTATION ──────► Deterministic Subprocess Runner (npm test)
       │
       ▼
  COMMIT_CREATED
       │
       ▼
    REVIEW ────────────► SPRINT_ACCEPTED ──► PUSH_GATE ──► REMOTE_PUBLISHED
       │                       │
     (FAIL)                    ▼
       ▼                SKILL_SYNTHESIS (≥3 Uses Anti-Proliferation)
    REWORK                     │
       │                       ▼
       └────────────────►   PLANNING
```

---

## Quickstart

### 1. Build and Verify
```bash
git clone https://github.com/McHearty/PiRunner.git
cd PiRunner
npm install
npm run build
npm test
```

### 2. Install into Pi
Deploy the compiled extension to your local repository:
```bash
mkdir -p .pi/agent/extensions
cp dist/extension.js .pi/agent/extensions/hitm.js
```

### 3. Launch Pi
Run Pi with your local or cloud model:
```bash
# Using a local model endpoint:
pi --model <local-model-name>

# Or passing the extension directly:
pi --extension ./dist/extension.js
```

---

## Interactive Slash Commands

| Command | Description |
|---|---|
| `/hitm-status` | Displays current workflow state, active `[ID NAME]` badge, lock status, and **allowed next transitions**. |
| `/hitm-prompt` | Displays the active agent's fully composed governance sub-prompt and role boundary. |
| `/hitm-approve [STATE]` | Authorizes a state transition requiring human approval. Prompts with a native confirmation dialog. |
| `/hitm-test` | Executes `RealDeterministicTestRunner` against the locked test suite hash via live subprocess (`npm test`). |
| `/hitm-roster [regenerate]` | Displays or re-rolls the project's randomized agent IDs and emotional-technological names. |

For the complete step-by-step operational walkthrough, see [USAGE.md](USAGE.md).  
For the formal normative specification and state transitions, see [TECHSPEC.md](TECHSPEC.md).
