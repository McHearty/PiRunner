# HITM-Orchestrated Multi-Agent Engineering Workflow
## Technical Implementation Specification

**Version:** 1.3.0  
**Status:** Normative  
**Supersedes:** 1.2.0  
**Date:** 2026-10-04  
**Implementation Target:** TypeScript / Node.js  
**Agent Runtime:** Pi Coding Agent / Pi Agent Harness  
**Control Model:** Human-In-The-Middle (HITM)  
**Repository Model:** Git  
**Primary Persistence:** Append-only workflow event history + validated typed artifacts  
**Extension:** PiRunner  
**Repository:** `McHearty/PiRunner`

---

## 1. Purpose

PiRunner is a deterministic orchestration extension for the Pi Agent Harness.

Pi provides the underlying agent runtime, session management, tool execution, TUI, model interaction, and agent execution environment.

PiRunner provides deterministic workflow authority around that runtime.

PiRunner is **not** a standalone multi-agent framework and does not replace Pi.

The architectural relationship is:

```text
┌───────────────────────────────────────────────────────┐
│                         Pi                            │
│                                                       │
│  Agent runtime                                        │
│  Session management                                   │
│  Model interaction                                    │
│  Tool execution                                       │
│  TUI                                                  │
└──────────────────────────┬────────────────────────────┘
                           │
                           │ native extension
                           ▼
┌───────────────────────────────────────────────────────┐
│                      PiRunner                         │
│                                                       │
│  Workflow Controller                                  │
│  Workflow State / Reducer                             │
│  Transition Registry                                  │
│  Guard System                                         │
│  Artifact System                                      │
│  Event Journal                                        │
│  Agent Role System                                    │
│  Capability Enforcement                               │
│  Test Governance                                      │
│  Deterministic Test Runner                            │
│  Repository Control                                   │
│  HITM Interface                                       │
└───────────────────────────────────────────────────────┘
```

Pi executes agents.

PiRunner determines:

- which agent may execute;
- what task that agent may perform;
- what capabilities the agent possesses;
- what artifacts are authoritative;
- whether a proposed transition is legal;
- whether all transition guards are satisfied;
- whether repository state permits the transition;
- whether tests constitute valid evidence;
- whether human approval is required;
- what the canonical workflow state is;
- how workflow state survives process restart;
- how an existing project is adopted;
- how an existing PiRunner workflow is resumed.

The system is explicitly **not** an autonomous software-development swarm.

The human remains the authority over:

- project intent;
- specification acceptance;
- architectural changes;
- ambiguous requirements;
- exceptional recovery;
- adoption decisions;
- repository conflicts;
- irreversible repository operations;
- workflow transitions requiring human approval;
- remote publication.

LLM agents provide probabilistic reasoning and bounded execution within narrowly defined responsibilities.

The central execution model is:

```text
Human Decision
      │
      ▼
Typed Artifact
      │
      ▼
Deterministic Validation
      │
      ▼
Deterministic Guard Evaluation
      │
      ▼
HITM State Transition
      │
      ▼
Specialized Agent
      │
      ▼
Typed Artifact
      │
      ▼
Deterministic Validation
      │
      ▼
HITM
```

The system must never depend on an LLM to determine whether a workflow transition is valid.

Governing principle:

> Probabilistic agents may propose and perform bounded engineering work; deterministic PiRunner infrastructure decides whether that work may advance the workflow.

---

## 2. Design Goals

1. Native integration with the Pi Agent Harness.
2. Explicit specialization of agent responsibilities.
3. Deterministic workflow transitions.
4. Deterministic runtime guard evaluation.
5. Human approval at authority boundaries.
6. Typed, versioned artifacts between agents.
7. Append-only workflow history.
8. Persistent workflow recovery across PiRunner process restarts.
9. Reproducible agent invocations.
10. Runtime capability restrictions.
11. Repository isolation.
12. Explicit project-entry classification.
13. Safe adoption of existing repositories.
14. Safe resumption of existing PiRunner workflows.
15. Explicit repository baseline establishment.
16. Explicit state/repository consistency validation.
17. Explicit stuck-agent detection.
18. Dedicated implementation triage.
19. Dedicated authoritative test authoring.
20. Deterministic test execution.
21. Canonical test-suite identity and locking.
22. API/project knowledge synchronization.
23. Specification-to-test-to-implementation traceability.
24. Review/rework iteration limits.
25. Controlled repository publication.
26. Human-readable daily development records.
27. Optional publication/social-media preparation.
28. Context-efficient agent prompts.
29. No implicit agent-to-agent authority.
30. No autonomous workflow mutation by LLM output.
31. Deterministic recovery from agent, repository, artifact, and infrastructure failures.
32. Explicit distinction between pre-existing work and PiRunner-controlled work.
33. Preservation of historical provenance.
34. No retroactive fabrication of workflow history.

---

## 3. Non-Goals

PiRunner shall not:

- create an autonomous multi-agent swarm;
- allow agents to spawn arbitrary agents;
- allow an agent to redefine its own role;
- allow an agent to bypass PiRunner;
- allow an agent to redefine transition rules;
- allow an agent to approve its own transition;
- allow the implementation agent to silently alter the accepted master specification;
- allow the reviewer to rewrite implementation code;
- allow triage to silently implement fixes;
- allow the test-authoring agent to modify production source;
- allow implementation agents to modify authoritative tests;
- allow agents to push to remote repositories without the explicit publication gate;
- treat LLM-generated prose as authoritative workflow state;
- infer workflow state from natural-language responses;
- rely exclusively on prompts to enforce permissions;
- treat existing tests as authoritative merely because they already exist;
- treat existing specifications as authoritative merely because they already exist;
- treat existing commits as PiRunner implementation results;
- retroactively fabricate PiRunner workflow history;
- silently discard, stash, reset, overwrite, or commit a dirty working tree during adoption;
- silently reconcile a repository/workflow-state mismatch during resume;
- allow arbitrary third-party Pi extensions without explicit installation/trust;
- use model-generated transition names or transition rules.

---

## 4. Core Architectural Model

PiRunner uses a hexagonal architecture.

```text
                           ┌───────────────────┐
                           │        Pi         │
                           │   Agent Harness   │
                           └─────────┬─────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────┐
│                       PiRunner                            │
│                                                           │
│                 ┌──────────────────────┐                  │
│                 │ Workflow Controller   │                  │
│                 └──────────┬───────────┘                  │
│                            │                              │
│          ┌─────────────────┼──────────────────┐           │
│          │                 │                  │           │
│          ▼                 ▼                  ▼           │
│     Workflow State     Transition          Guard         │
│       / Reducer        Registry            System         │
│          │                 │                  │           │
│          └─────────────────┼──────────────────┘           │
│                            │                              │
│       ┌────────────────────┼────────────────────┐         │
│       │                    │                    │         │
│       ▼                    ▼                    ▼         │
│   Artifact System     Event Journal       Repository      │
│       │                    │                    │         │
│       ▼                    ▼                    ▼         │
│   Artifact Port       Event Store        Repository Port  │
│                                                           │
│       ┌────────────────────┬────────────────────┐         │
│       ▼                    ▼                    ▼         │
│  Agent Runner         Test Runner          Knowledge      │
│     Port                  Port              Provider      │
└───────────────────────────────────────────────────────────┘
```

Pi-specific classes belong only to infrastructure adapters.

The domain layer must not import Pi-specific classes.

Core agent port:

```ts
interface AgentRunner {
  start(invocation: AgentInvocation): Promise<AgentExecution>;
  send(invocationId: string, message: AgentMessage): Promise<void>;
  cancel(invocationId: string): Promise<void>;
  observe(invocationId: string): AsyncIterable<AgentEvent>;
  close(invocationId: string): Promise<void>;
}
```

The authoritative workflow controller owns transition authority.

