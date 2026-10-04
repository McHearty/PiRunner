import { RepositorySnapshot } from '../workflow/Guards.js';

export interface RepositoryPort {
  getFreshSnapshot(): RepositorySnapshot;
  getUncommittedFiles(): string[];
  verifyCommit(sha: string): boolean;
  getRemoteHeadRevision(): string | null;
}
