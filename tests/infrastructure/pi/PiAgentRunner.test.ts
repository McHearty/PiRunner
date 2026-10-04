import { describe, it, expect, vi } from 'vitest';
import { PiAgentRunner, PiSessionLike } from '../../../src/infrastructure/pi/PiAgentRunner.js';
import { AGENT_REGISTRY } from '../../../src/agents/AgentDefinitions.js';

describe('PiAgentRunner Hexagonal Adapter (Normative §4.1, §35)', () => {
  it('exposes normative agent declarations for 0120, 0060, 0072, and 0084', () => {
    expect(AGENT_REGISTRY['0120'].name).toBe('Methodical Scribe');
    expect(AGENT_REGISTRY['0060'].name).toBe('Confident Forge');
    expect(AGENT_REGISTRY['0072'].name).toBe('Patient Oracle');
    expect(AGENT_REGISTRY['0084'].name).toBe('Satisfied Sentinel');

    expect(AGENT_REGISTRY['0120'].systemPrompt).toContain('You do not implement production behavior');
    expect(AGENT_REGISTRY['0060'].systemPrompt).toContain('The TestSpecification and authoritative tests are read-only');
  });

  it('runs session and intercepts unauthorized tool writes according to capability policy', async () => {
    let capturedToolInterceptor: ((tool: string, args: Record<string, unknown>) => Promise<boolean>) | undefined;

    const mockSession: PiSessionLike = {
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      getLastAssistantText: () => '```json\n{\n  "status": "COMPLETED",\n  "testCases": []\n}\n```'
    };

    const runner = new PiAgentRunner('/mock/workspace', async (opts) => {
      capturedToolInterceptor = opts.onToolCall;
      return mockSession;
    });

    const execution = await runner.start({
      invocationId: 'inv-test-1',
      agentId: '0120', // Methodical Scribe
      workflowId: 'wf-1',
      taskId: 'task-1',
      prompt: 'Write test suite',
      contextArtifactIds: []
    });

    expect(execution.status).toBe('COMPLETED');
    expect(execution.rawOutput).toContain('testCases');
    expect(mockSession.prompt).toHaveBeenCalledWith('Write test suite');
    expect(capturedToolInterceptor).toBeDefined();

    // 0120 allowed to write to tests/
    const allowed = await capturedToolInterceptor!('write', { path: 'tests/unit/app.test.ts' });
    expect(allowed).toBe(true);

    // 0120 forbidden to write to src/
    const forbidden = await capturedToolInterceptor!('write', { path: 'src/main.ts' });
    expect(forbidden).toBe(false);
  });
});
