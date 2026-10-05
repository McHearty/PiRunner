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
    testFramework: string,
    executionCommand: string,
    storageDir: string = join(process.cwd(), '.hitm')
  ): { valid: boolean; expectedHash?: string; liveHash: string } {
    const lock = this.loadLock(storageDir);
    const liveHash = TestSuiteHasher.hash({
      testFramework,
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

  /**
   * Verify that the TestSuiteLock matches the accepted TestSpecification.
   * The lock must reference the exact artifact and have the identical hash.
   */
  public static verifyLockMatchesSpec(
    lock: TestSuiteLockData,
    testSpecificationArtifactId: string,
    testSuiteContentHash: string
  ): { valid: boolean; reason: string } {
    if (lock.testSpecificationArtifactId !== testSpecificationArtifactId) {
      return {
        valid: false,
        reason: `TestSuiteLock references artifact ${lock.testSpecificationArtifactId} but accepted TestSpecification is ${testSpecificationArtifactId}`
      };
    }

    if (lock.testSuiteContentHash !== testSuiteContentHash) {
      return {
        valid: false,
        reason: `TestSuiteLock hash (${lock.testSuiteContentHash}) does not match accepted TestSpecification hash (${testSuiteContentHash})`
      };
    }

    return { valid: true, reason: 'Lock matches accepted TestSpecification' };
  }
}