No Pi callback, agent response, or natural-language output may directly mutate workflow state.

---

## 5. Project Entry Model

PiRunner must distinguish three project-entry modes.

```text
                         PiRunner Start
                              │
                              ▼
                      PROJECT_DISCOVERY
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
       NEW_PROJECT     ADOPT_EXISTING    RESUME_WORKFLOW
                              │                │
                              ▼                ▼
                       PROJECT_INTAKE     STATE_RECOVERY
                              │                │
                              ▼                ▼
                       PROJECT_BASELINE   STATE_VALIDATION
                              │                │
                              └───────┬────────┘
                                      │
                                      ▼
                                   PLANNING
```

### 5.1 NEW_PROJECT

`NEW_PROJECT` applies when:

- no existing implementation requires adoption; or
- the repository is explicitly being initialized as a new project.

Flow:

```text
PROJECT_DISCOVERY
      │
      ▼
NEW_PROJECT
      │
      ▼
CONCEPT
```

The normal concept/specification lifecycle follows.

### 5.2 ADOPT_EXISTING_PROJECT

`ADOPT_EXISTING_PROJECT` applies when:

- a repository already exists;
- implementation, documentation, tests, history, or configuration already exist;
- PiRunner has no canonical workflow history for that project.

Adoption does not mean that PiRunner claims historical ownership of the existing work.

Flow:

```text
PROJECT_DISCOVERY
      │
      ▼
PROJECT_INTAKE
      │
      ▼
PROJECT_BASELINE
      │
      ▼
KNOWLEDGE_SYNC
      │
      ▼
PLANNING
```

Existing work is recorded as baseline evidence.

Existing Git commits remain historical repository commits.

Existing implementation is an implementation baseline, not an `ImplementationResult`.

Existing tests are not automatically authoritative.

Existing specifications are not automatically authoritative.

### 5.3 RESUME_WORKFLOW

`RESUME_WORKFLOW` applies when:

- a canonical PiRunner event journal exists;
- the workflow identity is recoverable;
- the event history is valid;
- the repository can be validated against the recorded workflow state.

Flow:

```text
PROJECT_DISCOVERY
      │
      ▼
STATE_RECOVERY
      │
      ▼
STATE_VALIDATION
      │
      ├──────── MATCH ──────────► CURRENT WORKFLOW STATE
      │
      └──────── MISMATCH ───────► REPOSITORY_CONFLICT
```

Agent conversational memory is never sufficient evidence for workflow resumption.

---

## 6. Project Discovery

`PROJECT_DISCOVERY` is deterministic infrastructure.

It determines:

- repository identity;
- Git availability;
- current revision;
- branch;
- working-tree status;
- existence of `.hitm/` persistence;
- existence of canonical workflow event history;
- existence of project specifications;
- existence of test suites;
- project/build metadata.

Discovery must not modify the repository.

Project classification must produce one explicit entry mode.

It must not infer:

```text
existing repository == resume
```

or:

```text
existing repository == new project
```

Existing repository with no PiRunner history is an adoption candidate.

Existing repository with valid PiRunner history is a resume candidate.

Ambiguous cases require `HUMAN_GATE`.

---

## 7. Project Intake

`PROJECT_INTAKE` analyzes an existing project before PiRunner begins controlling future work.

The intake process must inspect, where applicable:

- repository identity;
- current revision;
- branch;
- working-tree state;
- source tree;
- build system;
- dependency manifests;
- dependency lock files;
- CI configuration;
- existing specifications;
- existing tests;
- documentation;
- generated artifacts;
- project-specific tooling;
- known unresolved questions.

The intake process must not silently modify the repository.

### 7.1 Existing Specification Classification

Existing specifications are classified as:

```text
NO_SPECIFICATION
EXISTING_SPECIFICATION
MULTIPLE_SPECIFICATIONS
STALE_SPECIFICATION
CONTRADICTORY_SPECIFICATIONS
```

Existing specifications may become inputs to specification review.

They do not become authoritative merely by existence.

Conflicting specifications must move upward to human/specification review.

### 7.2 Existing Test Classification

Existing tests are classified as:

```text
AUTHORITATIVE
NON_AUTHORITATIVE
UNKNOWN
STALE
CONTRADICTORY
```

A test suite becomes authoritative only through an explicit PiRunner test-authoring/acceptance path.

Existing tests may be used as evidence during intake.

They must not automatically define acceptance behavior.

---

## 8. ProjectBaseline Artifact

Adoption produces a `ProjectBaseline` artifact.

Normative model:

```ts
interface ProjectBaseline {
  repositoryIdentity: string;
  baseRevision: string;
  branch: string;
  workingTreeState: "CLEAN" | "DIRTY";
  projectType: string;
  buildSystem: string | null;

  specificationRefs: SourceRef[];
  testRefs: SourceRef[];
  documentationRefs: SourceRef[];

  dependencyLockHash: string | null;

  sourceInventory: SourceRef[];
  testInventory: SourceRef[];
  existingCiConfiguration: SourceRef[];

  detectedUncommittedChanges: string[];
  unresolvedProjectQuestions: string[];

  intakeTimestamp: string;
  repositorySnapshotHash: string;
}
```

The baseline describes the state of the project at adoption.

It is not an approval.

It is not an `ImplementationResult`.

It does not claim PiRunner ownership of historical changes.

The baseline must include sufficient repository identity and content evidence to detect later divergence.

---

## 9. Dirty Working Tree During Adoption

A dirty working tree must be explicitly detected.

PiRunner must not silently:

- reset;
- stash;
- discard;
- overwrite;
- commit;
- amend;
- clean;
- checkout another branch.

Possible human dispositions are:

```text
PRESERVE
COMMIT_EXTERNALLY
STASH
RESET
ABORT
```

The selected disposition must become workflow evidence.

If the user chooses `PRESERVE`, PiRunner must not treat the resulting changes as PiRunner-generated implementation.

Before controlled implementation begins, the workflow must establish an explicit repository-state policy.

The default policy is:

> Implementation begins only from a repository state whose ownership and expected mutations are unambiguous.

---

## 10. Existing Branch Handling

Project intake records:

```text
DEFAULT
FEATURE
RELEASE
UNKNOWN
DETACHED_HEAD
```

PiRunner must not silently switch branches.

Unexpected branches, detached HEAD state, or ambiguous repository ownership may require `HUMAN_GATE`.

---

## 11. Agent Topology

Ten specialized agents exist in v1.3.0.

Each identifier is a four-digit number divisible by 12.

| ID | Operational Name | Primary Responsibility |
|---|---|---|
| 0012 | Resolute Aether | Concept Development |
| 0024 | Serene Codex | Master Specification |
| 0036 | Curious Automaton | Planning / Sprint Decomposition |
| 0048 | Joyful Graph | Knowledge Provider |
| 0060 | Confident Forge | Implementation |
| 0072 | Patient Oracle | Triage |
| 0084 | Satisfied Sentinel | Review |
| 0096 | Reflective Ledger | Daily Devlog |
| 0108 | Inspired Signal | Publication Preparation |
| 0120 | Methodical Scribe | Authoritative Test Authoring |

Names are identifiers only.

Authority is determined solely by:

- workflow state;
- artifact contracts;
- transition guards;
- runtime capabilities.

---

## 12. Agent Responsibilities

### 0012 — Resolute Aether

Concept development.

Produces:

`ConceptPackage`

Must not:

- prescribe implementation details;
- modify production source;
- redefine workflow transitions.

### 0024 — Serene Codex

Master technical specification.

Produces:

`MasterSpecification`

May refine technical design below explicit human decisions.

Must not silently override accepted human decisions.

### 0036 — Curious Automaton

Planning and sprint decomposition.

Produces:

- `DailyPlan`
- `SprintSpecification`

Must not alter the accepted master specification.

Contradictions become blockers.

### 0048 — Joyful Graph

