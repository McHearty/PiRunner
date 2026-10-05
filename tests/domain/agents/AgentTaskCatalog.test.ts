import { describe, it, expect } from 'vitest';
import { AGENT_TASK_CATALOG } from '../../../src/domain/agents/AgentTaskCatalog.js';

describe('AgentTaskCatalog (UX Task Menus)', () => {
  it('defines structured task lists for all 11 canonical roles', () => {
    const roles = [
      'CONCEPT', 'SPECIFICATION', 'PLANNING', 'KNOWLEDGE',
      'TEST_AUTHORING', 'IMPLEMENTATION', 'TRIAGE', 'REVIEW',
      'DEVLOG', 'SKILL_ARCHITECT', 'PUBLICATION'
    ] as const;

    for (const role of roles) {
      const tasks = AGENT_TASK_CATALOG[role];
      expect(Array.isArray(tasks), `Tasks for ${role} must be an array`).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
    }
  });
});
