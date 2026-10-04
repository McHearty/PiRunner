import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { StoredArtifact } from '../artifacts/ArtifactStore.js';
import { RepositorySnapshot } from '../workflow/Guards.js';

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
    workspaceRoot: string = process.cwd()
  ): StoredArtifact<ProjectBaselinePayload> {
    const pkgPath = join(workspaceRoot, 'package.json');
    let projectType = 'typescript';
    let buildSystem: string | null = 'npm';

    let dependencyLockHash: string | null = null;
    const lockPath = join(workspaceRoot, 'package-lock.json');
    if (existsSync(lockPath)) {
      dependencyLockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
    }

    const snapshotHash = createHash('sha256')
      .update(`${snapshot.branch}:${snapshot.headSha}:${snapshot.isClean}`)
      .digest('hex');

    const payload: ProjectBaselinePayload = {
      repositoryIdentity: 'McHearty/PiRunner',
      baseRevision: snapshot.headSha,
      branch: snapshot.branch,
      workingTreeState: snapshot.isClean ? 'CLEAN' : 'DIRTY',
      projectType,
      buildSystem,
      specificationRefs: [{ type: 'DOCUMENTATION', identifier: 'TECHSPEC.md' }],
      testRefs: [{ type: 'FILE', identifier: 'tests' }],
      documentationRefs: [{ type: 'FILE', identifier: 'README.md' }],
      dependencyLockHash,
      sourceInventory: [{ type: 'FILE', identifier: 'src' }],
      testInventory: [{ type: 'FILE', identifier: 'tests' }],
      existingCiConfiguration: [],
      detectedUncommittedChanges: [],
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
