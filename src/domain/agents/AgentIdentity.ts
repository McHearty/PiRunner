import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type CanonicalRole =
  | 'CONCEPT'
  | 'SPECIFICATION'
  | 'PLANNING'
  | 'KNOWLEDGE'
  | 'TEST_AUTHORING'
  | 'IMPLEMENTATION'
  | 'TRIAGE'
  | 'REVIEW'
  | 'DEVLOG'
  | 'SKILL_ARCHITECT'
  | 'PUBLICATION';

export interface AgentRosterEntry {
  canonicalRole: CanonicalRole;
  id: string; // Randomized 4-digit ID (1000-9999)
  name: string; // Positive Emotion + Technological Descriptor
  emotion: string;
  descriptor: string;
  roleDescription: string;
}

const DEFAULT_POOLS: Record<CanonicalRole, { emotions: string[]; descriptors: string[]; defaultName: string; defaultRole: string }> = {
  CONCEPT: {
    emotions: ['Resolute', 'Luminous', 'Vibrant', 'Serene', 'Bold'],
    descriptors: ['Aether', 'Genesis', 'Vision', 'Nexus'],
    defaultName: 'Resolute Aether',
    defaultRole: 'Concept Development Specialist'
  },
  SPECIFICATION: {
    emotions: ['Serene', 'Lucid', 'Steadfast', 'Harmonious'],
    descriptors: ['Codex', 'Schema', 'Architect', 'Prism'],
    defaultName: 'Serene Codex',
    defaultRole: 'Master Specification Specialist'
  },
  PLANNING: {
    emotions: ['Curious', 'Keen', 'Ingenious', 'Agile'],
    descriptors: ['Automaton', 'Compass', 'Scheduler', 'Matrix'],
    defaultName: 'Curious Automaton',
    defaultRole: 'Planning & Sprint Decomposition Specialist'
  },
  KNOWLEDGE: {
    emotions: ['Joyful', 'Radiant', 'Insightful', 'Vigilant'],
    descriptors: ['Graph', 'Lexicon', 'Indexer', 'Synapse'],
    defaultName: 'Joyful Graph',
    defaultRole: 'Knowledge Provider Specialist'
  },
  TEST_AUTHORING: {
    emotions: ['Methodical', 'Tenacious', 'Exact', 'Rigorous'],
    descriptors: ['Scribe', 'Probe', 'Verifier', 'Assertion'],
    defaultName: 'Methodical Scribe',
    defaultRole: 'Authoritative Test Authoring Specialist'
  },
  IMPLEMENTATION: {
    emotions: ['Confident', 'Unyielding', 'Bold', 'Creative'],
    descriptors: ['Forge', 'Engine', 'Compiler', 'Foundry'],
    defaultName: 'Confident Forge',
    defaultRole: 'Primary Implementation Specialist'
  },
  TRIAGE: {
    emotions: ['Patient', 'Steadfast', 'Calm', 'Attentive'],
    descriptors: ['Oracle', 'Sensor', 'Diagnostic', 'Tracer'],
    defaultName: 'Patient Oracle',
    defaultRole: 'Dedicated Triage & Diagnosis Specialist'
  },
  REVIEW: {
    emotions: ['Satisfied', 'Discerning', 'Judicious', 'Impartial'],
    descriptors: ['Sentinel', 'Prism', 'Auditor', 'Beacon'],
    defaultName: 'Satisfied Sentinel',
    defaultRole: 'Primary Review Specialist'
  },
  DEVLOG: {
    emotions: ['Reflective', 'Mindful', 'Chronicling', 'Candid'],
    descriptors: ['Ledger', 'Historian', 'Record', 'Chronicle'],
    defaultName: 'Reflective Ledger',
    defaultRole: 'Daily Development Record Specialist'
  },
  SKILL_ARCHITECT: {
    emotions: ['Inventive', 'Adaptive', 'Insightful', 'Constructive'],
    descriptors: ['Weaver', 'Synthesizer', 'Pattern', 'Curator'],
    defaultName: 'Inventive Weaver',
    defaultRole: 'Skill Synthesis & Anti-Proliferation Specialist'
  },
  PUBLICATION: {
    emotions: ['Inspired', 'Exuberant', 'Dynamic', 'Luminous'],
    descriptors: ['Signal', 'Beacon', 'Dispatcher', 'Herald'],
    defaultName: 'Inspired Signal',
    defaultRole: 'Publication Preparation Specialist'
  }
};

export class AgentRosterService {
  public static getRosterPath(workspaceRoot: string = process.cwd()): string {
    return join(workspaceRoot, '.hitm', 'agent-roster.json');
  }

  public static getOrGenerateRoster(workspaceRoot: string = process.cwd()): Record<CanonicalRole, AgentRosterEntry> {
    const rosterPath = this.getRosterPath(workspaceRoot);

    if (existsSync(rosterPath)) {
      try {
        return JSON.parse(readFileSync(rosterPath, 'utf8'));
      } catch {}
    }

    const roster = this.generateProjectRoster();
    const hitmDir = join(workspaceRoot, '.hitm');
    if (!existsSync(hitmDir)) {
      mkdirSync(hitmDir, { recursive: true });
    }
    writeFileSync(rosterPath, JSON.stringify(roster, null, 2), 'utf8');
    return roster;
  }

  public static generateProjectRoster(): Record<CanonicalRole, AgentRosterEntry> {
    const roles: CanonicalRole[] = [
      'CONCEPT',
      'SPECIFICATION',
      'PLANNING',
      'KNOWLEDGE',
      'TEST_AUTHORING',
      'IMPLEMENTATION',
      'TRIAGE',
      'REVIEW',
      'DEVLOG',
      'SKILL_ARCHITECT',
      'PUBLICATION'
    ];

    const usedIds = new Set<string>();
    const roster: Partial<Record<CanonicalRole, AgentRosterEntry>> = {};

    for (const role of roles) {
      let id = '';
      while (!id || usedIds.has(id)) {
        id = Math.floor(1000 + Math.random() * 9000).toString();
      }
      usedIds.add(id);

      const pool = DEFAULT_POOLS[role];
      const emotion = pool.emotions[Math.floor(Math.random() * pool.emotions.length)];
      const descriptor = pool.descriptors[Math.floor(Math.random() * pool.descriptors.length)];
      const name = `${emotion} ${descriptor}`;

      roster[role] = {
        canonicalRole: role,
        id,
        name,
        emotion,
        descriptor,
        roleDescription: pool.defaultRole
      };
    }

    return roster as Record<CanonicalRole, AgentRosterEntry>;
  }

  public static formatBadge(entry: AgentRosterEntry): string {
    return `[${entry.id} ${entry.name}]`;
  }
}

export interface CustomPoolPromptTemplate {
  theme: string;
  instructions: string;
}

export function buildRosterGenerationPrompt(theme = 'engineering excellence'): string {
  return `Generate a JSON object containing 11 pairs of (Positive Emotion, Technological Descriptor) matching theme "${theme}" for these roles:
CONCEPT, SPECIFICATION, PLANNING, KNOWLEDGE, TEST_AUTHORING, IMPLEMENTATION, TRIAGE, REVIEW, DEVLOG, SKILL_ARCHITECT, PUBLICATION.
Format: { "ROLES": { "CONCEPT": { "emotion": "...", "descriptor": "..." }, ... } }`;
}
