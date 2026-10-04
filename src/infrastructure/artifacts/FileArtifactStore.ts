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

  public save(artifact: StoredArtifact): ValidationResult {
    const valResult = this.validator.validateArtifact(artifact);
    if (!valResult.valid) {
      return valResult;
    }

    const filePath = join(this.storageDir, `${artifact.artifactId}.json`);
    writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return { valid: true, errors: [] };
  }

  public get<T = Record<string, unknown>>(artifactId: string): StoredArtifact<T> | undefined {
    const filePath = join(this.storageDir, `${artifactId}.json`);
    if (!existsSync(filePath)) return undefined;
    return JSON.parse(readFileSync(filePath, 'utf8')) as StoredArtifact<T>;
  }

  public getByType<T = Record<string, unknown>>(artifactType: string): StoredArtifact<T>[] {
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
}
