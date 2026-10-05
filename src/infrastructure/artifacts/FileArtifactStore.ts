import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ArtifactValidator, ValidationResult } from '../../domain/artifacts/ArtifactValidator.js';
import { StoredArtifact } from '../../domain/artifacts/ArtifactStore.js';

export class FileArtifactStore {
  private readonly storageDir: string;

  constructor(
    private readonly validator: ArtifactValidator,
    storageDir: string = join(process.cwd(), '.hitm', 'artifacts')
  ) {
    this.storageDir = storageDir;
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public save(artifact: StoredArtifact<any>): ValidationResult {
    const valResult = this.validator.validateArtifact(artifact);
    if (!valResult.valid) {
      return valResult;
    }

    const filePath = join(this.storageDir, `${artifact.artifactId}.json`);
    writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return { valid: true, errors: [] };
  }

  public get<T = any>(artifactId: string): StoredArtifact<T> | undefined {
    const filePath = join(this.storageDir, `${artifactId}.json`);
    if (!existsSync(filePath)) return undefined;
    return JSON.parse(readFileSync(filePath, 'utf8')) as StoredArtifact<T>;
  }

  public getByType<T = any>(artifactType: string): StoredArtifact<T>[] {
    const files = readdirSync(this.storageDir).filter(f => f.endsWith('.json'));
    const matches: StoredArtifact<T>[] = [];
    for (const f of files) {
      const art = JSON.parse(readFileSync(join(this.storageDir, f), 'utf8')) as StoredArtifact<T>;
      if (art.artifactType === artifactType) {
        matches.push(art);
      }
    }
    return matches;
  }

  /**
   * Returns the latest accepted artifact of the given type, deterministically sorted by createdAt,
   * then artifactId as tiebreaker. Filters by workflowId to prevent cross-workflow authority.
   * @param artifactType The artifact type to search for
   * @param workflowId Optional workflow ID to filter by (required for provenance)
   */
  public getLatestAccepted<T = any>(artifactType: string, workflowId?: string): StoredArtifact<T> | undefined {
    let matching = this.getByType<T>(artifactType).filter(a => a.status === 'ACCEPTED');
    if (workflowId) {
      matching = matching.filter(a => a.workflowId === workflowId);
    }
    if (matching.length === 0) return undefined;

    // Deterministic ordering: createdAt (newest first), then artifactId as tiebreaker
    matching.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeB !== timeA) return timeB - timeA; // Newest first
      return a.artifactId.localeCompare(b.artifactId); // Deterministic tiebreaker
    });

    return matching[0];
  }
}