Knowledge provider.

Produces:

`KnowledgeSnapshot`

Does not redefine workflow state.

### 0060 — Confident Forge

Primary implementation agent.

Only normal workflow agent authorized to modify production source.

May:

- modify production source;
- run permitted development commands;
- create implementation commits.

May not:

- modify authoritative tests;
- push to remote;
- approve its own implementation;
- redefine accepted requirements.

Produces:

`ImplementationResult`

### 0072 — Patient Oracle

Dedicated triage agent.

Produces:

`TriageReport`

Diagnoses blockers and proposes disposition.

May not silently implement fixes.

### 0084 — Satisfied Sentinel

Primary reviewer.

Produces:

`ReviewResult`

May inspect:

- specification;
- tests;
- implementation;
- repository state;
- execution evidence.

Must not modify production source.

### 0096 — Reflective Ledger

Daily development record.

Produces:

`DailyDevlog`

Descriptive only.

### 0108 — Inspired Signal

Optional publication preparation.

Produces:

`PublicationPackage`

Must not invent accomplishments.

### 0120 — Methodical Scribe

Authoritative test author.

Produces:

`TestSpecification`

Responsibilities:

- derive executable acceptance tests from accepted specifications;
- establish requirement-to-test traceability;
- define expected behavior from accepted contracts;
- author and maintain the authoritative test suite;
- verify authored tests syntactically/structurally;
- prepare tests for deterministic execution.

Must not:

- modify production source;
- modify accepted specifications;
- perform workflow decisions;
- approve implementation;
- approve its own workflow transition;
- execute authoritative test results as an authority substitute for the deterministic TestRunner.

---

## 13. Authority Hierarchy

```text
Human Decision
      │
      ▼
ConceptPackage
      │
      ▼
MasterSpecification
      │
      ▼
DailyPlan / SprintSpecification
      │
      ▼
TestSpecification
      │
      ▼
Implementation
      │
      ▼
Review
      │
      ▼
HITM Workflow State
```

A lower-level artifact may not silently override a higher-level artifact.

Contradictions move upward.

Tests derive expected behavior from accepted requirements and acceptance criteria.

They do not derive expected behavior from current implementation control flow.

---

## 14. Concurrency & Isolation Model

```text
Workflow (workflowId)
  ├── Task A → isolated workspace + branch
  ├── Task B → isolated workspace + branch
  └── Task C → isolated workspace + branch
```

Rules:

- Workflow concurrency is allowed.
- Task concurrency is allowed when workspace and branch isolation exists.
- Same-task concurrent implementation agents are prohibited.
- Repository mutation is serialized per repository.
- Commit/branch/checkout operations are serialized per repository.
- Remote publication is serialized.
- Remote publication requires explicit HITM approval.
- Event sequence numbers are monotonic and unique per workflow.
- Test-authoring and implementation capabilities are mutually exclusive for the same controlled task.
- Authoritative test files cannot be modified during implementation.
- Production source cannot be modified by the test-authoring agent.

---

## 15. Event Model

```ts
interface WorkflowEvent {
  eventId: string;
  workflowId: string;
  sequence: number;
  taskId?: string;

  type: string;

  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId: string;

  timestamp: string;

  stateBefore: WorkflowState;
  stateAfter: WorkflowState;

  artifactIds: string[];

  metadata: Record<string, unknown>;
}
```

`sequence` is:

- scoped to `workflowId`;
- monotonic;
- unique;
- starting at zero.

Events are immutable.

The event journal is authoritative.

Current state is the pure reduction of the ordered event sequence.

A materialized state projection may be used for performance but is never authoritative over the event journal.

---

## 16. Workflow Persistence

Canonical workflow history must survive PiRunner process termination.

Persistent storage must contain at least:

```text
.hitm/
  events.jsonl
  artifacts/
  workflow/
```

The event journal must be append-only.

Startup must:

1. load the event journal;
2. validate event ordering;
3. validate event identity;
4. validate workflow identity;
5. replay the reducer;
6. recover canonical workflow state;
7. validate repository state;
8. resume only if validation succeeds.

An in-memory event store may be used for isolated unit tests.

It is not sufficient for production workflow persistence.

---

## 17. Workflow States

### Project Entry / Recovery

```text
PROJECT_DISCOVERY
PROJECT_INTAKE
PROJECT_BASELINE
STATE_RECOVERY
STATE_VALIDATION
```

### Primary Workflow

```text
CONCEPT
CONCEPT_REVIEW

SPECIFICATION
SPECIFICATION_REVIEW

PLANNING
KNOWLEDGE_SYNC
SPRINT_READY

TEST_AUTHORING
TEST_READY

IMPLEMENTATION
TRIAGE
REWORK
COMMIT_CREATED
REVIEW

SPRINT_ACCEPTED
PUSH_GATE
REMOTE_PUBLISHED
SPRINT_COMPLETE

DAY_COMPLETE
DIARY
PUBLICATION_READY
PUBLISHED
```

### Failure / Control

```text
BLOCKED
HUMAN_GATE
AGENT_FAILED
REPOSITORY_CONFLICT
ARTIFACT_INVALID
ABORT
```

---

## 18. Canonical Entry Flows

### New project

```text
PROJECT_DISCOVERY
      │
      ▼
NEW_PROJECT
      │
      ▼
CONCEPT
      │
      ▼
CONCEPT_REVIEW
      │
      ▼
SPECIFICATION
      │
      ▼
SPECIFICATION_REVIEW
      │
      ▼
PLANNING
```

### Existing project adoption

```text
PROJECT_DISCOVERY
      │
      ▼
PROJECT_INTAKE
      │
      ▼
PROJECT_BASELINE
      │
      ▼
KNOWLEDGE_SYNC
      │
      ▼
PLANNING
      │
      ▼
SPRINT_READY
      │
      ▼
TEST_AUTHORING
      │
      ▼
TEST_READY
      │
      ▼
IMPLEMENTATION
```

### Existing PiRunner workflow

```text
PROJECT_DISCOVERY
      │
      ▼
STATE_RECOVERY
      │
      ▼
STATE_VALIDATION
      │
      ├── valid ──────────────► recovered state
      │
      └── mismatch ───────────► REPOSITORY_CONFLICT
```

---

## 19. State Recovery

State recovery must validate:

- workflow ID;
- project identity;
- repository identity;
- event sequence;
- event schema;
- configuration version;
- artifact references;
- artifact hashes;
- active task;
- active sprint;
- expected repository revision;
- expected branch;
- expected workspace;
- test-suite identity where applicable;
- capability policy version.

No state may be recovered from:

- agent conversational memory;
- incomplete model output;
- uncommitted natural-language claims.

---

## 20. State Validation

After event replay, PiRunner compares canonical workflow expectations with actual repository state.

Validation includes:

```text
repository identity
current revision
branch
working-tree state
expected commit
expected artifacts
test-suite hash
dependency lock hash
active task
workspace identity
```

Possible outcomes:

```text
MATCH
MISMATCH
AMBIGUOUS
```

`MATCH` permits continuation.

`MISMATCH` routes to:

```text
REPOSITORY_CONFLICT
      │
      ▼
HUMAN_GATE
```

`AMBIGUOUS` also requires human resolution.

PiRunner must never silently reconcile mismatch.

---

## 21. Normative Transition Registry

Every legal transition is explicitly enumerated.

No other transitions are permitted.

LLM output cannot add, remove, or modify transitions.

```ts
type HumanApprovalPolicy =
  | "ALWAYS"
  | "ON_FIRST"
  | "ON_LIMIT_EXCEEDED"
  | "NEVER";

interface GuardDefinition {
  id: string;
  description: string;
}

interface SideEffectDefinition {
  id: string;
  description: string;
}

interface TransitionDefinition {
  id: string;
  from: WorkflowState | "*";
  to: WorkflowState;
  guards: GuardDefinition[];
  sideEffects: SideEffectDefinition[];
  humanApproval: HumanApprovalPolicy;
}
```

