
HITM Workflow & Pi Harness Operational Guide

This document covers operational installation, interactive usage within the Pi
Coding Agent Harness, and programmatic integration for self-development
workflows.

1. Pi Agent Harness Installation

The HITM workflow is packaged as a first-class native Pi extension
(src/extension.ts -> dist/extension.js).

Step 1: Compile the Project

Ensure the project is built and passes all verification suites:

npm run build && npm test

Step 2: Register the Extension with Pi

Choose one of three installation methods:

Method A: Global User Extension (Recommended)

Automatically loads HITM across all Pi sessions on your machine:

mkdir -p ~/.pi/agent/extensions
cp ./dist/extension.js ~/.pi/agent/extensions/hitm.js

Method B: Project-Local Extension

Loads HITM whenever Pi runs in this specific repository:

mkdir -p .pi/agent/extensions
cp ./dist/extension.js .pi/agent/extensions/hitm.js

Method C: Direct CLI Invocation

Load the extension on demand without copying files:

pi --extension ./dist/extension.js

Step 3: Configure Model Provider Credentials

Set your preferred provider API keys in your environment:

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI
export OPENAI_API_KEY="sk-..."

2. Interactive Pi CLI Commands

Once loaded, the HITM extension registers interactive slash commands inside Pi's
terminal session:

/hitm-status

Displays current workflow state, sequence index, and active agent ID:

> /hitm-status
HITM State: [TEST_AUTHORING] | Active Agent: 0120 | Events: 6

/hitm-prompt

Displays the active, fully-composed Layered Governance Sub-Prompt for the
currently assigned agent role (Base Governance Prompt + Role Invariants + Schema
Constraints):

> /hitm-prompt
Active Sub-Prompt Loaded for Agent 0120 (Methodical Scribe)

/hitm-approve <TARGET_STATE>

Interactive Human-In-The-Middle authorization gate. Prompts with a native
confirmation dialog to approve transitions requiring human authority (T-002,
T-011, T-061, etc.):

> /hitm-approve TEST_READY
? Authorize transition from TEST_AUTHORING to TEST_READY? (y/N)

/hitm-test

Executes the RealDeterministicTestRunner against the active workspace in an
isolated subprocess. Computes the live SHA-256 test suite hash and verifies
passing criteria:

> /hitm-test
Executing deterministic test suite against active workspace...
All authoritative tests PASSED (Suite Hash: a3f89e10c21b...)

3. Real-Time Path Capability Sandboxing

While running inside Pi, the extension actively hooks tool_call events. Agent
write and edit attempts are intercepted before touching the disk:

Agent 0120 (Methodical Scribe) attempts to write to src/core.ts:
[HITM Boundary Violation]: Agent 0120 is forbidden from writing to "src/core.ts".

Agent 0060 (Confident Forge) attempts to edit tests/unit/app.test.ts:
[HITM Boundary Violation]: Agent 0060 is forbidden from writing to "tests/unit/app.test.ts".

| Agent ID               | Permitted Write Paths                       | Forbidden Write Paths                     |
| ---------------------- | ------------------------------------------- | ----------------------------------------- |
| **0120** (Test Author) | `tests/**`, `fixtures/**`, `test-config/**` | `src/**`, specifications, workflow config |
| **0060** (Implementer) | `src/**`, `production-config/**`            | `tests/**`, specifications, remote push   |
| **0072** (Triage)      | *(None - Strictly Read-Only)*               | All workspace files                       |
| **0084** (Review)      | *(None - Strictly Read-Only)*               | All workspace files                       |

4. Self-Hosting Dogfooding Walkthrough

To use the harness to improve itself, run the standard sprint lifecycle directly
against this repository:

Step 1: Initialize Workspace & Planning

import { WorkflowController, ArtifactStore, ArtifactValidator, EventStore, RealDeterministicTestRunner, PiAgentRunner } from 'hitm-workflow';

const root = process.cwd();
const controller = new WorkflowController(
  'self-development-sprint-01',
  new ArtifactStore(new ArtifactValidator()),
  new EventStore(),
  new RealDeterministicTestRunner(root),
  new PiAgentRunner(root)
);

Step 2: Test Authoring Phase (0120 Methodical Scribe)

1.  Advance state: SPRINT_READY -> TEST_AUTHORING.
2.  Methodical Scribe reads accepted specifications and writes new executable
    test specifications in tests/**.
3.  Verify test compilation and calculate authoritative content hash:

import { TestSuiteHasher } from 'hitm-workflow';

const hash = TestSuiteHasher.hash({
  testFramework: 'vitest',
  executionCommand: 'npm test',
  files: [{ relativePath: 'tests/new-feature.test.ts', content: '...' }]
});

4.  Enter TEST_READY, freezing the test suite hash.

Step 3: Implementation Phase (0060 Confident Forge)

1.  Advance state: TEST_READY -> IMPLEMENTATION.
2.  Confident Forge writes implementation code in src/**. Authoritative tests
    remain read-only.
3.  Execute real subprocess test runner:

const result = await controller.executeAuthoritativeTests({
  taskId: 'task-self-dev',
  testSpecificationArtifactId: 'art-test-spec',
  testSuiteContentHash: hash,
  repositoryRevision: 'git-head-sha',
  dependencyLockHash: 'lock-sha',
  executionCommand: 'npm test'
});

Step 4: Review & Push Gate

1.  Once tests pass, transition COMMIT_CREATED -> REVIEW.
2.  0084 Satisfied Sentinel evaluates the implementation against accepted
    requirements and deterministic execution evidence.
3.  Transition to PUSH_GATE. Explicit human approval (humanApproved: true) is
    required before any remote publication.

5. Failure Normalization & Stuck Detection

If compiler or test failures repeat across attempts, StuckDetector fingerprints
errors with SHA-256 and routes execution to Triage:

import { normalizeFailure, StuckDetector, DEFAULT_WORKFLOW_CONFIG } from 'hitm-workflow';

const detector = new StuckDetector(DEFAULT_WORKFLOW_CONFIG);

const rawError = `src/index.ts:10:3 - error TS2322: Type 'string' is not assignable to type 'number'.`;
const sig = normalizeFailure(rawError);

console.log(sig.class);       // 'COMPILER'
console.log(sig.location);    // 'src/index.ts:10:3'
console.log(sig.fingerprint); // 64-char SHA-256

const assessment = detector.evaluate({
  attemptCount: 3,
  maxAttempts: 3,
  recentSignatures: [sig, sig, sig],
  consecutiveUnchangedDiffs: 0
});

if (assessment.isStuck) {
  // Routes to 'TRIAGE' or 'HUMAN_GATE'
  console.log('Action:', assessment.recommendedDisposition);
}

6. Deterministic Event Replay

Reconstitute workflow state at any point from the append-only journal:

const reconstructedState = controller.reconstructState();
console.log('Verified State:', reconstructedState);

