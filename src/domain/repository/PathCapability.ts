import { CanonicalRole, AgentRosterService } from '../agents/AgentIdentity.js';

export interface AgentPathPolicy {
  canonicalRole: CanonicalRole;
  readable: string[];
  writable: string[];
}

export class PathCapabilityEnforcer {
  private static readonly ROLE_POLICIES: Record<CanonicalRole, AgentPathPolicy> = {
    CONCEPT: { canonicalRole: 'CONCEPT', readable: ['**/*'], writable: [] },
    SPECIFICATION: { canonicalRole: 'SPECIFICATION', readable: ['**/*'], writable: [] },
    PLANNING: { canonicalRole: 'PLANNING', readable: ['**/*'], writable: [] },
    KNOWLEDGE: { canonicalRole: 'KNOWLEDGE', readable: ['**/*'], writable: [] },
    TEST_AUTHORING: { canonicalRole: 'TEST_AUTHORING', readable: ['**/*'], writable: ['test/**', 'tests/**', 'fixtures/**', 'test-config/**'] },
    IMPLEMENTATION: { canonicalRole: 'IMPLEMENTATION', readable: ['**/*'], writable: ['src/**', 'production-config/**'] },
    TRIAGE: { canonicalRole: 'TRIAGE', readable: ['**/*'], writable: [] },
    REVIEW: { canonicalRole: 'REVIEW', readable: ['**/*'], writable: [] },
    DEVLOG: { canonicalRole: 'DEVLOG', readable: ['**/*'], writable: [] },
    SKILL_ARCHITECT: { canonicalRole: 'SKILL_ARCHITECT', readable: ['**/*'], writable: ['skills/**', '.pi/skills/**'] },
    PUBLICATION: { canonicalRole: 'PUBLICATION', readable: ['**/*'], writable: [] }
  };

  private static legacyIdToRole(agentId: string): CanonicalRole {
    const legacyMap: Record<string, CanonicalRole> = {
      '0012': 'CONCEPT',
      '0024': 'SPECIFICATION',
      '0036': 'PLANNING',
      '0048': 'KNOWLEDGE',
      '0060': 'IMPLEMENTATION',
      '0072': 'TRIAGE',
      '0084': 'REVIEW',
      '0096': 'DEVLOG',
      '0108': 'PUBLICATION',
      '0120': 'TEST_AUTHORING',
      '0132': 'SKILL_ARCHITECT'
    };
    if (legacyMap[agentId]) return legacyMap[agentId];

    try {
      const roster = AgentRosterService.getOrGenerateRoster();
      for (const entry of Object.values(roster)) {
        if (entry.id === agentId) return entry.canonicalRole;
      }
    } catch {}

    return 'CONCEPT';
  }

  public static getPolicy(agentIdOrRole: string): AgentPathPolicy {
    const role: CanonicalRole = (this.ROLE_POLICIES as any)[agentIdOrRole]
      ? (agentIdOrRole as CanonicalRole)
      : this.legacyIdToRole(agentIdOrRole);

    return this.ROLE_POLICIES[role] || { canonicalRole: role, readable: ['**/*'], writable: [] };
  }

  public static validatePolicyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const testAuthor = this.ROLE_POLICIES['TEST_AUTHORING'];
    const impl = this.ROLE_POLICIES['IMPLEMENTATION'];
    const triage = this.ROLE_POLICIES['TRIAGE'];
    const review = this.ROLE_POLICIES['REVIEW'];

    if (!testAuthor || testAuthor.writable.some(w => w.startsWith('src/'))) {
      errors.push('TEST_AUTHORING capability policy permits unauthorized production write paths');
    }
    if (!impl || impl.writable.some(w => w.startsWith('test/') || w.startsWith('tests/'))) {
      errors.push('IMPLEMENTATION capability policy permits unauthorized test write paths');
    }
    if (!triage || triage.writable.length > 0) {
      errors.push('TRIAGE capability policy violates read-only invariant');
    }
    if (!review || review.writable.length > 0) {
      errors.push('REVIEW capability policy violates read-only invariant');
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

  public static isWriteAllowed(agentIdOrRole: string, filePath: string): boolean {
    const policy = this.getPolicy(agentIdOrRole);
    return policy.writable.some(pattern => this.pathMatches(pattern, filePath));
  }

  public static validateMutations(agentIdOrRole: string, changedFiles: string[]): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];
    for (const file of changedFiles) {
      if (!this.isWriteAllowed(agentIdOrRole, file)) {
        violations.push(file);
      }
    }
    return {
      allowed: violations.length === 0,
      violations
    };
  }
}
