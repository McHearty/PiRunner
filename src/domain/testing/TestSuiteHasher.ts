import { createHash } from 'node:crypto';

export interface TestFileEntry {
  relativePath: string;
  content: string;
}

export interface CanonicalTestBundle {
  files: TestFileEntry[];
  testFramework: string;
  executionCommand: string;
}

export class TestSuiteHasher {
  public static hash(bundle: CanonicalTestBundle): string {
    const hasher = createHash('sha256');

    // 1. Sort files deterministically by relative path
    const sortedFiles = [...bundle.files].sort((a, b) => 
      a.relativePath.localeCompare(b.relativePath)
    );

    // 2. Canonicalize metadata header
    hasher.update(`FRAMEWORK:${bundle.testFramework.trim()}\n`);
    hasher.update(`COMMAND:${bundle.executionCommand.trim()}\n`);

    // 3. Canonicalize each file with path ordering, newline normalization (LF), and boundary encoding
    for (const file of sortedFiles) {
      const normalizedPath = file.relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      const normalizedContent = file.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      hasher.update(`FILE_START:${normalizedPath}\n`);
      hasher.update(normalizedContent);
      hasher.update(`\nFILE_END:${normalizedPath}\n`);
    }

    return hasher.digest('hex');
  }
}
