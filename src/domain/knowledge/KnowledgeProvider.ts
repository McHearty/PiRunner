export interface KnowledgeRequest {
  workflowId: string;
  taskId: string;
  sourceRevision?: string;
  includePaths?: string[];
  maxAgeSeconds?: number;
}

export interface RelevantSourceFile {
  path: string;
  contentHash: string;
  language?: string;
}

export interface RelevantSymbol {
  name: string;
  kind: 'class' | 'interface' | 'type' | 'function' | 'method' | 'property' | 'enum' | 'const' | 'variable' | 'module' | 'other';
  location: {
    path: string;
    line: number;
    column?: number;
  };
  signature?: string;
  exported?: boolean;
}

export interface DependencyEntry {
  name: string;
  version: string;
  resolved?: string;
  ecosystem?: 'npm' | 'pypi' | 'crates' | 'go' | 'maven' | 'other';
  manifestPath?: string;
}

export interface DocumentationRef {
  identifier: string;
  title?: string;
  retrievedAt?: string;
  checksum?: string;
  sourceRevision?: string;
}

export interface KnowledgeSnapshotPayload {
  sourceRevision: string;
  dependencyLockHash: string;
  verifiedAt: string;
  freshnessPolicyVersion: string;
  relevantSourceFiles: RelevantSourceFile[];
  relevantSymbols: RelevantSymbol[];
  dependencies: DependencyEntry[];
  documentationRefs: DocumentationRef[];
  notes?: string;
}

export interface KnowledgeProvider {
  produceSnapshot(request: KnowledgeRequest): Promise<KnowledgeSnapshotPayload>;
  invalidate(keys: string[]): Promise<void>;
}