The transition registry is declarative.

The controller must evaluate every guard attached to the selected transition.

A transition is legal only if:

```text
transition exists
AND
every guard evaluates true
AND
human approval requirement is satisfied
AND
required side effects are authorized
```

A guard definition without an executable evaluator is invalid for production execution.

---

## 22. Guard Contract

Guards are pure functions of:

```text
currentState
validatedArtifacts
eventHistory
workflowConfig
repositorySnapshot
```

Conceptual interface:

```ts
interface GuardContext {
  currentState: WorkflowState;
  artifacts: ValidatedArtifactSet;
  eventHistory: readonly WorkflowEvent[];
  config: WorkflowConfig;
  repository: RepositorySnapshot;
}

interface GuardResult {
  satisfied: boolean;
  reason: string;
  evidence: SourceRef[];
}

interface GuardEvaluator {
  evaluate(context: GuardContext): GuardResult;
}
```

Guards:

- never call an LLM;
- never mutate state;
- never mutate repositories;
- never create artifacts;
- never modify the event journal;
- never perform network publication;
- must be deterministic for identical inputs.

Guard failure must identify the failed guard and supporting evidence.

---

## 23. Transition Execution Contract

A transition request is evaluated as:

```text
Transition Request
       │
       ▼
Find TransitionDefinition
       │
       ├── absent → reject
       │
       ▼
Build GuardContext
       │
       ▼
Validate Referenced Artifacts
       │
       ├── invalid → ARTIFACT_INVALID
       │
       ▼
Evaluate ALL Guards
       │
       ├── failure → reject / designated failure transition
       │
       ▼
Evaluate HumanApprovalPolicy
       │
       ├── missing → reject
       │
       ▼
Execute Authorized Side Effects
       │
       ▼
Append WorkflowEvent
       │
       ▼
Reduce Canonical State
```

The controller must never advance state before guard evaluation succeeds.

---

## 24. Project Entry Transitions

**T-000** `PROJECT_DISCOVERY → CONCEPT`

For `NEW_PROJECT`.

Guards:

- G-PROJECT-001: repository classified as new project;
- G-PROJECT-002: no existing implementation requires adoption;
- G-REPO-000: repository identity established.

HumanApproval:

`NEVER`

---

**T-001A** `PROJECT_DISCOVERY → PROJECT_INTAKE`

For `ADOPT_EXISTING_PROJECT`.

Guards:

- G-PROJECT-003: existing repository detected;
- G-PROJECT-004: no canonical PiRunner workflow history exists;
- G-REPO-000: repository identity established.

HumanApproval:

`NEVER`

---

**T-001B** `PROJECT_DISCOVERY → STATE_RECOVERY`

For `RESUME_WORKFLOW`.

Guards:

- G-PROJECT-005: canonical event journal exists;
- G-PROJECT-006: workflow identity recoverable;
- G-REPO-000: repository identity established.

HumanApproval:

`NEVER`

---

**T-002A** `PROJECT_INTAKE → PROJECT_BASELINE`

Guards:

- G-REPO-001A: repository identity captured;
- G-REPO-001B: current revision captured;
- G-REPO-001C: branch captured;
- G-REPO-001D: working-tree state captured;
- G-PROJECT-007: intake classification complete.

HumanApproval:

`NEVER`

---

**T-002B** `PROJECT_BASELINE → KNOWLEDGE_SYNC`

Guards:

- G-PROJECT-008: ProjectBaseline valid;
- G-PROJECT-009: unresolved blocking intake questions absent;
- G-REPO-002A: adoption repository state explicitly recorded.

HumanApproval:

`NEVER`

---

**T-003A** `STATE_RECOVERY → STATE_VALIDATION`

Guards:

- G-STATE-001: event journal schema valid;
- G-STATE-002: event sequence valid;
- G-STATE-003: reducer replay succeeds;
- G-STATE-004: configuration version recoverable;
- G-STATE-005: artifact references resolvable.

HumanApproval:

`NEVER`

---

**T-003B** `STATE_VALIDATION → current recovered state`

Guards:

- G-STATE-006: repository identity matches;
- G-STATE-007: expected branch matches;
- G-STATE-008: expected revision/state relationship matches;
- G-STATE-009: active artifact references match;
- G-STATE-010: capability policy matches.

HumanApproval:

`NEVER`

---

**T-003C** `STATE_VALIDATION → REPOSITORY_CONFLICT`

Guards:

- G-STATE-011: repository/workflow mismatch detected.

HumanApproval:

`NEVER`

---

## 25. Concept Path

**T-010** `CONCEPT → CONCEPT_REVIEW`

Guards:

- G-ART-001: valid ConceptPackage exists with status `SUBMITTED`;
- G-ART-002: schema, identity, and parent validation passes;
- G-WF-001: no prior accepted ConceptPackage unless explicit revision.

HumanApproval:

`NEVER`

---

**T-011** `CONCEPT_REVIEW → SPECIFICATION`

Guards:

- G-ART-003: ConceptPackage status `ACCEPTED`;
- G-ART-004: mandatory fields present.

HumanApproval:

`ALWAYS`

---

**T-012** `CONCEPT_REVIEW → HUMAN_GATE`

Guards:

- G-ART-005: rejected, incomplete, or unresolved critical questions.

HumanApproval:

`ALWAYS`

---

## 26. Specification Path

**T-020** `SPECIFICATION → SPECIFICATION_REVIEW`

Guards:

- G-ART-010: MasterSpecification status `SUBMITTED`;
- G-ART-011: schema and parent validation;
- G-ART-012: required sections present.

HumanApproval:

`NEVER`

---

**T-021** `SPECIFICATION_REVIEW → PLANNING`

Guards:

- G-ART-013: status `ACCEPTED`;
- G-ART-014: zero unresolved blocking questions.

HumanApproval:

`ALWAYS`

---

**T-022** `SPECIFICATION_REVIEW → HUMAN_GATE`

Guards:

- G-ART-015: rejected or unresolved architectural question.

HumanApproval:

`ALWAYS`

---

## 27. Planning and Knowledge Path

**T-030** `PLANNING → KNOWLEDGE_SYNC`

Guards:

- G-ART-020: valid DailyPlan;
- G-ART-021: valid SprintSpecification;
- G-ART-022: references accepted MasterSpecification;
- G-ART-023: ordered tasks and acceptance criteria present.

HumanApproval:

`NEVER`

---

**T-031** `KNOWLEDGE_SYNC → SPRINT_READY`

Guards:

- G-ART-024: valid KnowledgeSnapshot;
- G-KNOW-001: source revision matches expected repository revision or permitted delta;
- G-KNOW-002: dependency lock hash matches;
- G-KNOW-003: freshness policy satisfied;
- G-KNOW-004: required knowledge present.

HumanApproval:

`NEVER`

---

**T-032** `KNOWLEDGE_SYNC → HUMAN_GATE`

Guards:

- G-KNOW-005: snapshot stale/incomplete and refresh limit reached.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

## 28. Test Authoring Path

The test-authoring path is mandatory for authoritative sprint tests.

```text
SPRINT_READY
      │
      ▼
TEST_AUTHORING
      │
      ▼
TEST_READY
      │
      ▼
IMPLEMENTATION
```

### T-040

`SPRINT_READY → TEST_AUTHORING`

Guards:

- G-ART-030: accepted SprintSpecification exists;
- G-ART-031: accepted MasterSpecification exists;
- G-TEST-001: acceptance criteria are available;
- G-REPO-012: authoritative test workspace is writable by Methodical Scribe.

HumanApproval:

`NEVER`

### T-041

`TEST_AUTHORING → TEST_READY`

Guards:

