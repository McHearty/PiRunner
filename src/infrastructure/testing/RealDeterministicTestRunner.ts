import { exec } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TestRunner, TestExecutionRequest, TestExecutionResultData, IndividualTestRecord } from '../../domain/testing/TestRunner.js';
import { TestSuiteHasher, TestFileEntry } from '../../domain/testing/TestSuiteHasher.js';

export class RealDeterministicTestRunner implements TestRunner {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  public async execute(request: TestExecutionRequest): Promise<TestExecutionResultData> {
    // 1. Gather all test files in workspace
    const testFiles = this.gatherTestFiles();

    // 2. Compute canonical content hash of the active test suite
    const liveSuiteHash = TestSuiteHasher.hash({
      testFramework: 'vitest',
      executionCommand: request.executionCommand,
      files: testFiles
    });

    // 3. Verify suite content hash against accepted specification (§17)
    if (request.testSuiteContentHash && liveSuiteHash !== request.testSuiteContentHash) {
      throw new Error(
        `Authoritative test suite hash mismatch! Expected ${request.testSuiteContentHash}, calculated live hash: ${liveSuiteHash}`
      );
    }

    // 4. Execute deterministic command in workspace subprocess
    const startMs = Date.now();
    const { stdout, stderr, exitCode } = await this.runCommand(request.executionCommand);
    const durationMs = Date.now() - startMs;
    const rawOutput = `${stdout}\n${stderr}`.trim();

    // 5. Parse test execution results deterministically
    const isPassed = exitCode === 0;
    const executedTests: IndividualTestRecord[] = [
      {
        testId: 'suite-execution',
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

  private gatherTestFiles(): TestFileEntry[] {
    const testsDir = join(this.workspaceRoot, 'tests');
    if (!existsSync(testsDir)) return [];

    const entries: TestFileEntry[] = [];
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
    walk(testsDir);
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
