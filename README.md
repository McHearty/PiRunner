
# PiRunner
## Deterministic HITM Orchestration Extension for the Pi Agent Harness
**Specification:** TECHSPEC v1.3.0 (Normative)  
**Implementation Target:** TypeScript / Node.js (NodeNext ESM)  
**Runtime:** Pi Coding Agent / Pi Agent Harness  
**Repository:** `McHearty/PiRunner`  

---

## 1. Overview

**PiRunner** is a deterministic orchestration extension for the Pi Agent Harness.

Pi provides the probabilistic agent runtime, session management, model interaction, TUI, and tool execution. **PiRunner provides deterministic workflow authority around that runtime.**

PiRunner is **not** an autonomous multi-agent swarm. Probabilistic LLM agents perform bounded engineering tasks within strict runtime boundaries; deterministic PiRunner infrastructure decides whether that work may advance the workflow.

```text
┌───────────────────────────────────────────────────────────────┐
│                              Pi                               │
│                         Agent Harness                         │
│  Agent runtime · Model session · Tool execution · TUI         │
└───────────────────────────────┬───────────────────────────────┘
                                │ native extension
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                           PiRunner                            │
│                                                               │
│   Workflow Controller     Transition Registry     Guard Engine│
│   Event Journal           Artifact Store          Test Lock   │
│   Capability Sandbox      Deterministic Runner    HITM Gates  │
└───────────────────────────────────────────────────────────────┘
```

The human engineer remains the ultimate authority over project intent, specification acceptance, architectural decisions, ambiguous requirements, exceptional recovery, and remote publication.

---

## 2. Core Architectural Principles

1. **Independent Authoritative Test Authoring:** `0120 Methodical Scribe` derives executable tests exclusively from accepted specifications and acceptance criteria *before* implementation begins. It is physically blocked from modifying production code (`src/**`) and never derives expected behavior from implementation control flow.
2. **Authoritative Test-Suite Locking:** Upon reaching `TEST_READY`, the test suite is canonically hashed (SHA-256) and locked into `.hitm/test-suite.lock.json`. `0060 Confident Forge` (Implementation) consumes the tests as read-only contracts and cannot modify them.
3. **Deterministic Subprocess Test Execution:** Test execution is performed by deterministic infrastructure (`RealDeterministicTestRunner`), not an LLM. Tests execute in an isolated OS subprocess, hashing actual files on disk.
4. **Fail-Closed Guard System:** Transitions are governed by 83 deterministic guards. If an attached guard fails or has no valid evaluator, the transition is immediately rejected.
5. **Closed-Loop Agent Execution:** `/hitm-run` dispatches specialized agents with their layered governance prompts, captures streaming model output, extracts typed JSON artifacts, validates schemas via strict Draft 2020-12 AJV, persists them to `ArtifactStore`, and automatically advances the workflow.
6. **Invocation-Scoped Capability Sandboxing:** Tool calls (`write`, `edit`, `bash`, `exec`) are authorized per executing `AgentInvocation.agentId`. Destructive commands (`git push`, `git reset --hard`, `git checkout -f`, `rm -rf`) are actively blocked.
7. **Durable Event Journal & Safe Resumption:** State is the pure reduction of an append-only event stream (`.hitm/events.jsonl`). Process restarts do not trust caller metadata; `StateValidationService` independently compares recovered event history against live Git revision, branch, working tree, and test lock files before permitting continuation.

---

## 3. Project Entry & Adoption Model

PiRunner deterministically classifies workspace entry into one of three paths:

```text
                         PROJECT_DISCOVERY
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       NEW_PROJECT       ADOPT_EXISTING      RESUME_WORKFLOW
             │                  │                  │
             ▼                  ▼                  ▼
          CONCEPT         PROJECT_INTAKE     STATE_RECOVERY
                                │                  │
                                ▼                  ▼
                         PROJECT_BASELINE    STATE_VALIDATION
                                │                  │
                                ▼                  ├─ MATCH ──► [Canonical State]
                          KNOWLEDGE_SYNC           │
                                │                  └─ MISMATCH ► REPOSITORY_CONFLICT
                                ▼
                             PLANNING
```

- **`NEW_PROJECT`:** Initializes a fresh project from `CONCEPT`.
- **`ADOPT_EXISTING_PROJECT`:** Discovers existing Git repositories, documents source/test/CI assets, generates an accepted `ProjectBaseline` artifact without claiming historical ownership, and advances to `PLANNING`.
- **`RESUME_WORKFLOW`:** Replays the canonical event journal across process restarts and verifies that live Git and test locks match before resuming.

---

## 4. Agent Topology

