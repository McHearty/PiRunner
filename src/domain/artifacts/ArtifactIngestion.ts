import { ArtifactValidator, ValidationResult } from './ArtifactValidator.js';
import { ArtifactStore, StoredArtifact } from './ArtifactStore.js';
import { AgentExecution } from '../agents/AgentRunner.js';

export interface IngestionResult {
  success: boolean;
  artifact?: StoredArtifact<any>;
  errors: string[];
}

export class ArtifactIngestionService {
  public static ingestFromExecution(
    execution: AgentExecution,
    expectedArtifactType: string,
    workflowId: string,
    taskId: string,
    agentId: string,
    validator: ArtifactValidator,
    artifactStore: ArtifactStore
  ): IngestionResult {
    if (!execution.rawOutput || execution.status === 'FAILED') {
      return { success: false, errors: ['Agent execution reported failure or empty raw output'] };
    }

    // 1. Extract JSON payload block from raw output
    const jsonMatch = execution.rawOutput.match(/```json\s*([\s\S]*?)\s*```/) || execution.rawOutput.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      return { success: false, errors: ['No valid JSON block detected in agent execution output'] };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch (err: any) {
      return { success: false, errors: [`JSON parse failure: ${err.message}`] };
    }

    // 2. Wrap in canonical envelope if raw payload was emitted
    const envelope: StoredArtifact<any> = parsed.artifactId && parsed.artifactType ? parsed : {
      artifactId: `art-${expectedArtifactType.toLowerCase()}-${Date.now()}`,
      artifactType: expectedArtifactType,
      schemaVersion: '1.0.0',
      workflowId,
      taskId,
      agentId,
      createdAt: new Date().toISOString(),
      parentArtifactIds: [],
      sourceRefs: [{ type: 'SESSION', identifier: execution.invocationId }],
      status: 'SUBMITTED',
      payload: parsed
    };

    // 3. Strict schema validation
    const valResult = validator.validateArtifact(envelope);
    if (!valResult.valid) {
      return { success: false, errors: valResult.errors };
    }

    // 4. Commit to artifact store
    artifactStore.save(envelope);
    return { success: true, artifact: envelope, errors: [] };
  }
}