- G-ART-032: valid TestSpecification exists;
- G-TEST-002: requirement-to-test traceability complete;
- G-TEST-003: expected behavior derives from accepted contract;
- G-TEST-004: test suite compiles/syntax-checks;
- G-TEST-005: test suite hash computed;
- G-TEST-006: no unauthorized production modifications;
- G-TEST-007: authoritative test bundle persisted.

HumanApproval:

`NEVER`

### T-042

`TEST_AUTHORING → TRIAGE`

Guards:

- G-TEST-010: test-authoring blocker classified.

HumanApproval:

`NEVER`

### T-043

`TEST_AUTHORING → HUMAN_GATE`

Guards:

- G-CFG-009: authoring limit exceeded;
- G-TEST-011: requirement ambiguity requires human decision.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

## 29. Authoritative Test Contract

A `TestSpecification` must identify:

```ts
interface TestCase {
  id: string;
  requirementIds: string[];
  acceptanceCriteriaIds: string[];

  category: string;

  description: string;
  preconditions: string[];
  inputs: unknown;

  expectedBehavior: string;
  failureCondition: string;

  testPath: string;
  testSymbol: string;
}
```

The specification must establish provenance:

```text
Requirement
    │
    ▼
Acceptance Criterion
    │
    ▼
Test Case
    │
    ▼
Test Path / Symbol
    │
    ▼
TestSpecification
    │
    ▼
Canonical TestSuiteHash
```

Expected behavior must be derived from accepted contracts.

The implementation is not an oracle for expected behavior.

Preferred test-authority ordering:

```text
public contract
      >
observable behavior
      >
state transition contract
      >
public interface
      >
internal implementation detail
```

---

## 30. Test Suite Canonicalization

The authoritative test suite receives a canonical content hash.

Canonicalization must include:

- deterministic file ordering;
- normalized path separators;
- normalized line endings;
- test framework;
- execution command;
- complete authoritative test content.

Hash:

```text
SHA-256(canonical test bundle)
```

At `TEST_READY`:

```text
TestSpecification
      │
      ▼
Canonical TestSuiteHash
      │
      ▼
Persist authoritative lock
```

After acceptance, the authoritative test suite is immutable for that workflow/test version.

Any change requires:

```text
new TestSpecification version
      │
      ▼
new TEST_AUTHORING cycle
      │
      ▼
new TestSuiteHash
```

A modified authoritative test suite must never silently replace the accepted suite.

---

## 31. Deterministic Test Runner

Test execution is infrastructure.

There is no separate test-execution agent.

The implementation agent may request test execution.

The reviewer may request test execution.

Neither may manufacture the result.

Conceptual port:

```ts
interface TestRunner {
  execute(request: TestExecutionRequest): Promise<TestExecutionResult>;
}
```

Request must identify:

```ts
interface TestExecutionRequest {
  testSpecificationArtifactId: string;
  testSuiteContentHash: string;
  repositoryRevision: string;
  dependencyLockHash: string;
  executionCommand: string;
}
```

The TestRunner must verify that:

```text
requested suite hash
        ==
live authoritative suite hash
```

and:

```text
requested repository revision
        ==
actual repository revision
```

unless the execution contract explicitly permits a controlled working-tree test.

Test results must be attributed to the exact:

- test specification;
- test-suite hash;
- repository revision;
- dependency state;
- execution command;
- execution environment.

---

## 32. Test Result Classification

Test failures are classified as:

```text
PRODUCTION_DEFECT
TEST_DEFECT
SPECIFICATION_DEFECT
ENVIRONMENT_DEPENDENCY_DEFECT
AMBIGUOUS_REQUIREMENT
```

The deterministic runner reports execution facts.

Triage determines classification.

The test runner does not decide whether production or test code is wrong.

---

## 33. Implementation Path

**T-050** `TEST_READY → IMPLEMENTATION`

Guards:

- G-ART-040: accepted SprintSpecification;
- G-ART-041: accepted TestSpecification;
- G-TEST-012: authoritative test suite locked;
- G-REPO-001: isolated clean workspace;
- G-REPO-002: expected branch;
- G-REPO-003: expected HEAD;
- G-CFG-001: implementation attempt count below limit.

HumanApproval:

`NEVER`

---

**T-051** `IMPLEMENTATION → COMMIT_CREATED`

Guards:

- G-ART-050: ImplementationResult status `COMPLETED`;
- G-ART-051: commit SHA present;
- G-REPO-004: commit exists and is reachable;
- G-REPO-005: expected changes are present;
- G-TEST-013: required tests executed;
- G-REPO-006: working tree matches post-commit state.

HumanApproval:

`NEVER`

---

**T-052** `IMPLEMENTATION → TRIAGE`

Guards:

- G-STUCK-001: deterministic stuck detector reports stuck;
- or G-ART-052: ImplementationResult status `BLOCKED`.

HumanApproval:

`NEVER`

---

**T-053** `IMPLEMENTATION → AGENT_FAILED`

Guards:

- G-RUN-001: AgentRunner reports failure/crash.

HumanApproval:

`NEVER`

---

**T-054** `IMPLEMENTATION → HUMAN_GATE`

Guards:

- G-CFG-002: implementation attempt limit reached.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

## 34. Triage Path

**T-060** `TRIAGE → IMPLEMENTATION`

Guards:

- G-ART-060: disposition `RESUME_IMPLEMENTATION`;
- G-ART-061: TriageReport valid;
- G-CFG-003: triage cycles below maximum;
- G-REPO-007: repository state reconciled.

HumanApproval:

`NEVER`

---

**T-061** `TRIAGE → SPECIFICATION_REVIEW`

Guards:

- G-ART-062: disposition `SPECIFICATION_REVIEW`;
- G-ART-063: responsible artifact is MasterSpecification.

HumanApproval:

`NEVER`

---

**T-062** `TRIAGE → PLANNING`

Guards:

- G-ART-064: disposition `REPLAN`.

HumanApproval:

`NEVER`

---

**T-063** `TRIAGE → KNOWLEDGE_SYNC`

Guards:

- G-ART-065: disposition `UPDATE_KNOWLEDGE`.

HumanApproval:

`NEVER`

---

**T-064** `TRIAGE → TEST_AUTHORING`

Guards:

- G-ART-066: classification is `TEST_DEFECT`;
- G-ART-067: authoritative test revision required.

HumanApproval:

`NEVER`

---

**T-065** `TRIAGE → HUMAN_GATE`

Guards:

- G-ART-068: disposition `HUMAN_GATE`;
- or triage cycle maximum reached.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

**T-066** `TRIAGE → ABORT`

Guards:

- G-ART-069: disposition `ABORT`.

HumanApproval:

`ALWAYS`

---

## 35. Review Path

**T-070** `COMMIT_CREATED → REVIEW`

Guards:

- G-ART-070: ImplementationResult valid;
- G-REPO-008: commit reachable;
- G-TEST-016: required execution evidence available.

HumanApproval:

`NEVER`

---

**T-071** `REVIEW → SPRINT_ACCEPTED`

Guards:

- G-ART-071: ReviewResult status `PASS`;
- G-ART-072: zero blocking findings;
- G-ART-073: mandatory acceptance criteria satisfied;
- G-ART-074: ReviewResult references current ImplementationResult;
- G-TEST-019: authoritative test evidence valid.

HumanApproval:

`NEVER`

---

**T-072** `REVIEW → REWORK`

Guards:

- G-ART-075: ReviewResult status `FAIL`;
- G-CFG-004: review iteration count below maximum.

HumanApproval:

`NEVER`

---

**T-073** `REVIEW → TRIAGE`

Guards:

- G-ART-076: review blocked or evidence missing.

HumanApproval:

`NEVER`

---

**T-074** `REVIEW → HUMAN_GATE`

Guards:

- G-CFG-005: review iteration maximum reached.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

**T-075** `REWORK → IMPLEMENTATION`

Guards:

