import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import {
  RelevantSourceFile,
  RelevantSymbol,
  DependencyEntry,
  DocumentationRef
} from '../../domain/knowledge/KnowledgeProvider.js';

export class MultiEcosystemKnowledgeExtractor {
  public static extractDependencies(workspaceRoot: string): DependencyEntry[] {
    const deps: DependencyEntry[] = [];

    // Node.js (npm)
    const pkgPath = join(workspaceRoot, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        for (const [name, version] of Object.entries(allDeps)) {
          deps.push({
            name,
            version: String(version),
            resolved: String(version),
            ecosystem: 'npm',
            manifestPath: 'package.json'
          });
        }
      } catch {}
    }

    // Java / Gradle / Maven (e.g. Minecraft Forge / Fabric / NeoForge / Spigot)
    const gradlePath = existsSync(join(workspaceRoot, 'build.gradle.kts'))
      ? join(workspaceRoot, 'build.gradle.kts')
      : join(workspaceRoot, 'build.gradle');

    if (existsSync(gradlePath)) {
      try {
        const content = readFileSync(gradlePath, 'utf8');
        const depMatches = content.matchAll(/(?:implementation|api|compileOnly|runtimeOnly|modImplementation)\s*[\('"]+([^:'"\s]+):([^:'"\s]+):?([^:'"\s]*)[\)'"]+/g);
        for (const m of depMatches) {
          const ver = m[3] || 'latest';
          deps.push({
            name: `${m[1]}:${m[2]}`,
            version: ver,
            resolved: ver,
            ecosystem: 'maven',
            manifestPath: relative(workspaceRoot, gradlePath).replace(/\\/g, '/')
          });
        }
        const mcMatch = content.match(/minecraft\s*\(?['"]([^'"]+)['"]\)?/i) || content.match(/minecraft_version\s*=\s*['"]([^'"]+)['"]/);
        if (mcMatch) {
          deps.push({
            name: 'net.minecraft:minecraft',
            version: mcMatch[1],
            resolved: mcMatch[1],
            ecosystem: 'maven',
            manifestPath: relative(workspaceRoot, gradlePath).replace(/\\/g, '/')
          });
        }
      } catch {}
    }

    const pomPath = join(workspaceRoot, 'pom.xml');
    if (existsSync(pomPath)) {
      try {
        const pomContent = readFileSync(pomPath, 'utf8');
        const depBlocks = pomContent.matchAll(/<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>(?:[\s\S]*?<version>([^<]+)<\/version>)?[\s\S]*?<\/dependency>/g);
        for (const d of depBlocks) {
          const ver = d[3] || 'managed';
          deps.push({
            name: `${d[1]}:${d[2]}`,
            version: ver,
            resolved: ver,
            ecosystem: 'maven',
            manifestPath: 'pom.xml'
          });
        }
      } catch {}
    }

    // Python (requirements.txt / pyproject.toml)
    const reqPath = join(workspaceRoot, 'requirements.txt');
    if (existsSync(reqPath)) {
      try {
        const lines = readFileSync(reqPath, 'utf8').split('\n');
        for (const line of lines) {
          const clean = line.trim();
          if (clean && !clean.startsWith('#')) {
            const parts = clean.split(/[==|>=|<=|~=]/);
            const ver = parts[1] ? parts[1].trim() : 'any';
            deps.push({
              name: parts[0].trim(),
              version: ver,
              resolved: ver,
              ecosystem: 'pypi',
              manifestPath: 'requirements.txt'
            });
          }
        }
      } catch {}
    }

    // Rust (Cargo.toml)
    const cargoPath = join(workspaceRoot, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      try {
        const content = readFileSync(cargoPath, 'utf8');
        const inDeps = content.split(/\[dependencies\]/i)[1];
        if (inDeps) {
          const lines = inDeps.split('\n');
          for (const line of lines) {
            if (line.startsWith('[')) break;
            const match = line.match(/^([a-zA-Z0-9_\-]+)\s*=\s*(.+)/);
            if (match) {
              const ver = match[2].trim().replace(/"/g, '');
              deps.push({
                name: match[1].trim(),
                version: ver,
                resolved: ver,
                ecosystem: 'crates',
                manifestPath: 'Cargo.toml'
              });
            }
          }
        }
      } catch {}
    }

    // Go (go.mod)
    const goModPath = join(workspaceRoot, 'go.mod');
    if (existsSync(goModPath)) {
      try {
        const lines = readFileSync(goModPath, 'utf8').split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([a-zA-Z0-9.\-\/]+)\s+v([0-9a-zA-Z.\-]+)/);
          if (match) {
            deps.push({
              name: match[1],
              version: `v${match[2]}`,
              resolved: `v${match[2]}`,
              ecosystem: 'go',
              manifestPath: 'go.mod'
            });
          }
        }
      } catch {}
    }

    return deps;
  }

  public static extractSymbols(workspaceRoot: string, files: RelevantSourceFile[]): RelevantSymbol[] {
    const symbols: RelevantSymbol[] = [];

    for (const file of files) {
      const fullPath = join(workspaceRoot, file.path);
      if (!existsSync(fullPath)) continue;

      try {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((lineText, idx) => {
          const lineNum = Math.max(1, idx + 1);
          const trimmed = lineText.trim();

          // TypeScript / JavaScript symbols
          if (file.language === 'typescript' || file.language === 'javascript') {
            const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
            if (classMatch) {
              const col = Math.max(0, lineText.indexOf(classMatch[1]));
              symbols.push({
                name: classMatch[1],
                kind: 'class',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('export')
              });
            }
            const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_]+)/);
            if (ifaceMatch) {
              const col = Math.max(0, lineText.indexOf(ifaceMatch[1]));
              symbols.push({
                name: ifaceMatch[1],
                kind: 'interface',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('export')
              });
            }
            const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=/);
            if (typeMatch) {
              const col = Math.max(0, lineText.indexOf(typeMatch[1]));
              symbols.push({
                name: typeMatch[1],
                kind: 'type',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('export')
              });
            }
            const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
            if (fnMatch) {
              const col = Math.max(0, lineText.indexOf(fnMatch[1]));
              symbols.push({
                name: fnMatch[1],
                kind: 'function',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('export')
              });
            }
          }

          // Java symbols (Minecraft mods, Forge/Fabric classes)
          if (file.language === 'java') {
            const javaClass = trimmed.match(/^(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
            if (javaClass) {
              const col = Math.max(0, lineText.indexOf(javaClass[1]));
              symbols.push({
                name: javaClass[1],
                kind: 'class',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('public')
              });
            }
            const javaIface = trimmed.match(/^(?:public\s+)?interface\s+([A-Za-z0-9_]+)/);
            if (javaIface) {
              const col = Math.max(0, lineText.indexOf(javaIface[1]));
              symbols.push({
                name: javaIface[1],
                kind: 'interface',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('public')
              });
            }
            const javaMethod = trimmed.match(/^(?:public|protected)\s+(?:static\s+)?[A-Za-z0-9_<>[\]]+\s+([A-Za-z0-9_]+)\s*\(/);
            if (javaMethod && !['if', 'for', 'while', 'switch'].includes(javaMethod[1])) {
              const col = Math.max(0, lineText.indexOf(javaMethod[1]));
              symbols.push({
                name: javaMethod[1],
                kind: 'method',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('public')
              });
            }
          }

          // Python symbols
          if (file.language === 'python') {
            const pyClass = trimmed.match(/^class\s+([A-Za-z0-9_]+)/);
            if (pyClass) {
              const col = Math.max(0, lineText.indexOf(pyClass[1]));
              symbols.push({
                name: pyClass[1],
                kind: 'class',
                location: { path: file.path, line: lineNum, column: col },
                exported: !pyClass[1].startsWith('_')
              });
            }
            const pyFn = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)/);
            if (pyFn) {
              const col = Math.max(0, lineText.indexOf(pyFn[1]));
              symbols.push({
                name: pyFn[1],
                kind: 'function',
                location: { path: file.path, line: lineNum, column: col },
                exported: !pyFn[1].startsWith('_')
              });
            }
          }

          // Rust symbols
          if (file.language === 'rust') {
            const rustStruct = trimmed.match(/^(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/);
            if (rustStruct) {
              const col = Math.max(0, lineText.indexOf(rustStruct[1]));
              symbols.push({
                name: rustStruct[1],
                kind: 'class',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('pub')
              });
            }
            const rustFn = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/);
            if (rustFn) {
              const col = Math.max(0, lineText.indexOf(rustFn[1]));
              symbols.push({
                name: rustFn[1],
                kind: 'function',
                location: { path: file.path, line: lineNum, column: col },
                exported: trimmed.startsWith('pub')
              });
            }
          }
        });
      } catch {}
    }

    return symbols;
  }

  public static extractDocumentationRefs(workspaceRoot: string): DocumentationRef[] {
    const docs: DocumentationRef[] = [];
    const knownDocs = ['README.md', 'TECHSPEC.md', 'SPEC.md', 'AGENTS.md', 'CLAUDE.md'];
    for (const d of knownDocs) {
      const p = join(workspaceRoot, d);
      if (existsSync(p)) {
        docs.push({ identifier: d, title: d, retrievedAt: new Date().toISOString() });
      }
    }

    const knowledgeDir = join(workspaceRoot, '.hitm', 'knowledge');
    if (existsSync(knowledgeDir)) {
      try {
        for (const file of readdirSync(knowledgeDir)) {
          const full = join(knowledgeDir, file);
          if (statSync(full).isFile()) {
            docs.push({
              identifier: `.hitm/knowledge/${file}`,
              title: `External API Knowledge: ${file}`,
              retrievedAt: new Date().toISOString(),
              checksum: createHash('sha256').update(readFileSync(full)).digest('hex')
            });
          }
        }
      } catch {}
    }

    return docs;
  }
}
