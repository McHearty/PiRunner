# HITM-Orchestrated Multi-Agent Workflow
## Native Pi Agent Harness Extension (TECHSPEC v1.3.0)

Deterministic orchestration layer and native **Pi Agent Harness Extension** structured around specialized LLM coding agents. 

The system is explicitly **not** an autonomous software-development swarm. Human-In-The-Middle (HITM) retains exclusive authority over specifications, architectural decisions, ambiguous requirements, judgment transitions, and remote publication.

---

## Core Architectural Principles

1. **Native Pi Harness Driver:** Operates directly inside the Pi Coding Agent interactive terminal as an extension driver, enforcing real-time tool sandboxing and interactive HITM gate approvals.
2. **Independent Test Authoring:** `0120 Methodical Scribe` derives executable tests from accepted specifications before implementation begins. It cannot modify production code (`src/**`) and never derives expected behavior from current implementation behavior.
3. **Immutable Test Suites:** Once `TEST_READY` is reached, the test suite is canonically hashed (SHA-256) and locked. `0060 Confident Forge` (Implementation) consumes the authoritative tests as read-only contracts and cannot modify them.
4. **Deterministic Subprocess TestRunner:** Live test execution is performed by deterministic infrastructure (`RealDeterministicTestRunner`), not an LLM. Tests are executed in an isolated OS subprocess, hashing actual files on disk.
5. **Self-Hosting / Continuous Self-Development:** The harness is capable of dogfooding itself—driving its own requirements, tests, implementation, and review loops to develop and amend its own repository.
6. **Pure Reducer & Monotonic Replay:** State is the pure reduction of an append-only event stream (`WorkflowEvent[]`). Replay reconstructs historical state without invoking models.

---

## System Architecture

```text
               Pi Coding Agent Interactive CLI
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       /hitm-* Slash Commands         pi.on('tool_call')
      (/hitm-approve, /hitm-test)     (PathCapabilityEnforcer)
               │                             │
               └──────────────┬──────────────┘
                              ▼
                   HITM WorkflowController
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
       Test Authoring                   Implementation
       (Agent 0120)                     (Agent 0060)
              │                               │
              ▼                               │
       TestSpecification                      │
              │                               │
              └───────────────┬───────────────┘
                              ▼
                     Immutable Test Suite
                              │
                              ▼
                 RealDeterministicTestRunner
                   (Live Subprocess Exec)
                              │
                              ▼
                     Review (Agent 0084)
                              │
                              ▼
                     HITM Gate (Lead Human)
```

Agent Topology

Ten specialized agents with four-digit IDs divisible by 12:

| ID       | Operational Name   | Primary Responsibility          | Production Code | Test Code | Authority |
| -------- | ------------------ | ------------------------------- | :-------------: | :-------: | :-------: |
| **0012** | Resolute Aether    | Concept Development             | No              | No        | No        |
| **0024** | Serene Codex       | Master Technical Specification  | No              | No        | No        |
| **0036** | Curious Automaton  | Planning / Sprint Decomposition | No              | No        | No        |
| **0048** | Joyful Graph       | Knowledge Provider              | No              | No        | No        |
| **0060** | Confident Forge    | Primary Implementation          | **Yes**         | **No**    | No        |
| **0072** | Patient Oracle     | Dedicated Triage & Diagnosis    | No              | No        | No        |
| **0084** | Satisfied Sentinel | Primary Review                  | No              | No        | No        |
| **0096** | Reflective Ledger  | Daily Development Record        | No              | No        | No        |
| **0108** | Inspired Signal    | Publication Preparation         | No              | No        | No        |
| **0120** | Methodical Scribe  | Dedicated Test Authoring        | **No**          | **Yes**   | No        |

Quickstart & Verification

Build & Test Core Engine

npm install
npm run build
npm test

Install into Pi Coding Agent

# Register globally in your user Pi configuration:
mkdir -p ~/.pi/agent/extensions
cp ./dist/extension.js ~/.pi/agent/extensions/hitm.js

# Or run ad-hoc:
pi --extension ./dist/extension.js