- G-ART-077: rework task prepared;
- G-REPO-009: workspace valid;
- G-TEST-020: authoritative tests remain locked.

HumanApproval:

`NEVER`

---

## 36. Publication Path

**T-080** `SPRINT_ACCEPTED → PUSH_GATE`

Guards:

- G-ART-080: sprint accepted;
- G-REPO-010: clean repository;
- G-REPO-011: correct branch;
- G-REPO-012: HEAD equals expected revision.

HumanApproval:

`NEVER`

---

**T-081** `PUSH_GATE → REMOTE_PUBLISHED`

Guards:

- G-HUMAN-001: explicit human approval;
- G-REPO-013: pre-push verification passed.

Side effects:

```text
git push
remote verification
publication event
```

HumanApproval:

`ALWAYS`

---

**T-082** `PUSH_GATE → HUMAN_GATE`

Guards:

- G-REPO-014: pre-push verification failed.

HumanApproval:

`ALWAYS`

---

**T-083** `REMOTE_PUBLISHED → SPRINT_COMPLETE`

Guards:

- G-REPO-015: remote HEAD matches expected SHA.

HumanApproval:

`NEVER`

---

**T-084** `SPRINT_COMPLETE → SPRINT_READY`

Guards:

- G-PLAN-001: remaining work exists.

HumanApproval:

`NEVER`

---

**T-085** `SPRINT_COMPLETE → DAY_COMPLETE`

Guards:

- G-TIME-001: day boundary met.

HumanApproval:

`NEVER`

---

## 37. Diary and Publication

**T-090** `DAY_COMPLETE → DIARY`

Guard:

- G-EVT-001: relevant events available.

HumanApproval:

`NEVER`

---

**T-091** `DIARY → PUBLICATION_READY`

Guard:

- G-ART-090: valid accepted DailyDevlog.

HumanApproval:

`NEVER`

---

**T-092** `DIARY → PUBLISHED`

Guard:

- G-ART-091: no publication requested.

HumanApproval:

`NEVER`

---

**T-093** `PUBLICATION_READY → PUBLISHED`

Guards:

- G-ART-092: valid PublicationPackage;
- G-HUMAN-002: explicit publication approval.

HumanApproval:

`ALWAYS`

---

## 38. Failure and Recovery

**T-100** `* → ARTIFACT_INVALID`

Guard:

- G-VAL-001: artifact validation failure.

HumanApproval:

`NEVER`

---

**T-101** `ARTIFACT_INVALID → HUMAN_GATE`

Guard:

- G-CFG-006: recovery limit exceeded or artifact unrecoverable.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

**T-102** `* → REPOSITORY_CONFLICT`

Guard:

- G-REPO-020: unexpected repository mutation or state mismatch.

Side effect:

```text
repository mutation freeze
```

HumanApproval:

`NEVER`

---

**T-103** `REPOSITORY_CONFLICT → HUMAN_GATE`

Guard:

- G-REPO-021: conflict requires explicit resolution.

HumanApproval:

`ALWAYS`

---

**T-104** `AGENT_FAILED → TRIAGE`

Guards:

- G-RUN-002: failure recoverable;
- G-CFG-007: retry limit not exceeded;
- recovery evidence available.

HumanApproval:

`NEVER`

---

**T-105** `AGENT_FAILED → HUMAN_GATE`

Guard:

- G-RUN-003: failure unrecoverable or limit exceeded.

HumanApproval:

`ON_LIMIT_EXCEEDED`

---

**T-106** `* → ABORT`

Guard:

- G-HUMAN-003: explicit human abort.

HumanApproval:

`ALWAYS`

---

## 39. Artifact Model

All persistent inter-agent artifacts use JSON Schema Draft 2020-12.

The schema is the authoritative contract.

Runtime validation uses AJV in strict mode.

Common envelope:

```ts
interface StoredArtifact<T = unknown> {
  artifactId: string;
  artifactType: string;
  schemaVersion: string;

  workflowId: string;
  taskId: string;
  agentId: string;

  createdAt: string;

  parentArtifactIds: string[];
  sourceRefs: SourceRef[];

  status:
    | "DRAFT"
    | "SUBMITTED"
    | "ACCEPTED"
    | "REJECTED"
    | "SUPERSEDED";

  payload: T;
}
```

Artifacts are immutable after acceptance.

A revised artifact receives a new identity/version.

---

## 40. Required Artifact Types

v1.3.0 requires schemas for:

```text
ProjectBaseline
ConceptPackage
MasterSpecification
DailyPlan
SprintSpecification
KnowledgeSnapshot
TestSpecification
TestExecutionResult
ImplementationResult
TriageReport
ReviewResult
DailyDevlog
PublicationPackage
```

The following relationships are normative:

```text
ProjectBaseline
      │
      ▼
MasterSpecification
      │
      ▼
SprintSpecification
      │
      ├──────────────► TestSpecification
      │                       │
      │                       ▼
      │                TestSuiteHash
      │                       │
      ▼                       ▼
ImplementationResult ◄── TestExecutionResult
      │
      ▼
ReviewResult
```

---

## 41. TestSpecification Artifact

Minimum conceptual structure:

```ts
interface TestSpecification {
  version: string;

  masterSpecificationArtifactId: string;
  sprintSpecificationArtifactId: string;

  requirementCoverage: Array<{
    requirementId: string;
    acceptanceCriteriaIds: string[];
    testCaseIds: string[];
  }>;

  testCases: TestCase[];

  authoritativeSuite: {
    framework: string;
    executionCommand: string;
    files: string[];
    contentHash: string;
  };

  invariants: string[];
}
```

The artifact must identify the exact authoritative test suite.

---

## 42. TestExecutionResult Artifact

Minimum conceptual structure:

```ts
interface TestExecutionResult {
  testSpecificationArtifactId: string;

  testSuiteContentHash: string;

  repositoryRevision: string;
  dependencyLockHash: string;

  executionCommand: string;

  status: "PASSED" | "FAILED" | "ERROR";

  passed: number;
  failed: number;
  skipped: number;
  errored: number;

  executedTests: Array<{
    testId: string;
    status: "PASSED" | "FAILED" | "SKIPPED" | "ERROR";
    failureOutput?: string;
  }>;

  rawOutput: string;
  environmentFingerprint: string;
}
```

---

## 43. ImplementationResult Artifact

```ts
interface ImplementationResult {
  status: "COMPLETED" | "BLOCKED" | "FAILED";

  sprintSpecificationArtifactId: string;

  commitSha: string | null;

  changedFiles: string[];

  testsExecuted: boolean;

  testSummary: {
    passed: number;
    failed: number;
    skipped: number;
  };

  blockingIssues: string[];

  failureSignatures?: FailureSignature[];

  notes?: string;
}
```

An existing commit discovered during adoption is not automatically represented as `ImplementationResult`.

---

## 44. ProjectBaseline Artifact

The ProjectBaseline schema must preserve:

```text
repository identity
base revision
branch
working-tree state
project type
build system
specification inventory
test inventory
documentation inventory
dependency lock hash
source inventory
CI inventory
uncommitted changes
unresolved questions
intake timestamp
repository snapshot hash
```

The baseline must be sufficient to distinguish:

```text
pre-existing state
```

from:

```text
PiRunner-controlled mutation
```

---

## 45. FailureSignature Normalization

```ts
interface FailureSignature {
  class: string;
  location: string;
  fingerprint: string;
  raw: string;
}

function normalizeFailure(
  raw: string,
  context?: { workspaceRoot: string }
): FailureSignature;
```

Algorithm:

1. Empty/whitespace input becomes `UNKNOWN`.
2. Detect class in priority order:
   - COMPILER
   - TEST
   - RUNTIME
   - DEPENDENCY
   - ENVIRONMENT
   - REPOSITORY
   - UNKNOWN
