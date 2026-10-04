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
    // 0072 Patient Oracle (Triage) - Strictly Read-Only
    '0072': {
      agentId: '0072',
      readable: ['**/*'],
      writable: []
    },
    // 0084 Satisfied Sentinel (Review) - Strictly Read-Only
    '0084': {
      agentId: '0084',
      readable: ['**/*'],
      writable: []
    }
  };

  public static getPolicy(agentId: string): AgentPathPolicy | undefined {
    return this.POLICIES[agentId];
  }

  public static validatePolicyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const p0120 = this.POLICIES['0120'];
    const p0060 = this.POLICIES['0060'];
    const p0072 = this.POLICIES['0072'];
    const p0084 = this.POLICIES['0084'];

    if (!p0120 || p0120.writable.some(w => w.startsWith('src/'))) {
      errors.push('Agent 0120 capability policy permits unauthorized production write paths');
    }
    if (!p0060 || p0060.writable.some(w => w.startsWith('test/') || w.startsWith('tests/'))) {
      errors.push('Agent 0060 capability policy permits unauthorized test write paths');
    }
    if (!p0072 || p0072.writable.length > 0) {
      errors.push('Agent 0072 capability policy violates read-only invariant');
    }
    if (!p0084 || p0084.writable.length > 0) {
      errors.push('Agent 0084 capability policy violates read-only invariant');
    }

    return { valid: errors.length === 0, errors };
  }

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