Ten specialized agents with four-digit IDs divisible by 12:

| ID | Operational Name | Primary Responsibility | Production Code | Test Code | Authority Boundary |
|---|---|---|:---:|:---:|:---:|
| **0012** | Resolute Aether | Concept Development | No | No | Read-only; produces `ConceptPackage` |
| **0024** | Serene Codex | Master Technical Specification | No | No | Read-only; produces `MasterSpecification` |
| **0036** | Curious Automaton | Planning / Sprint Decomposition | No | No | Read-only; produces `DailyPlan` + `SprintSpecification` |
| **0048** | Joyful Graph | Knowledge Provider | No | No | Read-only; produces `KnowledgeSnapshot` |
| **0060** | Confident Forge | Primary Implementation | **Yes** | **No** | Writable in `src/**`; tests strictly read-only |
| **0072** | Patient Oracle | Dedicated Triage & Diagnosis | No | No | Strictly read-only; classifies root causes |
| **0084** | Satisfied Sentinel | Primary Review | No | No | Strictly read-only; evaluates implementation against tests |
| **0096** | Reflective Ledger | Daily Development Record | No | No | Strictly read-only; produces `DailyDevlog` |
| **0108** | Inspired Signal | Publication Preparation | No | No | Strictly read-only; produces `PublicationPackage` |
| **0120** | Methodical Scribe | Authoritative Test Authoring | **No** | **Yes** | Writable in `tests/**`; production code strictly read-only |

---

## 5. Directory Structure

```text
PiRunner/
├── .hitm/                        # Canonical workflow persistence
│   ├── events.jsonl              # Append-only monotonic event journal
│   ├── artifacts/                # Validated typed JSON artifacts
│   └── test-suite.lock.json      # Authoritative test suite lock (SHA-256)
├── schemas/                      # 13 Normative JSON Schemas (Draft 2020-12)
├── src/
│   ├── domain/
│   │   ├── workflow/             # State machine, events, config, transitions, guards
│   │   ├── artifacts/            # ArtifactStore, Validator, Ingestion pipeline
│   │   ├── project/              # Discovery, Intake, Baseline, Recovery, Validation
│   │   ├── testing/              # TestRunner port, TestSuiteHasher, TestSuiteLock
│   │   ├── repository/           # RepositoryPort, PathCapabilityEnforcer
│   │   ├── triage/               # FailureSignature normalizer, StuckDetector
│   │   └── knowledge/            # KnowledgeProvider port
│   ├── application/
│   │   └── WorkflowController.ts # Hexagonal HITM orchestrator service
│   ├── infrastructure/
│   │   ├── pi/                   # Pi Coding Agent SDK adapter (PiAgentRunner)
│   │   ├── git/                  # GitRepository adapter (implements RepositoryPort)
│   │   ├── testing/              # RealDeterministicTestRunner, FakeTestRunner
│   │   ├── artifacts/            # FileArtifactStore
│   │   └── events/               # FileEventStore (transactional append)
│   ├── agents/                   # Base governance prompt, agent sub-prompts, registry
│   ├── extension.ts              # Native Pi Agent Harness extension entrypoint
│   └── index.ts                  # Public barrel export
└── tests/                        # 15 verification suites (50 unit & integration tests)
```

---

## 6. Installation & Verification

### Build & Test Core Engine
```bash
npm install
npm run build
npm test
```

### Install Extension into Pi
```bash
# Option A: Deploy to local repository extension directory (recommended)
mkdir -p .pi/agent/extensions
cp dist/extension.js .pi/agent/extensions/hitm.js

# Option B: Run directly via CLI flag
pi --extension ./dist/extension.js
```

---

## 7. Interactive Pi Slash Commands

When loaded into Pi, PiRunner registers interactive commands in the agent terminal:

| Command | Description |
|---|---|
| `/hitm-status` | Displays current state, entry mode, active agent, lock status, and **allowed legal forward transitions**. |
| `/hitm-prompt` | Displays the active agent's fully composed governance sub-prompt and role boundary. |
| `/hitm-approve [STATE]` | Authorizes a state transition requiring Human Authority (`ALWAYS`). Prompts with a native confirmation dialog. |
| `/hitm-run [PROMPT]` | Dispatches the active agent with context artifacts, ingests the emitted JSON, validates schema, and advances the workflow. |
| `/hitm-test` | Executes `RealDeterministicTestRunner` against the locked test suite hash using an isolated subprocess (`npm test`). |

For a complete step-by-step walkthrough of a full sprint lifecycle, see [USAGE.md](USAGE.md).  
For the formal normative architecture and state definitions, see [TECHSPEC.md](TECHSPEC.md).
