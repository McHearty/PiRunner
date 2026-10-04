import { BASE_GOVERNANCE_PROMPT } from './GovernancePrompt.js';
import { AGENT_REGISTRY, AgentSpec } from './AgentDefinitions.js';
import { CanonicalRole, AgentRosterService } from '../domain/agents/AgentIdentity.js';

export class AgentPromptFactory {
  private static resolveSpec(agentIdOrRole: string): AgentSpec {
    // 1. Direct match on legacy numerical ID
    if (AGENT_REGISTRY[agentIdOrRole]) {
      return AGENT_REGISTRY[agentIdOrRole];
    }

    // 2. Direct match on CanonicalRole
    for (const spec of Object.values(AGENT_REGISTRY)) {
      if (spec.canonicalRole === agentIdOrRole) {
        return spec;
      }
    }

    // 3. Match through project roster
    try {
      const roster = AgentRosterService.getOrGenerateRoster();
      for (const entry of Object.values(roster)) {
        if (entry.id === agentIdOrRole) {
          for (const spec of Object.values(AGENT_REGISTRY)) {
            if (spec.canonicalRole === entry.canonicalRole) return spec;
          }
        }
      }
    } catch {}

    return AGENT_REGISTRY['0012'];
  }

  public static createAgentSystemPrompt(agentIdOrRole: string): string {
    const spec = this.resolveSpec(agentIdOrRole);
    let roleContract = '';

    switch (spec.canonicalRole) {
      case 'TEST_AUTHORING':
        roleContract = `
ROLE CONTRACT: Test Authoring Specialist (${spec.name})
- AUTHORITY: Test source code and TestSpecification artifacts ONLY.
- WRITE PATH BOUNDARY: Permitted to write to tests/**, fixtures/**, test-config/**.
- FORBIDDEN WRITE: src/**, production configuration, MasterSpecification, SprintSpecification.
- GOVERNING PRINCIPLE: Tests are derived exclusively from accepted MasterSpecification, SprintSpecification, and acceptance criteria.
- INVARIANT: Never derive expected behavior from current implementation behavior.
- AMBIGUITY: If a requirement is ambiguous or untestable, do not guess; produce a BLOCKED status or triage routing.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/test-specification.schema.json`;
        break;

      case 'IMPLEMENTATION':
        roleContract = `
ROLE CONTRACT: Implementation Specialist (${spec.name})
- AUTHORITY: Production source code and ImplementationResult artifacts ONLY.
- WRITE PATH BOUNDARY: Permitted to write to src/**, production-config/**.
- FORBIDDEN WRITE: tests/**, fixtures/**, TestSpecification, MasterSpecification.
- GOVERNING PRINCIPLE: Satisfy the accepted SprintSpecification and immutable authoritative test suite.
- INVARIANT: Authoritative tests are read-only. Never modify, delete, or skip tests to make an implementation pass.
- TEST EVIDENCE: Use deterministic TestRunner execution results as authoritative evidence; never claim tests passed without TestExecutionResult.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/implementation-result.schema.json`;
        break;

      case 'TRIAGE':
        roleContract = `
ROLE CONTRACT: Triage Specialist (${spec.name})
- AUTHORITY: Diagnostic TriageReport artifacts ONLY.
- WRITE PATH BOUNDARY: Strictly READ-ONLY across all repository files.
- FORBIDDEN WRITE: src/**, tests/**, specifications.
- GOVERNING PRINCIPLE: Classify failures into IMPLEMENTATION_DEFECT, TEST_DEFECT, SPECIFICATION_DEFECT, DEPENDENCY_DEFECT, ENVIRONMENT_DEFECT, REPOSITORY_CONFLICT, API_MISMATCH, or AMBIGUOUS_REQUIREMENT.
- INVARIANT: Triage diagnoses and routes but does not silently fix code.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/triage-report.schema.json`;
        break;

      case 'REVIEW':
        roleContract = `
ROLE CONTRACT: Review Specialist (${spec.name})
- AUTHORITY: Diagnostic ReviewResult artifacts ONLY.
- WRITE PATH BOUNDARY: Strictly READ-ONLY across all repository files.
- FORBIDDEN WRITE: src/**, tests/**, specifications.
- GOVERNING PRINCIPLE: Evaluate implementation against accepted specification, authoritative tests, and deterministic test results.
- INVARIANT: A passing implementation test does not override an accepted specification.
- OUTPUT REQUIREMENT: Produce valid JSON payload conforming to https://hitm.example/schemas/review-result.schema.json`;
        break;

      case 'SKILL_ARCHITECT':
        roleContract = `
ROLE CONTRACT: Skill Architect (${spec.name})
- AUTHORITY: Parameterized skills in skills/** and .pi/skills/** ONLY.
- ANTI-PROLIFERATION INVARIANT: A procedure becomes a skill ONLY after >=3 verified real uses in event or devlog history.
- CRITERIA: A skill must be repeated, parameterized, and define explicit success criteria.
- OUTPUT REQUIREMENT: Produce valid JSON conforming to https://hitm.example/schemas/skill-package.schema.json or Markdown skill with verified frontmatter.`;
        break;

      default:
        roleContract = `
ROLE CONTRACT: ${spec.role} (${spec.name})
- RESPONSIBILITY: ${spec.role}
- CORE INSTRUCTION: ${spec.systemPrompt}`;
        break;
    }

    return `${BASE_GOVERNANCE_PROMPT}

================================================================================
AGENT IDENTITY & BOUNDARY ENFORCEMENT
================================================================================
Agent Role: ${spec.canonicalRole}
Operational Name: ${spec.name}
Role Description: ${spec.role}
${roleContract}
`;
  }
}