3. Extract location from structured compiler output, stack frames, or test names.
4. Normalize path to repository-relative forward-slash form.
5. Remove absolute paths, timestamps, PIDs, hex pointers, ANSI escape sequences.
6. Collapse whitespace.
7. Normalize case.
8. Remove duplicate lines.
9. Compute:

```text
SHA-256(
  class
  + "\0"
  + location
  + "\0"
  + normalizedMessage
)
```

The algorithm is deterministic for identical inputs.

---

## 46. Knowledge Provider

```ts
interface KnowledgeProvider {
  produceSnapshot(
    request: KnowledgeRequest
  ): Promise<KnowledgeSnapshot>;

  invalidate(keys: string[]): Promise<void>;
}
```

The initial provider may be minimal.

The port must support future symbol-graph and richer repository knowledge without changing workflow authority.

PiRunner decides when knowledge must be refreshed.

---

## 47. Stuck Detection

```ts
interface StuckDetector {
  evaluate(context: ProgressContext): StuckAssessment;
}

interface StuckAssessment {
  isStuck: boolean;
  reason: string;
  signatures: FailureSignature[];
  recommendedDisposition:
    | "TRIAGE"
    | "HUMAN_GATE"
    | "CONTINUE";
}
```

Stuck detection is deterministic.

It must not be delegated to an LLM.

Thresholds are configuration-controlled.

---

## 48. Recovery Semantics

| Condition | Immediate State | Policy |
|---|---|---|
| Agent crash before mutation | `AGENT_FAILED` | Inspect evidence; retry if safe |
| Agent crash after commit | `AGENT_FAILED` | Verify commit before continuing |
| Cancelled invocation | `AGENT_FAILED` | Preserve evidence; partial work never auto-accepted |
| Schema validation failure | `ARTIFACT_INVALID` | Reproduce/fix or escalate |
| Unexpected repository mutation | `REPOSITORY_CONFLICT` | Freeze and require human resolution |
| Workflow/repository mismatch during resume | `REPOSITORY_CONFLICT` | No silent reconciliation |
| Max triage cycles | `HUMAN_GATE` | Force human decision |
| Max review iterations | `HUMAN_GATE` | Force human decision |
| Push verification failure | `HUMAN_GATE` | No agent improvisation |
| Dirty adoption workspace | `HUMAN_GATE` when disposition is required | No silent mutation |

---

## 49. Resume After Agent Failure

Recovery must inspect:

1. event history;
2. repository state;
3. artifact state;
4. commit history;
5. invocation outcome.

If no committed mutation exists and evidence establishes safe retry:

```text
AGENT_FAILED
      │
      ▼
TRIAGE
      │
      ▼
IMPLEMENTATION
```

If a commit exists:

```text
AGENT_FAILED
      │
      ▼
verify commit
      │
      ├── valid ─────► continue
      │
      └── ambiguous ─► HUMAN_GATE
```

Agent conversational memory is never used as the authority for recovery.

---

## 50. Configuration Versioning

```ts
interface WorkflowConfig {
  version: string;

  maxTriageCyclesPerSprint: number;
  maxReviewIterationsPerSprint: number;
  maxImplementationAttempts: number;

  stuckFailureThreshold: number;
  unchangedDiffThreshold: number;

  knowledgeFreshnessPolicy:
    KnowledgeFreshnessPolicy;

  requireHumanConceptApproval: boolean;
  requireHumanSpecificationApproval: boolean;
  requireHumanPushApproval: boolean;
}
```

Every workflow records the exact configuration version.

Configuration used by a workflow is immutable for that workflow's event history.

A configuration change creates a new configuration version.

Replay uses the configuration version recorded by the workflow.

---

## 51. Runtime Capability Model

Permissions are enforced at runtime.

Prompt instructions are not sufficient.

Capabilities are assigned by:

```text
agent identity
+
workflow state
+
task
+
repository/workspace
```

Conceptual model:

```ts
interface CapabilityPolicy {
  agentId: string;
  state: WorkflowState;

  readablePaths: string[];
  writablePaths: string[];

  executableCommands: string[];

  mayCommit: boolean;
  mayPush: boolean;
}
```

Normative restrictions:

```text
0012 Concept
    no production write

0024 Specification
    no production write

0036 Planning
    no production write

0048 Knowledge
    no production write

0060 Implementation
    production write
    commit allowed
    push forbidden

0072 Triage
    diagnostic access
    production write forbidden

0084 Review
    production write forbidden

0096 Diary
    documentation-only capability

0108 Publication
    publication preparation only

0120 Test Authoring
    tests/configuration only
    production write forbidden
```

Authoritative tests must be protected from implementation agents at the capability boundary.

---

## 52. Invocation Identity

Capability enforcement must be associated with the actual agent invocation.

A single mutable global agent identity is insufficient for concurrent workflows.

Conceptual model:

```text
InvocationId
     │
     ▼
AgentId
     │
     ▼
WorkflowId
     │
     ▼
TaskId
     │
     ▼
CapabilityPolicy
```

Every tool authorization request must be attributable to the invocation that generated it.

---

## 53. Repository Control

Repository operations are exposed through a deterministic repository port.

Conceptual interface:

```ts
interface Repository {
  getIdentity(): Promise<string>;
  getRevision(): Promise<string>;
  getBranch(): Promise<string>;
  getStatus(): Promise<RepositoryStatus>;

  verifyCommit(sha: string): Promise<boolean>;

  createCommit(message: string): Promise<string>;

  push(): Promise<void>;

  getRemoteRevision(): Promise<string>;
}
```

Repository mutation is serialized per repository.

PiRunner must verify repository state before and after controlled mutations.

---

## 54. Repository Conflict Semantics

Unexpected changes result in:

```text
REPOSITORY_CONFLICT
```

The repository is frozen from further automated mutation until resolution.

The system must preserve:

- detected revision;
- expected revision;
- branch;
- working-tree state;
- changed-file inventory;
- relevant event;
- relevant artifact references.

Human resolution becomes canonical workflow evidence.

---

## 55. Critical Invariants

1. Agents cannot approve their own workflow transitions.
2. Implementation cannot silently override accepted specification.
3. Implementation cannot modify authoritative tests.
4. Test-authoring cannot modify production source.
5. Implementation cannot approve its own implementation.
6. Triage diagnoses but does not silently implement.
7. No agent possesses unrestricted remote push capability.
8. Workflow transitions require validated artifacts.
9. Every transition guard is actually evaluated before transition.
10. Historical artifacts and events are immutable.
11. Triage and review loops have deterministic maximum iterations.
12. Important technical claims must have identifiable evidence.
13. Lower-level contradictions move upward.
14. LLM output cannot define workflow transitions.
15. Prompt instructions are not the sole permission mechanism.
16. Event sequence numbers are monotonic and unique per workflow.
17. Guards are pure and side-effect free.
18. KnowledgeProvider is a mandatory port.
19. Same-task concurrent implementation is prohibited.
20. Configuration used by a workflow is immutable for its event history.
21. Existing projects require explicit classification.
22. Existing projects are not silently treated as new projects.
23. Existing projects without PiRunner history require adoption.
24. Existing projects with valid PiRunner history require resume.
25. Existing commits are not retroactively represented as PiRunner implementation results.
26. Existing tests are not authoritative merely because they exist.
27. Existing specifications are not authoritative merely because they exist.
28. Adoption establishes a deterministic ProjectBaseline.
29. Dirty working trees are never silently modified during adoption.
30. Workflow state survives PiRunner process restart.
31. Resume always replays canonical event history.
32. Resume validates repository state before continuation.
33. Repository/workflow mismatches cannot be silently reconciled.
34. Agent conversational memory cannot establish resumable state.
35. Authoritative test suites are immutable after `TEST_READY`.
36. Test-suite revisions require a new TestSpecification/version and authoring cycle.
37. Test execution evidence identifies the exact test suite hash.
38. Test execution evidence identifies the exact repository revision.
39. Test execution evidence identifies the dependency state.
40. Human approval is required exactly where the transition registry specifies.
41. Side effects occur only after transition authorization.
42. Workflow state changes are recorded as immutable events.
43. The event journal is authoritative over materialized state.
44. No lower-level artifact may silently override a higher-level artifact.
45. No workflow state may be inferred from natural-language agent output.

