export interface AgentPathPolicy {
  agentId: string;
  readable: string[];
  writable: string[];
}

export class PathCapabilityEnforcer {
  private static readonly POLICIES: Record<string, AgentPathPolicy> = {
    // 0120 Methodical Scribe (Test Author)
    '0120': {
      agentId: '0120',
      readable: ['**/*'],
      writable: ['test/**', 'tests/**', 'fixtures/**', 'test-config/**']
    },
    // 0060 Confident Forge (Implementation)
    '0060': {
      agentId: '0060',
      readable: ['**/*'],
      writable: ['src/**', 'production-config/**']
    },
    // 0072 Patient Oracle (Triage) - Read only
    '0072': {
      agentId: '0072',
      readable: ['**/*'],
      writable: []
    },
    // 0084 Satisfied Sentinel (Review) - Read only
    '0084': {
      agentId: '0084',
      readable: ['**/*'],
      writable: []
    }
  };

  private static pathMatches(pattern: string, filePath: string): boolean {
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (pattern === '**/*') return true;

    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return cleanPath.startsWith(prefix + '/') || cleanPath === prefix;
    }
    return cleanPath === pattern;
  }

  public static isWriteAllowed(agentId: string, filePath: string): boolean {
    const policy = this.POLICIES[agentId];
    if (!policy) return false;

    return policy.writable.some(pattern => this.pathMatches(pattern, filePath));
  }

  public static validateMutations(agentId: string, changedFiles: string[]): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];
    for (const file of changedFiles) {
      if (!this.isWriteAllowed(agentId, file)) {
        violations.push(file);
      }
    }
    return {
      allowed: violations.length === 0,
      violations
    };
  }
}
