import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { StoredArtifact } from '../artifacts/ArtifactStore.js';
import { RepositorySnapshot } from '../workflow/Guards.js';
import { WorkflowIdentityService } from '../workflow/WorkflowIdentity.js';

export type ProjectEntryMode = 'NEW_PROJECT' | 'ADOPT_EXISTING_PROJECT' | 'RESUME_WORKFLOW' | 'START_NEW_WORKFLOW';

export interface ProjectDiscoveryResult {
  entryMode: ProjectEntryMode;
  repositorySnapshot: RepositorySnapshot;
  hasCanonicalEvents: boolean;
  eventCount: number;
  activeWorkflowId?: string;
}

export class ProjectDiscoveryService {
  public static inspect(workspaceRoot: string = process.cwd()): ProjectDiscoveryResult {
    const hitmDir = join(workspaceRoot, '.hitm');
    const eventsPath = join(hitmDir, 'events.jsonl');
    let hasCanonicalEvents = false;
    let eventCount = 0;

    if (existsSync(eventsPath)) {
      const lines = readFileSync(eventsPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
      eventCount = lines.length;
      hasCanonicalEvents = eventCount > 0;
    }

    const repositorySnapshot = this.captureRepositorySnapshot(workspaceRoot);

    let entryMode: ProjectEntryMode;
    
    // Sprint 8: Check workflow identity first
    const identity = WorkflowIdentityService.load(workspaceRoot);
    if (identity && identity.status === 'ACTIVE') {
      // Active workflow exists - resume it regardless of journal existence
      entryMode = 'RESUME_WORKFLOW';
    } else if (hasCanonicalEvents) {
      // Journal exists but no active identity - historical workflows only
      entryMode = 'RESUME_WORKFLOW';
    } else {
      // Check if project has pre-existing source files or commits
      const hasSrc = existsSync(join(workspaceRoot, 'src'));
      const hasPkg = existsSync(join(workspaceRoot, 'package.json'));
      const hasGit = existsSync(join(workspaceRoot, '.git'));
      if ((hasSrc || hasPkg) && hasGit) {
        entryMode = 'ADOPT_EXISTING_PROJECT';
      } else {
        entryMode = 'NEW_PROJECT';
      }
    }

    return {
      entryMode,
      repositorySnapshot,
      hasCanonicalEvents,
      eventCount,
      activeWorkflowId: identity && identity.status === 'ACTIVE' ? identity.workflowId : undefined
    };
  }

  public static captureRepositorySnapshot(workspaceRoot: string): RepositorySnapshot {
    let branch = 'unknown';
    let headSha = '0000000000000000000000000000000000000000';
    let isClean = true;

    try {
      branch = execSync('git branch --show-current', { cwd: workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'main';
      headSha = execSync('git rev-parse HEAD', { cwd: workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const statusOutput = execSync('git status --porcelain', { cwd: workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      isClean = statusOutput.length === 0;
    } catch {}

    return {
      branch,
      headSha,
      isClean
    };
  }
}
