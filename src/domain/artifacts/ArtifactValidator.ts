import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type AnyConstructor = new (opts?: Record<string, unknown>) => any;
type AnyCallable = (target: any) => any;

export class ArtifactValidator {
  private readonly ajv: any;
  private readonly schemasLoaded = new Set<string>();

  constructor(schemasDir: string = resolve(process.cwd(), 'schemas')) {
    const AjvConstructor: AnyConstructor = ((Ajv2020 as any).default ?? Ajv2020) as AnyConstructor;
    this.ajv = new AjvConstructor({
      strict: true,
      allErrors: true,
      validateFormats: true
    });

    const addFormatsFn: AnyCallable = ((addFormats as any).default ?? addFormats) as AnyCallable;
    addFormatsFn(this.ajv);

    this.loadSchemas(schemasDir);
  }

  private loadSchemas(schemasDir: string): void {
    const files = readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'));
    for (const file of files) {
      const fullPath = join(schemasDir, file);
      const content = JSON.parse(readFileSync(fullPath, 'utf8'));
      if (content.$id && !this.schemasLoaded.has(content.$id)) {
        this.ajv.addSchema(content, content.$id);
        this.schemasLoaded.add(content.$id);
      }
    }
  }

  public validateEnvelope(envelope: unknown): ValidationResult {
    const validate = this.ajv.getSchema('https://hitm.example/schemas/artifact-envelope.schema.json');
    if (!validate) {
      throw new Error('Envelope schema not registered');
    }

    const valid = Boolean(validate(envelope));
    return {
      valid,
      errors: validate.errors ? validate.errors.map((e: any) => `${e.instancePath || '/'}: ${e.message}`) : []
    };
  }

  public validatePayload(artifactType: string, payload: unknown): ValidationResult {
    const schemaMap: Record<string, string> = {
      ProjectBaseline: 'https://hitm.example/schemas/project-baseline.schema.json',
      ConceptPackage: 'https://hitm.example/schemas/concept-package.schema.json',
      MasterSpecification: 'https://hitm.example/schemas/master-specification.schema.json',
      TestSpecification: 'https://hitm.example/schemas/test-specification.schema.json',
      TestExecutionResult: 'https://hitm.example/schemas/test-execution-result.schema.json',
      ImplementationResult: 'https://hitm.example/schemas/implementation-result.schema.json',
      TriageReport: 'https://hitm.example/schemas/triage-report.schema.json',
      KnowledgeSnapshot: 'https://hitm.example/schemas/knowledge-snapshot.schema.json',
      ReviewResult: 'https://hitm.example/schemas/review-result.schema.json',
      DailyPlan: 'https://hitm.example/schemas/daily-plan.schema.json',
      SprintSpecification: 'https://hitm.example/schemas/sprint-specification.schema.json',
      DailyDevlog: 'https://hitm.example/schemas/daily-devlog.schema.json',
      PublicationPackage: 'https://hitm.example/schemas/publication-package.schema.json',
      SkillPackage: 'https://hitm.example/schemas/skill-package.schema.json'
    };

    const schemaId = schemaMap[artifactType];
    if (!schemaId) {
      return { valid: false, errors: [`No schema registered for artifactType: ${artifactType}`] };
    }

    const validate = this.ajv.getSchema(schemaId);
    if (!validate) {
      return { valid: false, errors: [`Schema ${schemaId} could not be resolved`] };
    }

    const valid = Boolean(validate(payload));
    return {
      valid,
      errors: validate.errors ? validate.errors.map((e: any) => `${e.instancePath || '/'}: ${e.message}`) : []
    };
  }

  public validateArtifact(envelope: any): ValidationResult {
    const envResult = this.validateEnvelope(envelope);
    if (!envResult.valid) {
      return envResult;
    }

    const payloadResult = this.validatePayload(envelope.artifactType, envelope.payload);
    if (!payloadResult.valid) {
      return {
        valid: false,
        errors: payloadResult.errors.map(err => `payload${err}`)
      };
    }

    return { valid: true, errors: [] };
  }
}
