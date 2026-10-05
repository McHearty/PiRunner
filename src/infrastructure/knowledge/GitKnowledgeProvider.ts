import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import {
  KnowledgeProvider,
  KnowledgeRequest,
  KnowledgeSnapshotPayload,
  RelevantSourceFile
} from '../../domain/knowledge/KnowledgeProvider.js';
import { MultiEcosystemKnowledgeExtractor } from './MultiEcosystemKnowledgeExtractor.js';

export class GitKnowledgeProvider implements KnowledgeProvider {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  public async produceSnapshot(request: KnowledgeRequest): Promise<KnowledgeSnapshotPayload> {
    const sourceRevision = this.resolveRevision(request.sourceRevision);
    const dependencyLockHash = this.computeLockHash();
    const relevantSourceFiles = this.scanSourceFiles();

    // Extract real symbol graph across all source files (§20, §46)
    const relevantSymbols = MultiEcosystemKnowledgeExtractor.extractSymbols(this.workspaceRoot, relevantSourceFiles);

    // Ingest dependencies across npm, Gradle/Maven, Python, Rust, Go (§12.8)
    const dependencies = MultiEcosystemKnowledgeExtractor.extractDependencies(this.workspaceRoot);

    // Ingest documentation and external API / modloader knowledge
    const documentationRefs = MultiEcosystemKnowledgeExtractor.extractDocumentationRefs(this.workspaceRoot);

    return {
      sourceRevision,
      dependencyLockHash,
      verifiedAt: new Date().toISOString(),
      freshnessPolicyVersion: '1.0.0',
      relevantSourceFiles,
      relevantSymbols,
      dependencies,
      documentationRefs,
      notes: `Knowledge synchronized: ${relevantSymbols.length} symbol(s), ${dependencies.length} dependency/dependencies across project ecosystems.`
    };
  }

  public async invalidate(_keys: string[]): Promise<void> {}

  private resolveRevision(override?: string): string {
    if (override && /^[0-9a-f]{7,40}$/i.test(override)) return override;
    try {
      const sha = execSync('git rev-parse HEAD', { cwd: this.workspaceRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha;
    } catch {}
    return createHash('sha1').update('fallback-revision').digest('hex');
  }

  private computeLockHash(): string {
    // Multi-ecosystem lockfile discovery
    const candidates = [
      'package-lock.json',
      'gradle.lockfile',
      'pom.xml',
      'Cargo.lock',
      'poetry.lock',
      'Pipfile.lock',
      'package.json'
    ];

    for (const c of candidates) {
      const p = join(this.workspaceRoot, c);
      if (existsSync(p)) {
        return createHash('sha256').update(readFileSync(p)).digest('hex');
      }
    }
    return createHash('sha256').update('empty-lockfile-baseline').digest('hex');
  }

  private scanSourceFiles(): RelevantSourceFile[] {
    const scanDirs = ['src', 'app', 'lib', 'tests', 'test'];
    const results: RelevantSourceFile[] = [];

    const extLangMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.java': 'java',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.json': 'json'
    };

    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      try {
        for (const entry of readdirSync(dir)) {
          if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build' || entry === '.gradle') continue;
          const full = join(dir, entry);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (stat.isFile()) {
            const ext = Object.keys(extLangMap).find(e => entry.endsWith(e));
            if (ext) {
              const content = readFileSync(full);
              const hash = createHash('sha256').update(content).digest('hex');
              results.push({
                path: relative(this.workspaceRoot, full).replace(/\\/g, '/'),
                contentHash: hash,
                language: extLangMap[ext]
              });
            }
          }
        }
      } catch {}
    };

    for (const d of scanDirs) {
      walk(join(this.workspaceRoot, d));
    }

    return results;
  }
}
