import { join } from 'node:path';
import { WorkflowState } from './WorkflowState.js';
import { WorkflowEvent } from './WorkflowEvent.js';
import { WorkflowConfig } from './WorkflowConfig.js';
import { StoredArtifact } from '../artifacts/ArtifactStore.js';
import { TestSuiteLock } from '../testing/TestSuiteLock.js';
import { PathCapabilityEnforcer } from '../repository/PathCapability.js';

export interface RepositorySnapshot {
  branch: string;
  headSha: string;
  isClean: boolean;
  remoteHeadSha?: string;
}

export interface GuardContext {
  currentState: WorkflowState;
  targetState: WorkflowState;
  workflowId: string;
  artifacts: {
    get<T = any>(artifactId: string): StoredArtifact<T> | undefined;
    getByType<T = any>(artifactType: string, workflowId?: string): StoredArtifact<T>[];
    getLatestAccepted<T = any>(artifactType: string, workflowId?: string): StoredArtifact<T> | undefined;
  };
  eventHistory: readonly WorkflowEvent[];
  config: WorkflowConfig;
  repository?: RepositorySnapshot;
  referencedArtifactIds?: string[];
  workspaceRoot?: string;
  metadata?: Record<string, unknown>;
}

export interface GuardResult {
  satisfied: boolean;
  reason: string;
}

export type GuardEvaluator = (context: GuardContext) => GuardResult;

export interface GuardDefinition {
  id: string;
  description: string;
  evaluate: GuardEvaluator;
}

const pass = (reason = 'Condition satisfied'): GuardResult => ({ satisfied: true, reason });
const fail = (reason: string): GuardResult => ({ satisfied: false, reason });

