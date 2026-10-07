#!/usr/bin/env node
/**
 * Transition Completeness Inventory Generator
 *
 * Enumerates every transition in the registry and categorizes by:
 * - trigger category (automatic, agent-completion, human-decision, override)
 * - UI exposure (explicit HITM UI, artifact-triggered, control-auto, generic-command-only)
 *
 * Outputs machine-readable JSON + human-readable summary.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const TRANSITION_FILE = join(ROOT, 'src', 'domain', 'workflow', 'WorkflowTransition.ts');
const EXTENSION_FILE = join(ROOT, 'src', 'extension.ts');

const transitionSource = readFileSync(TRANSITION_FILE, 'utf-8');
const extSource = readFileSync(EXTENSION_FILE, 'utf-8');

// Split into lines and parse transitions
const lines = transitionSource.split('\n');

interface Transition {
  id: string;
  from: string;
  to: string;
  guards: string[];
  humanApproval: string;
}

const transitions: Transition[] = [];

for (const line of lines) {
  if (!line.includes("id: 'T-")) continue;

  const t: Transition = {
    id: '',
    from: '',
    to: '',
    guards: [],
    humanApproval: 'NEVER'
  };

  // Extract ID
  const idMatch = line.match(/id:\s*'([A-Z0-9-]+)'/);
  if (idMatch) t.id = idMatch[1];

  // Extract from
  const fromMatch = line.match(/from:\s*'([^']+)'/);
  if (fromMatch) t.from = fromMatch[1];

  // Extract to
  const toMatch = line.match(/to:\s*'([^']+)'/);
  if (toMatch) t.to = toMatch[1];

  // Extract guards
  const guardsMatch = line.match(/guards:\s*\[(.*?)\]/);
  if (guardsMatch) {
    const guardPattern = /g\('([A-Z0-9-]+)'\)/g;
    let gm;
    while ((gm = guardPattern.exec(guardsMatch[1])) !== null) {
      t.guards.push(gm[1]);
    }
  }

  // Extract humanApproval
  const approvalMatch = line.match(/humanApproval:\s*'([^']+)'/);
  if (approvalMatch) t.humanApproval = approvalMatch[1];

  if (t.id && t.from && t.to) {
    transitions.push(t);
  }
}

console.log(`Parsed ${transitions.length} transitions from registry`);

// Parse artifact-triggered mappings from extension.ts
const artifactPattern = /if \(state === '(\w+)' && artifactType === '(\w+)'\) return '(\w+)';/g;
const artifactMappings = new Map<string, string>();
let m;
while ((m = artifactPattern.exec(extSource)) !== null) {
  artifactMappings.set(`${m[1]}:${m[2]}`, m[3]);
}
console.log(`Parsed ${artifactMappings.size} artifact-triggered mappings`);

// Parse control-state auto-advance mappings
const controlPattern = /case '(\w+)':\s*return '(\w+)';/g;
const controlMappings = new Map<string, string>();
while ((m = controlPattern.exec(extSource)) !== null) {
  controlMappings.set(m[1], m[2]);
}
console.log(`Parsed ${controlMappings.size} control-state auto-advance mappings`);

// Artifact type inference from target state
const ARTIFACT_TYPE_BY_TARGET: Record<string, string> = {
  'CONCEPT_REVIEW': 'ConceptPackage',
  'SPECIFICATION_REVIEW': 'MasterSpecification',
  'PLANNING': 'KnowledgeSnapshot',
  'SPRINT_READY': 'SprintSpecification',
  'TEST_READY': 'TestSpecification',
  'COMMIT_CREATED': 'ImplementationResult',
  'SKILL_SYNTHESIS': 'SkillPackage'
};

// Check for explicit HITM UI
function hasExplicitHitmUi(from: string): boolean {
  // Escape regex special characters
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:state|currentState|target) === ['"]${escaped}['"].*[\\s\\S]*choose`, 'i'),
    new RegExp(`(?:state|currentState|target) === ['"]${escaped}['"].*[\\s\\S]*confirm`, 'i'),
    new RegExp(`(?:state|currentState|target) === ['"]${escaped}['"].*[\\s\\S]*select`, 'i'),
    new RegExp(`(?:state|currentState|target) === ['"]${escaped}['"].*[\\s\\S]*prompt`, 'i'),
    new RegExp(`getTargetTransitionForArtifact\\([^)]*${escaped}`, 'i')
  ];
  return patterns.some(p => p.test(extSource));
}

// Categorize
interface InventoryEntry {
  id: string;
  from: string;
  to: string;
  humanApproval: string;
  guards: string[];
  triggerCategory: string;
  uiExposure: string[];
  issues: string[];
}

const inventory: InventoryEntry[] = [];

for (const t of transitions) {
  const entry: InventoryEntry = {
    id: t.id,
    from: t.from,
    to: t.to,
    humanApproval: t.humanApproval,
    guards: t.guards,
    triggerCategory: '',
    uiExposure: [],
    issues: []
  };

  if (entry.humanApproval === 'ALWAYS') {
    entry.triggerCategory = 'HUMAN_DECISION_GATE';
  } else if (entry.guards.length > 0) {
    const targetArtifact = ARTIFACT_TYPE_BY_TARGET[entry.to];
    const artifactKey = `${entry.from}:${targetArtifact}`;
    if (targetArtifact && artifactMappings.has(artifactKey)) {
      entry.triggerCategory = 'AGENT_COMPLETION_GATE';
    } else {
      entry.triggerCategory = 'AUTOMATIC';
    }
  } else {
    entry.triggerCategory = 'AUTOMATIC';
  }

  // Check UI exposure
  const targetArtifact = ARTIFACT_TYPE_BY_TARGET[entry.to];
  const artifactKey = `${entry.from}:${targetArtifact}`;
  if (targetArtifact && artifactMappings.has(artifactKey)) {
    entry.uiExposure.push('ARTIFACT_TRIGGERED');
  }
  if (controlMappings.has(entry.from)) {
    entry.uiExposure.push('CONTROL_AUTO');
  }
  if (entry.humanApproval === 'ALWAYS') {
    if (hasExplicitHitmUi(entry.from)) {
      entry.uiExposure.push('EXPLICIT_HITM_UI');
    } else {
      entry.uiExposure.push('GENERIC_COMMAND_ONLY');
    }
  }

  // Identify issues
  if (entry.humanApproval === 'ALWAYS' && !entry.uiExposure.includes('EXPLICIT_HITM_UI')) {
    entry.issues.push('Latent gate: humanApproval:ALWAYS but no explicit HITM UI path');
  }
  if (entry.triggerCategory === 'AUTOMATIC' && entry.uiExposure.length === 0) {
    entry.issues.push('Automatic transition with no trigger path defined');
  }
  if (entry.from === 'KNOWLEDGE_SYNC' && entry.to === 'SPRINT_READY') {
    entry.issues.push('POTENTIAL BYPASS: Knowledge sync directly to sprint-ready skips planning intent');
  }

  inventory.push(entry);
}

// Summary
const summary = {
  totalTransitions: inventory.length,
  automatic: inventory.filter(i => i.triggerCategory === 'AUTOMATIC').length,
  agentCompletion: inventory.filter(i => i.triggerCategory === 'AGENT_COMPLETION_GATE').length,
  humanDecision: inventory.filter(i => i.triggerCategory === 'HUMAN_DECISION_GATE').length,
  explicitHitmUi: inventory.filter(i => i.uiExposure.includes('EXPLICIT_HITM_UI')).length,
  genericCommandOnly: inventory.filter(i => i.uiExposure.includes('GENERIC_COMMAND_ONLY')).length,
  withIssues: inventory.filter(i => i.issues.length > 0).length
};

const output = {
  generated: new Date().toISOString(),
  summary,
  transitions: inventory
};

const jsonPath = join(ROOT, 'artifacts', 'transition-inventory.json');
writeFileSync(jsonPath, JSON.stringify(output, null, 2));
console.log(`\nInventory written to: ${jsonPath}`);

console.log('\n=== Transition Completeness Inventory ===\n');
console.log(`Total transitions: ${summary.totalTransitions}`);
console.log(`Automatic: ${summary.automatic}`);
console.log(`Agent-completion gates: ${summary.agentCompletion}`);
console.log(`Human-decision gates: ${summary.humanDecision}`);
console.log(`With explicit HITM UI: ${summary.explicitHitmUi}`);
console.log(`Generic-command-only: ${summary.genericCommandOnly}`);
console.log(`Transitions with issues: ${summary.withIssues}`);

console.log('\n=== Issues Found ===\n');
for (const t of inventory) {
  if (t.issues.length > 0) {
    console.log(`${t.id} (${t.from} → ${t.to})`);
    for (const issue of t.issues) {
      console.log(`  ⚠ ${issue}`);
    }
    console.log('');
  }
}

console.log('=== Transitions with humanApproval:ALWAYS but no explicit HITM UI ===\n');
for (const t of inventory) {
  if (t.humanApproval === 'ALWAYS' && t.uiExposure.includes('GENERIC_COMMAND_ONLY')) {
    console.log(`${t.id}: ${t.from} → ${t.to}`);
  }
}
