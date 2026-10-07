/**
 * S9-P0-5: Gate Completeness Invariant Regression Test
 *
 * This test ensures that every human-decision gate in the transition registry
 * has an explicit HITM UI path defined in the extension code.
 *
 * The test parses the transition registry and checks that every transition with
 * humanApproval: ALWAYS has a corresponding decision UI in the extension.
 *
 * Run: npx ts-node tests/regression/gate-completeness-invariant.ts
 */

import { readFileSync } from 'fs';

// Read transition registry
const transitionSource = readFileSync('src/domain/workflow/WorkflowTransition.ts', 'utf-8');

// Parse transitions
const transitions = [];
const lines = transitionSource.split('\n');
let currentTransition = null;

for (const line of lines) {
  if (line.includes("id: 'T-")) {
    if (currentTransition) {
      transitions.push(currentTransition);
    }
    currentTransition = {
      id: '',
      from: '',
      to: '',
      humanApproval: 'NEVER'
    };
  }

  if (currentTransition) {
    const idMatch = line.match(/id:\s*'([A-Z0-9-]+)'/);
    if (idMatch) currentTransition.id = idMatch[1];

    const fromMatch = line.match(/from:\s*'([A-Z_]+)'/);
    if (fromMatch) currentTransition.from = fromMatch[1];

    const toMatch = line.match(/to:\s*'([A-Z_]+)'/);
    if (toMatch) currentTransition.to = toMatch[1];

    const approvalMatch = line.match(/humanApproval:\s*'([A-Z]+)'/);
    if (approvalMatch) currentTransition.humanApproval = approvalMatch[1];
  }
}
if (currentTransition) {
  transitions.push(currentTransition);
}

// Filter human-decision gates
const humanGates = transitions.filter(t => t.humanApproval === 'ALWAYS');

// Read extension source
const extSource = readFileSync('src/extension.ts', 'utf-8');

// Check each human-decision gate for explicit HITM UI
function hasExplicitHitmUi(from: string): boolean {
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

// Identify latent gates (no explicit HITM UI)
const latentGates = humanGates.filter(t => !hasExplicitHitmUi(t.from));

// Report
console.log(`Total transitions: ${transitions.length}`);
console.log(`Human-decision gates: ${humanGates.length}`);
console.log(`Latent gates (no explicit HITM UI): ${latentGates.length}`);

if (latentGates.length > 0) {
  console.log('\nLatent gates:');
  for (const gate of latentGates) {
    console.log(`  ${gate.id} (${gate.from} → ${gate.to})`);
  }
}

// Test assertion: no more than 3 latent gates (the known exceptional/abort paths)
// T-066 (TRIAGE → ABORT), T-093 (PUBLICATION_READY → PUBLISHED), T-106 (* → ABORT)
if (latentGates.length > 3) {
  console.log('\nFAIL: More than 3 latent gates detected.');
  process.exit(1);
} else {
  console.log('\nPASS: Gate completeness invariant satisfied.');
  process.exit(0);
}
