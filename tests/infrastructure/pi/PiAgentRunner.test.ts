import { describe, it, expect, vi } from 'vitest';
import { PiAgentRunner, PiSessionLike } from '../../../src/infrastructure/pi/PiAgentRunner.js';
import { AGENT_REGISTRY } from '../../../src/agents/AgentDefinitions.js';

describe('PiAgentRunner Hexagonal Adapter (Normative §4.1, §35, §51, §52)', () => {
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

  it('maintains strict invocation-scoped capability isolation during concurrent interleaved executions (§51, §52)', async () => {
    const interceptors = new Map<string, (tool: string, args: Record<string, unknown>) => Promise<boolean>>();

    const mockSessionFactory = async (opts: any) => {
      interceptors.set(opts.invocationId, opts.onToolCall);
      return {
        prompt: async () => {},
        abort: async () => {},
        dispose: async () => {},
        getLastAssistantText: () => `Output from ${opts.invocationId}`
      };
    };

    const runner = new PiAgentRunner('/mock/workspace', mockSessionFactory);

    // Start Invocation A (Agent 0120: Methodical Scribe - Test Author)
    const promiseA = runner.start({
      invocationId: 'inv-A',
      agentId: '0120',
      workflowId: 'wf-concurrent',
      taskId: 'task-authoring',
      prompt: 'Author tests',
      contextArtifactIds: []
    });

    // Start Invocation B concurrently (Agent 0060: Confident Forge - Implementer)
    const promiseB = runner.start({
      invocationId: 'inv-B',
      agentId: '0060',
      workflowId: 'wf-concurrent',
      taskId: 'task-implementation',
      prompt: 'Implement feature',
      contextArtifactIds: []
    });

    await Promise.all([promiseA, promiseB]);

    const interceptorA = interceptors.get('inv-A');
    const interceptorB = interceptors.get('inv-B');

    expect(interceptorA).toBeDefined();
    expect(interceptorB).toBeDefined();

    // Interleaved execution checks:
    // 1. A requests test write -> ALLOWED
    expect(await interceptorA!('write', { path: 'tests/foo.test.ts' })).toBe(true);

    // 2. B requests test write -> DENIED (0060 cannot touch tests)
    expect(await interceptorB!('write', { path: 'tests/foo.test.ts' })).toBe(false);

    // 3. A requests src write -> DENIED (0120 cannot touch src)
    expect(await interceptorA!('write', { path: 'src/foo.ts' })).toBe(false);

    // 4. B requests src write -> ALLOWED (0060 can touch src)
    expect(await interceptorB!('write', { path: 'src/foo.ts' })).toBe(true);

    // 5. Verify direct invocation query fails closed on unresolvable invocation ID
    expect(runner.authorizeToolCall('write', { path: 'tests/foo.test.ts' }, 'non-existent-id')).toBe(false);
  });
});
