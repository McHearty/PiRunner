import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { StoredArtifact } from '../artifacts/ArtifactStore.js';
import { RepositorySnapshot } from '../workflow/Guards.js';
import { RepositoryPort } from '../repository/RepositoryPort.js';

export interface ProjectBaselinePayload {
  repositoryIdentity: string;
  baseRevision: string;
  branch: string;
  workingTreeState: 'CLEAN' | 'DIRTY';
  projectType: string;
  buildSystem: string | null;
  specificationRefs: any[];
  testRefs: any[];
  documentationRefs: any[];
  dependencyLockHash: string | null;
  sourceInventory: any[];
  testInventory: any[];
  existingCiConfiguration: any[];
  detectedUncommittedChanges: string[];
  unresolvedProjectQuestions: string[];
  intakeTimestamp: string;
  repositorySnapshotHash: string;
}

export class ProjectIntakeService {
  public static createBaselineArtifact(
    workflowId: string,
    snapshot: RepositorySnapshot,
    repository: RepositoryPort,
    workspaceRoot: string = process.cwd()
  ): StoredArtifact<ProjectBaselinePayload> {
    const uncommittedChanges = repository.getUncommittedFiles();

    // Dynamically detect project type & build system (§7)
    let projectType = 'unknown';
    let buildSystem: string | null = null;
    let repositoryIdentity = 'unknown-repo';

    const pkgPath = join(workspaceRoot, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        repositoryIdentity = pkg.name || 'unnamed-project';
        projectType = existsSync(join(workspaceRoot, 'tsconfig.json')) ? 'typescript' : 'javascript';
        buildSystem = 'npm';
      } catch {}
    } else if (existsSync(join(workspaceRoot, 'Cargo.toml'))) {
      projectType = 'rust';
      buildSystem = 'cargo';
    } else if (existsSync(join(workspaceRoot, 'pyproject.toml')) || existsSync(join(workspaceRoot, 'requirements.txt'))) {
      projectType = 'python';
      buildSystem = 'pip';
    }

    let dependencyLockHash: string | null = null;
    const lockPath = join(workspaceRoot, 'package-lock.json');
    if (existsSync(lockPath)) {
      dependencyLockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
    }

    // Dynamic discovery of specifications, tests, docs, and CI
    const specificationRefs: any[] = [];
    if (existsSync(join(workspaceRoot, 'TECHSPEC.md'))) specificationRefs.push({ type: 'DOCUMENTATION', identifier: 'TECHSPEC.md' });
    if (existsSync(join(workspaceRoot, 'SPEC.md'))) specificationRefs.push({ type: 'DOCUMENTATION', identifier: 'SPEC.md' });

    const testRefs: any[] = [];
    if (existsSync(join(workspaceRoot, 'tests'))) testRefs.push({ type: 'FILE', identifier: 'tests' });
    else if (existsSync(join(workspaceRoot, 'test'))) testRefs.push({ type: 'FILE', identifier: 'test' });

    const documentationRefs: any[] = [];
    if (existsSync(join(workspaceRoot, 'README.md'))) documentationRefs.push({ type: 'FILE', identifier: 'README.md' });

    const existingCiConfiguration: any[] = [];
    const ghWorkflows = join(workspaceRoot, '.github', 'workflows');
    if (existsSync(ghWorkflows)) {
      try {
        for (const file of readdirSync(ghWorkflows)) {
          existingCiConfiguration.push({ type: 'FILE', identifier: `.github/workflows/${file}` });
        }
      } catch {}
    }

    const snapshotHash = createHash('sha256')
      .update(`${snapshot.branch}:${snapshot.headSha}:${snapshot.isClean}`)
      .digest('hex');

    const payload: ProjectBaselinePayload = {
      repositoryIdentity,
      baseRevision: snapshot.headSha,
      branch: snapshot.branch,
      workingTreeState: snapshot.isClean ? 'CLEAN' : 'DIRTY',
      projectType,
      buildSystem,
      specificationRefs,
      testRefs,
      documentationRefs,
      dependencyLockHash,
      sourceInventory: existsSync(join(workspaceRoot, 'src')) ? [{ type: 'FILE', identifier: 'src' }] : [],
      testInventory: testRefs,
      existingCiConfiguration,
      detectedUncommittedChanges: uncommittedChanges,
      unresolvedProjectQuestions: [],
      intakeTimestamp: new Date().toISOString(),
      repositorySnapshotHash: snapshotHash
    };

    return {
      artifactId: `baseline-${Date.now()}`,
      artifactType: 'ProjectBaseline',
      schemaVersion: '1.0.0',
      workflowId,
      taskId: 'intake',
      agentId: '0000',
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'GIT', identifier: snapshot.headSha }],
      status: 'ACCEPTED',
      payload
    };
  }
}
