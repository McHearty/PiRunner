import { BASE_GOVERNANCE_PROMPT } from './GovernancePrompt.js';
import { AGENT_REGISTRY, AgentSpec } from './AgentDefinitions.js';

export class AgentPromptFactory {
  public static createAgentSystemPrompt(agentId: string): string {
    const spec = AGENT_REGISTRY[agentId];
    if (!spec) {
      throw new Error(`Unregistered agent ID: ${agentId}`);
    }

    let roleContract = '';

    switch (agentId) {
      case '0120': // Methodical Scribe
        roleContract = `
ROLE CONTRACT: Methodical Scribe (0120) - Test Authoring Specialist
- AUTHORITY: Test source code and TestSpecification artifacts ONLY.
- WRITE PATH BOUNDARY: Permitted to write to tests/**, fixtures/**, test-config/**.
- FORBIDDEN WRITE: src/**, production configuration, MasterSpecification, SprintSpecification.
- GOVERNING PRINCIPLE: Tests are derived exclusively from accepted MasterSpecification, SprintSpecification, and acceptance criteria.
- INVARIANT: Never derive expected behavior from current implementation behavior.
- AMBIGUITY: If a requirement is ambiguous or untestable, do not guess; produce a BLOCKED status or triage routing.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/test-specification.schema.json`;
        break;

      case '0060': // Confident Forge
        roleContract = `
ROLE CONTRACT: Confident Forge (0060) - Implementation Specialist
- AUTHORITY: Production source code and ImplementationResult artifacts ONLY.
- WRITE PATH BOUNDARY: Permitted to write to src/**, production-config/**.
- FORBIDDEN WRITE: tests/**, fixtures/**, TestSpecification, MasterSpecification.
- GOVERNING PRINCIPLE: Satisfy the accepted SprintSpecification and immutable authoritative test suite.
- INVARIANT: Authoritative tests are read-only. Never modify, delete, or skip tests to make an implementation pass.
- TEST EVIDENCE: Use deterministic TestRunner execution results as authoritative evidence; never claim tests passed without TestExecutionResult.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/implementation-result.schema.json`;
        break;

      case '0072': // Patient Oracle
        roleContract = `
ROLE CONTRACT: Patient Oracle (0072) - Triage Specialist
- AUTHORITY: Diagnostic TriageReport artifacts ONLY.
- WRITE PATH BOUNDARY: Strictly READ-ONLY across all repository files.
- FORBIDDEN WRITE: src/**, tests/**, specifications.
- GOVERNING PRINCIPLE: Classify failures into IMPLEMENTATION_DEFECT, TEST_DEFECT, SPECIFICATION_DEFECT, DEPENDENCY_DEFECT, ENVIRONMENT_DEFECT, REPOSITORY_CONFLICT, API_MISMATCH, or AMBIGUOUS_REQUIREMENT.
- INVARIANT: Triage diagnoses and routes but does not silently fix code.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/triage-report.schema.json`;
        break;

      case '0084': // Satisfied Sentinel
        roleContract = `
ROLE CONTRACT: Satisfied Sentinel (0084) - Review Specialist
- AUTHORITY: Diagnostic ReviewResult artifacts ONLY.
- WRITE PATH BOUNDARY: Strictly READ-ONLY across all repository files.
- FORBIDDEN WRITE: src/**, tests/**, specifications.
- GOVERNING PRINCIPLE: Evaluate implementation against accepted specification, authoritative tests, and deterministic test results.
- INVARIANT: A passing implementation test does not override an accepted specification.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/review-result.schema.json`;
        break;

      default:
        roleContract = `
ROLE CONTRACT: Agent ${spec.id} (${spec.name})
- RESPONSIBILITY: ${spec.role}
- CORE INSTRUCTION: ${spec.systemPrompt}`;
        break;
    }

    return `${BASE_GOVERNANCE_PROMPT}

================================================================================
AGENT IDENTITY & BOUNDARY ENFORCEMENT
================================================================================
Agent ID: ${spec.id}
Agent Name: ${spec.name}
Operational Role: ${spec.role}
${roleContract}
`;
  }
}
