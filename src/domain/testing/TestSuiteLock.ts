import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TestSuiteHasher, TestFileEntry } from './TestSuiteHasher.js';

export interface TestSuiteLockData {
  workflowId: string;
  testSpecificationArtifactId: string;
  testSuiteContentHash: string;
  lockedAt: string;
  fileCount: number;
}

export class TestSuiteLock {
  public static getLockPath(storageDir: string = join(process.cwd(), '.hitm')): string {
    return join(storageDir, 'test-suite.lock.json');
  }

  public static createLock(
    data: TestSuiteLockData,
    storageDir: string = join(process.cwd(), '.hitm')
  ): void {
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    const lockPath = this.getLockPath(storageDir);
    writeFileSync(lockPath, JSON.stringify(data, null, 2), 'utf8');
  }

  public static loadLock(storageDir: string = join(process.cwd(), '.hitm')): TestSuiteLockData | undefined {
    const lockPath = this.getLockPath(storageDir);
    if (!existsSync(lockPath)) return undefined;
    try {
      return JSON.parse(readFileSync(lockPath, 'utf8')) as TestSuiteLockData;
    } catch {
      return undefined;
    }
  }

  public static verifyLiveSuite(
    testFiles: TestFileEntry[],
    executionCommand: string = 'npm test',
    storageDir: string = join(process.cwd(), '.hitm')
  ): { valid: boolean; expectedHash?: string; liveHash: string } {
    const lock = this.loadLock(storageDir);
    const liveHash = TestSuiteHasher.hash({
      testFramework: 'vitest',
      executionCommand,
      files: testFiles
    });

    if (!lock) {
      return { valid: false, liveHash };
    }

    return {
      valid: lock.testSuiteContentHash === liveHash,
      expectedHash: lock.testSuiteContentHash,
      liveHash
    };
  }
}
