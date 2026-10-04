import { ArtifactValidator, ValidationResult } from './ArtifactValidator.js';

export interface StoredArtifact<T = any> {
  artifactId: string;
  artifactType: string;
  schemaVersion: string;
  workflowId: string;
  taskId: string;
  agentId: string;
  createdAt: string;
  parentArtifactIds: string[];
  sourceRefs: Array<{
    type: string;
    identifier: string;
    revision?: string;
    location?: string;
    retrievedAt?: string;
    checksum?: string;
  }>;
  status: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
  payload: T;
}

export class ArtifactStore {
  private readonly artifacts = new Map<string, StoredArtifact>();

  constructor(private readonly validator: ArtifactValidator) {}

  public save(artifact: StoredArtifact<any>): ValidationResult {
    const valResult = this.validator.validateArtifact(artifact);
    if (!valResult.valid) {
      return valResult;
    }

    this.artifacts.set(artifact.artifactId, Object.freeze(JSON.parse(JSON.stringify(artifact))));
    return { valid: true, errors: [] };
  }

  public get<T = any>(artifactId: string): StoredArtifact<T> | undefined {
    return this.artifacts.get(artifactId) as StoredArtifact<T> | undefined;
  }

  public getByType<T = any>(artifactType: string): StoredArtifact<T>[] {
    return Array.from(this.artifacts.values()).filter(
      a => a.artifactType === artifactType
    ) as StoredArtifact<T>[];
  }

  public getLatestAccepted<T = any>(artifactType: string): StoredArtifact<T> | undefined {
    const matching = this.getByType<T>(artifactType).filter(a => a.status === 'ACCEPTED');
    return matching[matching.length - 1];
  }
}
