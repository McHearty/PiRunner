import { execSync } from 'node:child_process';
import { RepositorySnapshot } from '../../domain/workflow/Guards.js';

export class GitRepository {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  public getFreshSnapshot(): RepositorySnapshot {
    let branch = 'unknown';
    let headSha = '0000000000000000000000000000000000000000';
    let isClean = true;

    try {
      branch = execSync('git branch --show-current', {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim() || 'main';

      headSha = execSync('git rev-parse HEAD', {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();

      const statusOutput = execSync('git status --porcelain', {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();

      isClean = statusOutput.length === 0;
    } catch {}

    return {
      branch,
      headSha,
      isClean
    };
  }

  public getUncommittedFiles(): string[] {
    try {
      const output = execSync('git status --porcelain', {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();

      if (!output) return [];
      return output.split('\n').map(line => line.slice(3).trim());
    } catch {
      return [];
    }
  }

  public verifyCommit(sha: string): boolean {
    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return false;
    try {
      execSync(`git cat-file -e ${sha}^{commit}`, {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      return true;
    } catch {
      return false;
    }
  }
}
