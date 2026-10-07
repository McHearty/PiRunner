import { describe, test, expect } from 'vitest';
import { TRANSITION_REGISTRY } from '../../src/domain/workflow/WorkflowTransition.js';
import { HITM_DECISION_REGISTRY, EXCEPTIONAL_TRANSITIONS } from '../../src/domain/workflow/HITMDecisionRegistry.js';

describe('Gate Completeness Invariant', () => {
  test('every human-decision transition has an explicit HITM decision path', () => {
    // Filter human-decision gates
    const humanGates = TRANSITION_REGISTRY.filter(t => t.humanApproval === 'ALWAYS');
    
    // Build set of transitions covered by the HITM decision registry
    const coveredTransitions = new Set<string>();
    for (const decision of HITM_DECISION_REGISTRY) {
      for (const tId of decision.transitionIds) {
        coveredTransitions.add(tId);
      }
    }
    
    // Identify latent gates: human-decision transitions not in registry and not exceptional
    const latentGates = humanGates.filter(t =>
      !coveredTransitions.has(t.id) &&
      !EXCEPTIONAL_TRANSITIONS.has(t.id)
    );
    
    // Report
    console.log(`Total transitions: ${TRANSITION_REGISTRY.length}`);
    console.log(`Human-decision gates: ${humanGates.length}`);
    console.log(`Covered by HITM decision registry: ${coveredTransitions.size}`);
    console.log(`Exceptional (generic-command-only): ${EXCEPTIONAL_TRANSITIONS.size}`);
    console.log(`Latent gates (no explicit HITM UI): ${latentGates.length}`);
    
    if (latentGates.length > 0) {
      console.log('\nLatent gates:');
      for (const gate of latentGates) {
        console.log(`  ${gate.id} (${gate.from} → ${gate.to})`);
      }
    }
    
    // The invariant: zero latent gates
    expect(latentGates.length).toBe(0);
  });

  test('every HITM decision choice resolves to a legal transition', () => {
    const transitionIds = new Set(TRANSITION_REGISTRY.map(t => t.id));
    
    for (const decision of HITM_DECISION_REGISTRY) {
      for (const choice of decision.choices) {
        if (choice.targetTransition) {
          expect(transitionIds.has(choice.targetTransition)).toBe(true);
        }
      }
    }
  });

  test('no exceptional transition is also in the HITM decision registry', () => {
    const coveredTransitions = new Set<string>();
    for (const decision of HITM_DECISION_REGISTRY) {
      for (const tId of decision.transitionIds) {
        coveredTransitions.add(tId);
      }
    }
    
    for (const exceptional of EXCEPTIONAL_TRANSITIONS) {
      expect(coveredTransitions.has(exceptional)).toBe(false);
    }
  });
});
