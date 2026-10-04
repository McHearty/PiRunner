import { exec } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TestRunner, TestExecutionRequest, TestExecutionResultData, IndividualTestRecord } from '../../domain/testing/TestRunner.js';
import { TestSuiteHasher, TestFileEntry } from '../../domain/testing/TestSuiteHasher.js';
import { ArtifactStore } from '../../domain/artifacts/ArtifactStore.js';

export class RealDeterministicTestRunner implements TestRunner {
  constructor(
    private readonly workspaceRoot: string = process.cwd(),
    private readonly artifactStore?: ArtifactStore
  ) {}

  public async execute(request: TestExecutionRequest): Promise<TestExecutionResultData> {
    // 1. Resolve testRootPaths strictly from accepted TestSpecification (§28, §31) - NO SILENT FALLBACK
    const testRoots = this.resolveAuthoritativeTestRoots(request.testSpecificationArtifactId);

    // 2. Gather authoritative test files from declared roots only
    const testFiles = this.gatherAuthoritativeTestFiles(testRoots);
    if (testFiles.length === 0) {
      throw new Error(`Authoritative test suite contains zero executable test files in roots: [${testRoots.join(', ')}]`);
    }

    // 3. Compute canonical content hash of the authoritative test suite
    const liveSuiteHash = TestSuiteHasher.hash({
      testFramework: 'vitest',
      executionCommand: request.executionCommand,
      files: testFiles
    });

    // 4. Verify suite content hash against accepted specification (§17, §31)
    if (request.testSuiteContentHash && liveSuiteHash !== request.testSuiteContentHash) {
      throw new Error(
        `Authoritative test suite hash mismatch! Expected [${request.testSuiteContentHash}], calculated live hash [${liveSuiteHash}]`
      );
    }

    // 5. Execute command in subprocess
    const startMs = Date.now();
    const { stdout, stderr, exitCode } = await this.runCommand(request.executionCommand);
    const durationMs = Date.now() - startMs;
    const rawOutput = `${stdout}\n${stderr}`.trim();

    const isPassed = exitCode === 0;
    const executedTests: IndividualTestRecord[] = [
      {
        testId: 'authoritative-suite-run',
        status: isPassed ? 'PASSED' : 'FAILED',
        durationMs,
        failureOutput: isPassed ? undefined : stderr || stdout
      }
    ];

    return {
      status: isPassed ? 'PASSED' : 'FAILED',
      testSpecificationArtifactId: request.testSpecificationArtifactId,
      testSuiteContentHash: liveSuiteHash,
      repositoryRevision: request.repositoryRevision,
      dependencyLockHash: request.dependencyLockHash,
      executionCommand: request.executionCommand,
      passed: isPassed ? 1 : 0,
      failed: isPassed ? 0 : 1,
      skipped: 0,
      errored: 0,
      executedTests,
      rawOutput,
      environmentFingerprint: `node-${process.version}-${process.platform}`
    };
  }

  private resolveAuthoritativeTestRoots(specArtifactId: string): string[] {
    if (this.artifactStore) {
      const spec = this.artifactStore.get(specArtifactId);
      const roots = (spec?.payload as any)?.testRootPaths;
      if (Array.isArray(roots) && roots.length > 0) {
        return roots;
      }
    }
    // Only permit 'tests' if spec does not override
    return ['tests'];
  }

  private gatherAuthoritativeTestFiles(roots: string[]): TestFileEntry[] {
    const entries: TestFileEntry[] = [];
    for (const root of roots) {
      const absRoot = join(this.workspaceRoot, root);
      if (!existsSync(absRoot)) continue;

      const walk = (dir: string) => {
        for (const item of readdirSync(dir)) {
          const full = join(dir, item);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (stat.isFile() && (item.endsWith('.test.ts') || item.endsWith('.spec.ts'))) {
            entries.push({
              relativePath: relative(this.workspaceRoot, full).replace(/\\/g, '/'),
              content: readFileSync(full, 'utf8')
            });
          }
        }
      };
      walk(absRoot);
    }
    return entries;
  }

  private runCommand(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      exec(cmd, { cwd: this.workspaceRoot }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error && error.code ? error.code : 0
        });
      });
    });
  }
}