---

## 56. Implementation Priority

The implementation priority for v1.3.0 is:

```text
1. Executable transition guard system
2. GuardContext and deterministic guard evaluation
3. Artifact-backed transition enforcement
4. Workflow-scoped persistent event journal
5. Reducer replay and startup recovery
6. Project discovery
7. Existing-project intake
8. ProjectBaseline
9. State recovery
10. Repository/workflow state validation
11. TestSpecification and authoritative test locking
12. Deterministic TestRunner evidence binding
13. Invocation-scoped capability enforcement
14. Adoption/resume integration tests
15. Self-hosted PiRunner workflow
16. Remaining review/publication hardening
```

The priority deliberately places deterministic authority and resumability before further agent sophistication.

---

## 57. Deterministic Core Acceptance Criteria

The deterministic core is not complete until it can:

1. Create a workflow with recorded configuration version.
2. Classify project entry mode.
3. Adopt an existing repository without claiming historical ownership.
4. Establish a ProjectBaseline.
5. Recover a workflow from persistent event history.
6. Replay events into canonical state.
7. Detect event-sequence corruption.
8. Detect repository/workflow mismatch.
9. Enforce every registered transition guard.
10. Reject transitions when any guard fails.
11. Enforce human approval policies.
12. Persist immutable workflow events.
13. Persist validated artifacts.
14. Establish an authoritative TestSpecification.
15. Lock the authoritative test-suite hash.
16. Prevent implementation from modifying authoritative tests.
17. Execute tests through deterministic infrastructure.
18. Bind test evidence to test-suite hash and repository revision.
19. Detect stuck implementation.
20. Route stuck implementation to triage.
21. Bound triage and review loops.
22. Handle defined agent-failure recovery cases.
23. Handle repository conflicts without silent mutation.
24. Resume safely after PiRunner process restart.
25. Preserve the distinction between historical and PiRunner-controlled work.

---

## 58. Dogfooding Acceptance

PiRunner becomes its own first meaningful adoption target.

Initial dogfooding sequence:

```text
ADOPT_EXISTING_PROJECT
        │
        ▼
PROJECT_INTAKE
        │
        ▼
PROJECT_BASELINE
        │
        ▼
KNOWLEDGE_SYNC
        │
        ▼
PLANNING
        │
        ▼
SPRINT_READY
        │
        ▼
TEST_AUTHORING
        │
        ▼
TEST_READY
        │
        ▼
IMPLEMENTATION
        │
        ▼
COMMIT_CREATED
        │
        ▼
REVIEW
        │
        ▼
SPRINT_ACCEPTED
```

The repository's pre-existing MVP work is recorded as baseline state.

It is not retroactively represented as PiRunner-managed implementation.

Once canonical PiRunner workflow history exists, subsequent PiRunner development normally uses:

```text
RESUME_WORKFLOW
      │
      ▼
STATE_RECOVERY
      │
      ▼
STATE_VALIDATION
      │
      ▼
continue from canonical state
```

This is the intended transition from initial development to genuine PiRunner dogfooding.

---

## 59. MVP Acceptance

The v1.3.0 MVP is complete when:

```text
                    ┌─────────────────────────┐
                    │ Persistent Event Journal │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Deterministic        │
                    │    State Reducer        │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Executable Guards       │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Artifact Validation     │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Project Adoption        │
                    │ + Resume                │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Test Governance         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Pi Agent Execution      │
                    └─────────────────────────┘
```

The deterministic control plane must be able to enforce the workflow without relying on agent cooperation.

---

## 60. Recommended Project Structure

```text
src/
  domain/
    workflow/
      WorkflowState.ts
      WorkflowEvent.ts
      WorkflowTransition.ts
      WorkflowReducer.ts
      Guards.ts
      GuardContext.ts

    project/
      ProjectEntryMode.ts
      ProjectDiscovery.ts
      ProjectBaseline.ts
      ProjectIntake.ts
      StateRecovery.ts
      StateValidation.ts

    agents/
      AgentDefinition.ts
      AgentRunner.ts
      AgentInvocation.ts
      CapabilityPolicy.ts

    artifacts/
      Artifact.ts
      ArtifactStore.ts
      ArtifactValidator.ts

    testing/
      TestSpecification.ts
      TestCase.ts
      TestRunner.ts
      TestExecutionResult.ts
      TestSuiteHasher.ts
      TestSuiteLock.ts

    triage/
      StuckDetector.ts
      FailureSignature.ts
      TriageReport.ts

    repository/
      Repository.ts
      RepositorySnapshot.ts

    knowledge/
      KnowledgeSnapshot.ts
      KnowledgeProvider.ts

  application/
    WorkflowController.ts
    AgentOrchestrator.ts
    ArtifactService.ts
    ProjectService.ts
    RecoveryService.ts
    TestGovernanceService.ts
    PushGate.ts
    TriageService.ts

  infrastructure/
    pi/
      PiAgentRunner.ts
      PiResourceLoader.ts

    git/
      GitRepository.ts

    artifacts/
      FileArtifactStore.ts

    events/
      FileEventStore.ts

    testing/
      RealDeterministicTestRunner.ts
      FakeTestRunner.ts

    knowledge/
      GitKnowledgeProvider.ts

    logging/
      Logger.ts

  schemas/
    artifact-envelope.schema.json
    project-baseline.schema.json
    concept-package.schema.json
    master-specification.schema.json
    daily-plan.schema.json
    sprint-specification.schema.json
    knowledge-snapshot.schema.json
    test-specification.schema.json
    test-execution-result.schema.json
    implementation-result.schema.json
    triage-report.schema.json
    review-result.schema.json
    daily-devlog.schema.json
    publication-package.schema.json

  agents/
    0012/
    0024/
    0036/
    0048/
    0060/
    0072/
    0084/
    0096/
    0108/
    0120/
```

---

## 61. Required Runtime Relationship

The normative runtime relationship is:

```text
                         ┌───────────────┐
                         │      Pi       │
                         │ Agent Harness │
                         └───────┬───────┘
                                 │
                         executes agent
                                 │
                                 ▼
                     ┌─────────────────────┐
                     │      PiRunner       │
                     │                     │
                     │ Is this invocation  │
                     │ permitted?          │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Capability Policy   │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Agent performs work │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Typed Artifact      │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Artifact Validator  │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Guard Evaluation    │
                     └──────────┬──────────┘
                                │
                         all guards pass?
                           │          │
                          no         yes
                           │          │
                           ▼          ▼
                         reject    transition
                                      │
                                      ▼
                              Workflow Event
                                      │
                                      ▼
                               Canonical State
```

PiRunner owns the authority boundary.

Pi owns execution.

---

## 62. Final Architectural Principle

> LLMs perform bounded engineering work.
>
> Typed artifacts communicate results.
>
> Deterministic PiRunner controls authority and workflow state.
>
> Executable guards determine whether transitions are legal.
>
> Persistent event history determines canonical state.
>
> Repository validation determines whether recovered state remains trustworthy.
>
> Humans resolve ambiguity and authorize irreversible actions.
>
> Existing work is preserved as historical evidence rather than retroactively claimed.
>
> Pi provides the agent runtime; PiRunner provides deterministic orchestration around it.

**v1.3.0 is the normative contract for transforming PiRunner from an in-process workflow prototype into a persistent, deterministic, HITM-controlled Pi Agent Harness Extension capable of adopting existing projects and safely resuming its own workflow state.**
