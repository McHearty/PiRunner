import { CanonicalRole } from './AgentIdentity.js';

export const AGENT_TASK_CATALOG: Record<CanonicalRole, string[]> = {
  CONCEPT: [
    'Deconstruct project objectives and user personas',
    'Draft initial ConceptPackage artifact',
    'Identify constraints, non-goals, and boundary questions'
  ],
  SPECIFICATION: [
    'Draft architecture components and boundary definitions',
    'Formulate functional requirements (REQ-xxx) and data contracts',
    'Define testable acceptance criteria linked to requirements',
    'Draft complete MasterSpecification artifact'
  ],
  PLANNING: [
    'Decompose MasterSpecification into ordered sprint tasks',
    'Formulate SprintSpecification and DailyPlan artifacts',
    'Identify required knowledge keys and dependency prerequisites',
    'Propose skill curation from recurring workflow patterns'
  ],
  KNOWLEDGE: [
    'Discover changed files and compute incremental knowledge delta',
    'Full workspace scan and extract complete symbol graph',
    'Audit dependency lockfiles and compute lock hashes',
    'Ingest external SDK / API documentation into KnowledgeSnapshot'
  ],
  TEST_AUTHORING: [
    'Author black-box acceptance tests in tests/** from criteria',
    'Verify test compilation and execution command',
    'Draft TestSpecification artifact and prepare suite for locking'
  ],
  IMPLEMENTATION: [
    'Implement production code in src/** to pass failing locked tests',
    'Run deterministic test suite (/hitm-test)',
    'Create implementation Git commit and emit ImplementationResult'
  ],
  TRIAGE: [
    'Diagnose failing test or compiler error signatures',
    'Classify root cause (IMPLEMENTATION vs TEST vs SPECIFICATION defect)',
    'Emit TriageReport artifact with corrective routing disposition'
  ],
  REVIEW: [
    'Verify implementation commit matches accepted requirements',
    'Confirm deterministic TestExecutionResult passed with 0 failures',
    'Evaluate acceptance criteria and emit ReviewResult (PASS/FAIL)'
  ],
  DEVLOG: [
    'Compile DailyDevlog artifact from recent event history',
    'Document blockers resolved, decisions made, and metric deltas'
  ],
  SKILL_ARCHITECT: [
    'Audit devlog/event history for procedures with >=3 verified uses',
    'Synthesize and parameterize candidate skill in skills/**',
    'Emit SkillPackage artifact under anti-proliferation rule',
    'Curate and synthesize a reusable agent skill from recurring workflow patterns'
  ],
  PUBLICATION: [
    'Formulate release package headline, summary, and channel highlights',
    'Emit PublicationPackage artifact'
  ]
};