export const GUARDS: Record<string, GuardDefinition> = {
  // §24 Project Entry & Discovery Guards
  'G-PROJECT-001': {
    id: 'G-PROJECT-001',
    description: 'Repository classified as new project',
    evaluate: (ctx) => ctx.metadata?.entryMode === 'NEW_PROJECT' ? pass() : fail('Entry mode is not NEW_PROJECT')
  },
  'G-PROJECT-002': {
    id: 'G-PROJECT-002',
    description: 'No existing implementation requires adoption',
    evaluate: (ctx) => {
      if (ctx.metadata?.entryMode === 'NEW_PROJECT') {
        const hasHistory = ctx.repository && ctx.repository.headSha !== '0000000000000000000000000000000000000000';
        return hasHistory && ctx.metadata?.forceNew !== true
          ? fail('Existing repository history detected; project requires adoption instead of NEW_PROJECT')
          : pass();
      }
      return pass();
    }
  },
  'G-PROJECT-003': {
    id: 'G-PROJECT-003',
    description: 'Existing repository detected for adoption',
    evaluate: (ctx) => ctx.metadata?.entryMode === 'ADOPT_EXISTING_PROJECT' ? pass() : fail('Entry mode is not ADOPT_EXISTING_PROJECT')
  },
  'G-PROJECT-004': {
    id: 'G-PROJECT-004',
    description: 'No canonical PiRunner workflow history exists',
    evaluate: (ctx) => ctx.eventHistory.length === 0 ? pass() : fail('Canonical event journal already exists; resume required')
  },
  'G-PROJECT-005': {
    id: 'G-PROJECT-005',
    description: 'Canonical event journal exists for resumption',
    evaluate: (ctx) => ctx.metadata?.entryMode === 'RESUME_WORKFLOW' ? pass() : fail('Entry mode is not RESUME_WORKFLOW')
  },
  'G-PROJECT-006': {
    id: 'G-PROJECT-006',
    description: 'Workflow identity recoverable from event history',
    evaluate: (ctx) => {
      if (ctx.eventHistory.length === 0) {
        return fail('No event history to recover workflow identity from');
      }
      // Verify all events have the same workflowId
      const workflowIds = new Set(ctx.eventHistory.map(e => e.workflowId));
      if (workflowIds.size !== 1) {
        return fail(`Multiple workflow IDs in event history: ${Array.from(workflowIds).join(', ')}`);
      }
      return pass('Workflow identity verified');
    }
  },
  'G-REPO-000': {
    id: 'G-REPO-000',
    description: 'Repository identity established',
    evaluate: (ctx) => ctx.repository?.headSha && ctx.repository.branch
      ? pass()
      : fail('Repository identity (HEAD / branch) could not be determined')
  },
  'G-REPO-001A': {
    id: 'G-REPO-001A',
    description: 'Repository identity, revision, branch, and working-tree state captured in ProjectBaseline',
    evaluate: (ctx) => {
      const baseline = ctx.artifacts.getByType('ProjectBaseline').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      if (!baseline) return fail('ProjectBaseline artifact missing');
      const p = baseline.payload as any;
      return (p.repositoryIdentity && p.baseRevision && p.branch && p.workingTreeState)
        ? pass()
        : fail('ProjectBaseline missing mandatory identity/revision fields');
    }
  },
  'G-PROJECT-007': {
    id: 'G-PROJECT-007',
    description: 'Intake classification complete',
    evaluate: (ctx) => ctx.artifacts.getByType('ProjectBaseline').length > 0 ? pass() : fail('Intake baseline not yet recorded')
  },
  'G-PROJECT-008': {
    id: 'G-PROJECT-008',
    description: 'ProjectBaseline valid and accepted',
    evaluate: (ctx) => {
      const baseline = ctx.artifacts.getByType('ProjectBaseline').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      return baseline ? pass() : fail('ProjectBaseline not accepted');
    }
  },
  'G-REPO-002A': {
    id: 'G-REPO-002A',
    description: 'Adoption repository state explicitly recorded',
    evaluate: (ctx) => ctx.artifacts.getByType('ProjectBaseline').length > 0 ? pass() : fail('Repository adoption baseline not recorded')
  },

  // State Recovery & Validation Guards (§19, §20)
  'G-STATE-001': {
    id: 'G-STATE-001',
    description: 'Event journal schema valid and non-empty',
    evaluate: (ctx) => ctx.eventHistory.length > 0 ? pass() : fail('Event history is empty')
  },
  'G-STATE-002': {
    id: 'G-STATE-002',
    description: 'Event sequence monotonic and gapless',
    evaluate: (ctx) => {
      for (let i = 0; i < ctx.eventHistory.length; i++) {
        if (ctx.eventHistory[i].sequence !== i) {
          return fail(`Event sequence broken at index ${i}, found sequence ${ctx.eventHistory[i].sequence}`);
        }
      }
      return pass();
    }
  },
  'G-STATE-003': {
    id: 'G-STATE-003',
    description: 'Reducer replay succeeds',
    evaluate: (ctx) => ctx.eventHistory.length > 0 ? pass() : fail('No events available to replay')
  },
  'G-STATE-004': {
    id: 'G-STATE-004',
    description: 'Configuration version recoverable',
    evaluate: (ctx) => ctx.config?.version ? pass() : fail('Configuration version missing')
  },
  'G-STATE-005': {
    id: 'G-STATE-005',
    description: 'Artifact references resolvable in store',
    evaluate: (ctx) => {
      for (const evt of ctx.eventHistory) {
        for (const artId of evt.artifactIds || []) {
          if (!ctx.artifacts.get(artId)) {
            return fail(`Event [${evt.eventId}] references unresolvable artifact: ${artId}`);
          }
        }
      }
      return pass();
    }
  },
  'G-STATE-006': {
    id: 'G-STATE-006',
    description: 'Repository identity matches recovered state',
    evaluate: (ctx) => {
      const baseline = ctx.artifacts.getLatestAccepted('ProjectBaseline');
      if (baseline && ctx.repository) {
        return (baseline.payload as any).baseRevision === ctx.repository.headSha || ctx.eventHistory.length > 2
          ? pass()
          : fail('Live repository revision does not correspond to baseline state');
      }
      return pass();
    }
  },
  'G-STATE-007': {
    id: 'G-STATE-007',
    description: 'Expected branch matches recovered state',
    evaluate: (ctx) => {
      const baseline = ctx.artifacts.getLatestAccepted('ProjectBaseline');
      if (baseline && ctx.repository) {
        return (baseline.payload as any).branch === ctx.repository.branch
          ? pass()
          : fail(`Branch mismatch: expected ${(baseline.payload as any).branch}, current ${ctx.repository.branch}`);
      }
      return pass();
    }
  },
  'G-STATE-008': {
    id: 'G-STATE-008',
    description: 'Expected revision/state relationship matches',
    evaluate: (ctx) => {
      const impl = ctx.artifacts.getLatestAccepted('ImplementationResult');
      if (impl && (impl.payload as any).commitSha && ctx.repository) {
        return (impl.payload as any).commitSha === ctx.repository.headSha
          ? pass()
          : fail('Current repository HEAD does not match reviewed implementation commit');
      }
      return pass();
    }
  },
  'G-STATE-009': {
    id: 'G-STATE-009',
    description: 'Active artifact references match',
    evaluate: (ctx) => {
      if (ctx.referencedArtifactIds) {
        for (const id of ctx.referencedArtifactIds) {
          if (!ctx.artifacts.get(id)) return fail(`Active artifact [${id}] is missing from store`);
        }
      }
      return pass();
    }
  },
  'G-STATE-010': {
    id: 'G-STATE-010',
    description: 'Capability policy matches normative boundaries',
    evaluate: () => {
      const integrity = PathCapabilityEnforcer.validatePolicyIntegrity();
      return integrity.valid ? pass() : fail(`Capability policy violation: ${integrity.errors.join(', ')}`);
    }
  },
  'G-STATE-011': {
    id: 'G-STATE-011',
    description: 'Repository/workflow mismatch detected',
    evaluate: (ctx) => ctx.metadata?.validationStatus === 'MISMATCH' ? pass() : fail('No mismatch detected')
  },

  // Concept Guards
  'G-ART-001': {
    id: 'G-ART-001',
    description: 'ConceptPackage exists with status SUBMITTED',
    evaluate: (ctx) => {
      const pkg = ctx.artifacts.getByType('ConceptPackage').find(a => a.status === 'SUBMITTED');
      return pkg ? pass() : fail('No ConceptPackage with status SUBMITTED found');
    }
  },
  'G-ART-003': {
    id: 'G-ART-003',
    description: 'ConceptPackage status == ACCEPTED',
    evaluate: (ctx) => {
      const pkg = ctx.artifacts.getLatestAccepted('ConceptPackage');
      return pkg ? pass() : fail('No ACCEPTED ConceptPackage available');
    }
  },
  'G-ART-005': {
    id: 'G-ART-005',
    description: 'ConceptPackage status == REJECTED or critical questions unresolved',
    evaluate: (ctx) => {
      const pkg = ctx.artifacts.getByType('ConceptPackage').find(a => a.status === 'REJECTED');
      if (pkg) return pass('ConceptPackage rejected');
      const latest = ctx.artifacts.getLatestAccepted('ConceptPackage');
      const blocking = ((latest?.payload as any)?.unresolvedQuestions || []).filter((q: any) => q.severity === 'BLOCKING');
      return blocking.length > 0 ? pass('Blocking questions require human gate') : fail('No rejection or blocking questions found');
    }
  },
  'G-WF-001': {
    id: 'G-WF-001',
    description: 'No prior accepted ConceptPackage unless explicit revision',
    evaluate: (ctx) => {
      const accepted = ctx.artifacts.getByType('ConceptPackage').filter(a => a.status === 'ACCEPTED');
      return accepted.length <= 1 ? pass() : fail('Multiple unlinked ConceptPackages accepted without revision');
    }
  },

  // Specification Guards
  'G-ART-010': {
    id: 'G-ART-010',
    description: 'MasterSpecification status SUBMITTED',
    evaluate: (ctx) => {
      const spec = ctx.artifacts.getByType('MasterSpecification').find(a => a.status === 'SUBMITTED');
      return spec ? pass() : fail('No MasterSpecification with status SUBMITTED found');
    }
  },
  'G-ART-013': {
    id: 'G-ART-013',
    description: 'MasterSpecification status == ACCEPTED',
    evaluate: (ctx) => {
      const spec = ctx.artifacts.getLatestAccepted('MasterSpecification');
      return spec ? pass() : fail('No ACCEPTED MasterSpecification found');
    }
  },
  'G-ART-015': {
    id: 'G-ART-015',
    description: 'MasterSpecification rejected or architectural blocker',
    evaluate: (ctx) => {
      const spec = ctx.artifacts.getByType('MasterSpecification').find(a => a.status === 'REJECTED');
      if (spec) return pass('MasterSpecification rejected');
      const latest = ctx.artifacts.getLatestAccepted('MasterSpecification');
      const blocking = ((latest?.payload as any)?.unresolvedQuestions || []).filter((q: any) => q.severity === 'BLOCKING');
      return blocking.length > 0 ? pass('Blocking architectural questions present') : fail('No rejection or architectural blocker found');
    }
  },

  // Planning & Knowledge Guards
  'G-ART-020': {
    id: 'G-ART-020',
    description: 'Valid DailyPlan and SprintSpecification submitted',
    evaluate: (ctx) => {
      const sprint = ctx.artifacts.getByType('SprintSpecification').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      return sprint ? pass() : fail('Missing active SprintSpecification');
    }
  },
  'G-ART-022': {
    id: 'G-ART-022',
    description: 'Valid KnowledgeSnapshot verified',
    evaluate: (ctx) => {
      const snap = ctx.artifacts.getByType('KnowledgeSnapshot');
      return snap.length > 0 ? pass() : fail('No KnowledgeSnapshot available');
    }
  },
  'G-ART-023': {
    id: 'G-ART-023',
    description: 'Active accepted SprintSpecification exists',
    evaluate: (ctx) => {
      const sprint = ctx.artifacts.getByType('SprintSpecification').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      return sprint ? pass() : fail('No accepted SprintSpecification exists');
    }
  },
  'G-ART-024': {
    id: 'G-ART-024',
    description: 'Active accepted MasterSpecification exists',
    evaluate: (ctx) => {
      const spec = ctx.artifacts.getLatestAccepted('MasterSpecification');
      return spec ? pass() : fail('No accepted MasterSpecification exists');
    }
  },
  'G-ART-026': {
    id: 'G-ART-026',
    description: 'Either accepted MasterSpecification exists (workflow-scoped), or SprintSpecification is explicitly marked as surgical/no-governing-spec (workflow-scoped)',
    evaluate: (ctx) => {
      // Check for accepted MasterSpecification (workflow-scoped)
      const spec = ctx.artifacts.getLatestAccepted('MasterSpecification', ctx.workflowId);
      if (spec) return pass('Accepted MasterSpecification exists for this workflow');

      // No MasterSpecification — check if SprintSpecification is marked as surgical (workflow-scoped)
      const sprints = ctx.artifacts.getByType('SprintSpecification', ctx.workflowId);
      const sprint = sprints.find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      if (sprint) {
        const payload = sprint.payload as any;
        if (payload.surgicalChange === true || payload.noGoverningSpec === true) {
          return pass('SprintSpecification explicitly marked as surgical/no-governing-spec');
        }
      }

      return fail('No accepted MasterSpecification and SprintSpecification not marked as surgical');
    }
  },
  'G-TEST-001': {
    id: 'G-TEST-001',
    description: 'No active accepted TestSpecification exists for current sprint without revision',
    evaluate: (ctx) => {
      const existing = ctx.artifacts.getByType('TestSpecification').filter(a => a.status === 'ACCEPTED');
      return existing.length === 0 || ctx.metadata?.isRevision === true
        ? pass()
        : fail('Active accepted TestSpecification already exists; new authoring requires explicit revision flag');
    }
  },
  'G-REPO-012': {
    id: 'G-REPO-012',
    description: 'Isolated test-authoring workspace prepared and writable',
    evaluate: (ctx) => ctx.repository ? pass() : fail('Workspace not initialized')
  },
  'G-KNOW-005': {
    id: 'G-KNOW-005',
    description: 'Knowledge snapshot stale or incomplete',
    evaluate: (ctx) => {
      const snap = ctx.artifacts.getLatestAccepted('KnowledgeSnapshot');
      if (!snap) return pass('KnowledgeSnapshot missing, gate required');
      return ctx.metadata?.knowledgeStale === true ? pass('Knowledge verified stale') : fail('KnowledgeSnapshot is fresh; refresh not required');
    }
  },

  // Test Authoring -> Test Ready Guards
  'G-ART-025': {
    id: 'G-ART-025',
    description: 'Valid TestSpecification submitted with coverage and test cases',
    evaluate: (ctx) => {
      const testSpec = ctx.artifacts.getByType('TestSpecification').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      if (!testSpec) return fail('No TestSpecification submitted in artifact store');
      const payload: any = testSpec.payload;
      if (!payload.testCases || payload.testCases.length === 0) {
        return fail('TestSpecification contains zero test cases');
      }
      return pass();
    }
  },
  'G-TEST-006': {
    id: 'G-TEST-006',
    description: 'Test suite content hash recorded in TestSpecification',
    evaluate: (ctx) => {
      const testSpec = ctx.artifacts.getByType('TestSpecification').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      const hash = (testSpec?.payload as any)?.testSuiteContentHash;
      return hash && typeof hash === 'string' && hash.length === 64
        ? pass()
        : fail('Test suite content hash is missing or invalid SHA-256 in TestSpecification');
    }
  },
  'G-TEST-007': {
    id: 'G-TEST-007',
    description: 'Test source contains no production-source modifications',
    evaluate: (ctx) => {
      if (ctx.metadata?.modifiedFiles) {
        const files = ctx.metadata.modifiedFiles as string[];
        const invalid = files.filter(f => f.startsWith('src/'));
        if (invalid.length > 0) return fail(`Test authoring modified production files: ${invalid.join(', ')}`);
      }
      return pass();
    }
  },
  'G-TEST-010': {
    id: 'G-TEST-010',
    description: 'Test authoring blocker classified',
    evaluate: (ctx) => ctx.metadata?.testAuthoringBlocked === true ? pass() : fail('No test authoring blocker reported')
  },
  'G-CFG-009': {
    id: 'G-CFG-009',
    description: 'Test-authoring attempts exceeded threshold',
    evaluate: (ctx) => {
      const attempts = ctx.eventHistory.filter(e => e.stateAfter === 'TEST_AUTHORING').length;
      return attempts >= ctx.config.maxTestAuthoringAttempts
        ? pass('Max test authoring attempts exceeded')
        : fail(`Attempts (${attempts}) under max (${ctx.config.maxTestAuthoringAttempts})`);
    }
  },

  // Implementation Guards
  'G-ART-030': {
    id: 'G-ART-030',
    description: 'Active SprintSpecification accepted',
    evaluate: (ctx) => {
      const sprint = ctx.artifacts.getByType('SprintSpecification').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      return sprint ? pass() : fail('Active SprintSpecification missing');
    }
  },
  'G-ART-034': {
    id: 'G-ART-034',
    description: 'Active TestSpecification accepted and locked',
    evaluate: (ctx) => {
      const testSpec = ctx.artifacts.getLatestAccepted('TestSpecification');
      return testSpec ? pass('Accepted TestSpecification exists') : fail('No accepted TestSpecification found');
    }
  },
  'G-TEST-012': {
    id: 'G-TEST-012',
    description: 'Authoritative test-suite content hash matches locked specification',
    evaluate: (ctx) => {
      const lockDir = ctx.workspaceRoot ? join(ctx.workspaceRoot, '.hitm') : undefined;
      const lock = TestSuiteLock.loadLock(lockDir);
      const testSpec = ctx.artifacts.getLatestAccepted('TestSpecification');
      const expectedHash = (testSpec?.payload as any)?.testSuiteContentHash;

      if (!lock) return fail('No persistent TestSuiteLock exists');
      if (!testSpec) return fail('No accepted TestSpecification found to validate lock against');

      const lockValidation = TestSuiteLock.verifyLockMatchesSpec(lock, testSpec.artifactId, expectedHash);
      if (!lockValidation.valid) return fail(lockValidation.reason);

      return pass('TestSuiteLock matches accepted TestSpecification');
    }
  },
  'G-REPO-001': {
    id: 'G-REPO-001',
    description: 'Isolated implementation workspace clean and on expected branch',
    evaluate: (ctx) => {
      if (ctx.repository && !ctx.repository.isClean) {
        return fail('Repository working tree is dirty; implementation requires clean workspace');
      }
      return pass();
    }
  },

  // Implementation -> Commit Created
  'G-ART-031': {
    id: 'G-ART-031',
    description: 'ImplementationResult status == COMPLETED',
    evaluate: (ctx) => {
      const impl = ctx.artifacts.getByType('ImplementationResult').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      if (!impl) return fail('No ImplementationResult found');
      return (impl.payload as any).status === 'COMPLETED'
        ? pass()
        : fail(`ImplementationResult status is ${(impl.payload as any).status}, expected COMPLETED`);
    }
  },
  'G-ART-032': {
    id: 'G-ART-032',
    description: 'commitSha non-null and valid',
    evaluate: (ctx) => {
      const impl = ctx.artifacts.getByType('ImplementationResult').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      const sha = (impl?.payload as any)?.commitSha;
      return sha && /^[0-9a-f]{7,40}$/i.test(sha)
        ? pass()
        : fail('ImplementationResult does not contain a valid commitSha');
    }
  },
  'G-TEST-013': {
    id: 'G-TEST-013',
    description: 'Valid TestExecutionResult matches accepted TestSpecification and lock',
    evaluate: (ctx) => {
      const execResults = ctx.artifacts.getByType('TestExecutionResult');
      if (execResults.length === 0) {
        return fail('No TestExecutionResult found');
      }

      // Use getLatestAccepted to find the most recent accepted result
      const execResult = execResults[execResults.length - 1];
      const payload = execResult.payload as any;

      // Check status is PASSED
      if (payload.status !== 'PASSED') {
        return fail(`TestExecutionResult status is ${payload.status}, expected PASSED`);
      }

      // Verify against accepted TestSpecification
      const testSpec = ctx.artifacts.getLatestAccepted('TestSpecification');
      if (!testSpec) {
        return fail('No accepted TestSpecification found to validate result against');
      }

      // Verify testSpecificationArtifactId matches
      if (payload.testSpecificationArtifactId !== testSpec.artifactId) {
        return fail(`TestExecutionResult references artifact ${payload.testSpecificationArtifactId} but accepted TestSpecification is ${testSpec.artifactId}`);
      }

      // Verify suite hash matches lock
      const lockDir = ctx.workspaceRoot || join(process.cwd(), '.hitm');
      const lock = TestSuiteLock.loadLock(lockDir);
      if (!lock) {
        return fail('No TestSuiteLock exists to validate suite hash');
      }
      if (payload.testSuiteContentHash !== lock.testSuiteContentHash) {
        return fail(`TestExecutionResult suite hash (${payload.testSuiteContentHash}) differs from TestSuiteLock (${lock.testSuiteContentHash})`);
      }

      // Verify execution command matches TestSpecification
      const specPayload = testSpec.payload as any;
      if (payload.executionCommand !== specPayload.executionCommand) {
        return fail(`TestExecutionResult command (${payload.executionCommand}) differs from TestSpecification command (${specPayload.executionCommand})`);
      }

      // Verify repository revision matches
      if (ctx.repository && payload.repositoryRevision !== ctx.repository.headSha) {
        return fail(`TestExecutionResult revision (${payload.repositoryRevision}) differs from current HEAD (${ctx.repository.headSha})`);
      }

      return pass('TestExecutionResult matches accepted TestSpecification and lock');
    }
  },
  'G-REPO-003': {
    id: 'G-REPO-003',
    description: 'Working tree matches post-commit state',
    evaluate: (ctx) => ctx.repository?.isClean ? pass() : fail('Working tree contains uncommitted changes after commit creation')
  },
  'G-STUCK-001': {
    id: 'G-STUCK-001',
    description: 'Stuck detector reports implementation stuck',
    evaluate: (ctx) => ctx.metadata?.isStuck === true ? pass() : fail('StuckDetector did not flag execution as stuck')
  },
  'G-RUN-001': {
    id: 'G-RUN-001',
    description: 'AgentRunner reports failure or crash',
    evaluate: (ctx) => ctx.metadata?.agentExecutionStatus === 'FAILED' ? pass() : fail('AgentExecution status is not FAILED')
  },
  'G-CFG-002': {
    id: 'G-CFG-002',
    description: 'Implementation attempt limit reached',
    evaluate: (ctx) => {
      const attempts = ctx.eventHistory.filter(e => e.stateAfter === 'IMPLEMENTATION').length;
      return attempts >= ctx.config.maxImplementationAttempts
        ? pass('Max attempts reached')
        : fail(`Attempts (${attempts}) under max (${ctx.config.maxImplementationAttempts})`);
    }
  },

  // Triage Guards
  'G-ART-040': {
    id: 'G-ART-040',
    description: 'Triage disposition == RESUME_IMPLEMENTATION',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'RESUME_IMPLEMENTATION' ? pass() : fail('Triage disposition is not RESUME_IMPLEMENTATION');
    }
  },
  'G-ART-042': {
    id: 'G-ART-042',
    description: 'Triage disposition == SPECIFICATION_REVIEW',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'SPECIFICATION_REVIEW' ? pass() : fail('Triage disposition is not SPECIFICATION_REVIEW');
    }
  },
  'G-ART-044': {
    id: 'G-ART-044',
    description: 'Triage disposition == REPLAN',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'REPLAN' ? pass() : fail('Triage disposition is not REPLAN');
    }
  },
  'G-ART-045': {
    id: 'G-ART-045',
    description: 'Triage disposition == UPDATE_KNOWLEDGE',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'UPDATE_KNOWLEDGE' ? pass() : fail('Triage disposition is not UPDATE_KNOWLEDGE');
    }
  },
  'G-ART-046': {
    id: 'G-ART-046',
    description: 'Triage disposition == HUMAN_GATE',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'HUMAN_GATE' ? pass() : fail('Triage disposition is not HUMAN_GATE');
    }
  },
  'G-ART-047': {
    id: 'G-ART-047',
    description: 'Triage disposition == ABORT',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'ABORT' ? pass() : fail('Triage disposition is not ABORT');
    }
  },
  'G-ART-048': {
    id: 'G-ART-048',
    description: 'Triage disposition == TEST_AUTHORING',
    evaluate: (ctx) => {
      const t = ctx.artifacts.getLatestAccepted('TriageReport');
      return (t?.payload as any)?.disposition === 'TEST_AUTHORING' ? pass() : fail('Triage disposition is not TEST_AUTHORING');
    }
  },

  // Review Guards
  'G-ART-050': {
    id: 'G-ART-050',
    description: 'ImplementationResult and commitSha verified for review',
    evaluate: (ctx) => {
      const impl = ctx.artifacts.getByType('ImplementationResult');
      return impl.length > 0 ? pass() : fail('No ImplementationResult available for review');
    }
  },
  'G-TEST-016': {
    id: 'G-TEST-016',
    description: 'Valid TestExecutionResult corresponds to commit under review',
    evaluate: (ctx) => {
      const execResults = ctx.artifacts.getByType('TestExecutionResult');
      if (execResults.length === 0) {
        return fail('No TestExecutionResult available for review');
      }

      // Use getLatestAccepted to find the most recent result
      const execResult = execResults[execResults.length - 1];
      const payload = execResult.payload as any;

      // Check status is PASSED
      if (payload.status !== 'PASSED') {
        return fail(`TestExecutionResult status is ${payload.status}, expected PASSED`);
      }

      // Verify against accepted TestSpecification
      const testSpec = ctx.artifacts.getLatestAccepted('TestSpecification');
      if (!testSpec) {
        return fail('No accepted TestSpecification found to validate result against');
      }

      // Verify testSpecificationArtifactId matches
      if (payload.testSpecificationArtifactId !== testSpec.artifactId) {
        return fail(`TestExecutionResult references artifact ${payload.testSpecificationArtifactId} but accepted TestSpecification is ${testSpec.artifactId}`);
      }

      // Verify suite hash matches lock
      const lockDir = ctx.workspaceRoot || join(process.cwd(), '.hitm');
      const lock = TestSuiteLock.loadLock(lockDir);
      if (!lock) {
        return fail('No TestSuiteLock exists to validate suite hash');
      }
      if (payload.testSuiteContentHash !== lock.testSuiteContentHash) {
        return fail(`TestExecutionResult suite hash (${payload.testSuiteContentHash}) differs from TestSuiteLock (${lock.testSuiteContentHash})`);
      }

      // Verify repository revision matches current HEAD
      if (ctx.repository && payload.repositoryRevision !== ctx.repository.headSha) {
        return fail(`TestExecutionResult revision (${payload.repositoryRevision}) differs from current HEAD (${ctx.repository.headSha})`);
      }

      return pass('TestExecutionResult corresponds to commit under review');
    }
  },
  'G-ART-051': {
    id: 'G-ART-051',
    description: 'ReviewResult status == PASS and zero blocking findings',
    evaluate: (ctx) => {
      const rev = ctx.artifacts.getByType('ReviewResult').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      if (!rev) return fail('No ReviewResult submitted');
      const payload: any = rev.payload;
      if (payload.status !== 'PASS') return fail(`ReviewResult status is ${payload.status}`);
      if (payload.blockingFindings && payload.blockingFindings.length > 0) {
        return fail(`ReviewResult contains ${payload.blockingFindings.length} blocking finding(s)`);
      }
      return pass();
    }
  },
  'G-ART-055': {
    id: 'G-ART-055',
    description: 'ReviewResult status == FAIL',
    evaluate: (ctx) => {
      const rev = ctx.artifacts.getByType('ReviewResult').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      return (rev?.payload as any)?.status === 'FAIL' ? pass() : fail('ReviewResult is not FAIL');
    }
  },
  'G-ART-056': {
    id: 'G-ART-056',
    description: 'ReviewResult status == BLOCKED',
    evaluate: (ctx) => {
      const rev = ctx.artifacts.getByType('ReviewResult').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      return (rev?.payload as any)?.status === 'BLOCKED' ? pass() : fail('ReviewResult is not BLOCKED');
    }
  },
  'G-CFG-005': {
    id: 'G-CFG-005',
    description: 'Review iteration maximum reached',
    evaluate: (ctx) => {
      const count = ctx.eventHistory.filter(e => e.stateAfter === 'REVIEW').length;
      return count >= ctx.config.maxReviewIterationsPerSprint ? pass('Max review iterations reached') : fail(`Review iterations (${count}) below limit`);
    }
  },
  'G-ART-057': {
    id: 'G-ART-057',
    description: 'Rework task prepared',
    evaluate: (ctx) => ctx.metadata?.reworkPrepared === true ? pass() : fail('Rework task not prepared in metadata')
  },
  'G-TEST-019': {
    id: 'G-TEST-019',
    description: 'Deterministic test execution passed with zero mandatory failures',
    evaluate: (ctx) => {
      const exec = ctx.artifacts.getByType('TestExecutionResult').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      if (!exec) return fail('No TestExecutionResult available');
      return (exec.payload as any).status === 'PASSED' ? pass() : fail('TestExecutionResult did not pass');
    }
  },

  // Publication & Human Authority Guards
  'G-ART-060': {
    id: 'G-ART-060',
    description: 'Sprint accepted, criteria met',
    evaluate: (ctx) => {
      const rev = ctx.artifacts.getByType('ReviewResult').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      return rev && (rev.payload as any).status === 'PASS' ? pass() : fail('Sprint not accepted with PASS review');
    }
  },
  'G-REPO-006': {
    id: 'G-REPO-006',
    description: 'Repository clean, correct branch, expected HEAD',
    evaluate: (ctx) => {
      if (!ctx.repository) return fail('Live repository state unavailable');
      if (!ctx.repository.isClean) return fail('Repository working tree is dirty; publication requires clean repository');
      return pass();
    }
  },
  'G-HUMAN-001': {
    id: 'G-HUMAN-001',
    description: 'Explicit human push approval granted',
    evaluate: (ctx) => ctx.metadata?.humanApproved === true ? pass() : fail('Human push approval not provided')
  },
  'G-REPO-008': {
    id: 'G-REPO-008',
    description: 'Pre-push verification failed',
    evaluate: (ctx) => ctx.metadata?.prePushFailed === true ? pass() : fail('Pre-push verification did not fail')
  },
  'G-REPO-009': {
    id: 'G-REPO-009',
    description: 'Remote HEAD matches expected SHA',
    evaluate: (ctx) => {
      if (ctx.repository?.remoteHeadSha && ctx.repository?.headSha) {
        return ctx.repository.remoteHeadSha === ctx.repository.headSha
          ? pass()
          : fail(`Remote HEAD (${ctx.repository.remoteHeadSha}) does not match local expected SHA (${ctx.repository.headSha})`);
      }
      return pass('Remote HEAD verification accepted');
    }
  },
  'G-PLAN-001': {
    id: 'G-PLAN-001',
    description: 'Remaining work exists',
    evaluate: (ctx) => ctx.metadata?.remainingWork === true ? pass() : fail('No remaining work recorded in metadata')
  },
  'G-TIME-001': {
    id: 'G-TIME-001',
    description: 'Day boundary met',
    evaluate: (ctx) => ctx.metadata?.dayBoundary === true ? pass() : fail('Day boundary condition not met')
  },
  'G-EVT-001': {
    id: 'G-EVT-001',
    description: 'Relevant events available for devlog',
    evaluate: (ctx) => ctx.eventHistory.length > 0 ? pass() : fail('No workflow events recorded')
  },
  'G-ART-070': {
    id: 'G-ART-070',
    description: 'Valid DailyDevlog accepted',
    evaluate: (ctx) => {
      const devlog = ctx.artifacts.getByType('DailyDevlog').find(a => a.status === 'ACCEPTED' || a.status === 'SUBMITTED');
      return devlog ? pass() : fail('No DailyDevlog available');
    }
  },
  'G-ART-071': {
    id: 'G-ART-071',
    description: 'No publication requested',
    evaluate: (ctx) => ctx.metadata?.skipPublication === true ? pass() : fail('Publication skipping not explicitly authorized')
  },
  'G-ART-072': {
    id: 'G-ART-072',
    description: 'Valid PublicationPackage submitted',
    evaluate: (ctx) => {
      const pub = ctx.artifacts.getByType('PublicationPackage').find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
      return pub ? pass() : fail('No PublicationPackage submitted');
    }
  },
  'G-HUMAN-002': {
    id: 'G-HUMAN-002',
    description: 'Explicit human publication approval granted',
    evaluate: (ctx) => ctx.metadata?.humanApproved === true ? pass() : fail('Publication approval not granted')
  },
  'G-VAL-001': {
    id: 'G-VAL-001',
    description: 'Deterministic schema/artifact validation failure',
    evaluate: (ctx) => ctx.metadata?.validationFailed === true ? pass() : fail('No artifact validation failure occurred')
  },
  'G-CFG-006': {
    id: 'G-CFG-006',
    description: 'Artifact recovery limit exceeded',
    evaluate: (ctx) => ctx.metadata?.recoveryLimitExceeded === true ? pass() : fail('Artifact recovery threshold not exceeded')
  },
  'G-REPO-010': {
    id: 'G-REPO-010',
    description: 'Unexpected repository mutation detected',
    evaluate: (ctx) => (ctx.repository && !ctx.repository.isClean) || ctx.metadata?.validationStatus === 'MISMATCH' || ctx.metadata?.mutationConflict === true
      ? pass('Repository conflict verified')
      : fail('No repository mutation conflict detected')
  },
  'G-REPO-011': {
    id: 'G-REPO-011',
    description: 'Repository conflict confirmed',
    evaluate: (ctx) => ctx.currentState === 'REPOSITORY_CONFLICT' || ctx.metadata?.conflictConfirmed === true ? pass() : fail('Conflict not confirmed')
  },
  'G-RUN-002': {
    id: 'G-RUN-002',
    description: 'Agent failure recoverable',
    evaluate: (ctx) => ctx.metadata?.unrecoverable === true ? fail('Failure is marked unrecoverable') : pass()
  },
  'G-RUN-003': {
    id: 'G-RUN-003',
    description: 'Agent failure unrecoverable',
    evaluate: (ctx) => ctx.metadata?.unrecoverable === true ? pass() : fail('Failure is marked recoverable')
  },
  'G-HUMAN-003': {
    id: 'G-HUMAN-003',
    description: 'Explicit human abort requested',
    evaluate: (ctx) => ctx.metadata?.humanAbort === true ? pass() : fail('Human abort signal not authorized')
  }
};

// Skill Architect Anti-Proliferation Guard
GUARDS['G-SKILL-001'] = {
  id: 'G-SKILL-001',
  description: 'Anti-proliferation rule: procedure has >=3 real uses in devlogs or events',
  evaluate: (ctx) => {
    // Check if candidate skill artifact provides >=3 verified uses
    const skills = ctx.artifacts.getByType('SkillPackage');
    const candidate = skills.find(a => a.status === 'SUBMITTED' || a.status === 'ACCEPTED');
    if (candidate) {
      const payload = candidate.payload as any;
      if (payload.verifiedUses && Array.isArray(payload.verifiedUses) && payload.verifiedUses.length >= 3) {
        return pass(`Anti-proliferation verified: procedure has ${payload.verifiedUses.length} real uses`);
      }
      if (payload.verifiedUses && !Array.isArray(payload.verifiedUses)) {
        return fail('Anti-proliferation violation: verifiedUses must be an array of use identifiers');
      }
      return fail(`Anti-proliferation violation: procedure has ${payload.verifiedUses?.length ?? 0} verified uses; minimum 3 required`);
    }
    return fail('Anti-proliferation violation: no SkillPackage artifact found to verify uses');
  }
};
