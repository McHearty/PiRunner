import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface WorkflowIdentity {
  workflowId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABORTED';
  createdAt: string;
}

export class WorkflowIdentityService {
  private static readonly WORKFLOW_FILE = 'workflow.json';

  public static load(storageDir: string = join(process.cwd(), '.hitm')): WorkflowIdentity | null {
    const filePath = join(storageDir, this.WORKFLOW_FILE);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  public static save(identity: WorkflowIdentity, storageDir: string = join(process.cwd(), '.hitm')): void {
    const filePath = join(storageDir, this.WORKFLOW_FILE);
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(identity, null, 2), 'utf8');
  }

  public static generateNewId(prefix = 'pirunner'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}
