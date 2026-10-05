export class JsonExtractor {
  public static extractJson(text: string, expectedKeyword?: string): any | null {
    if (!text || typeof text !== 'string') return null;

    // 1. Try case-insensitive markdown code blocks (```json, ```JSON, or plain ```)
    const blockRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    const candidates: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(text)) !== null) {
      if (match[1] && match[1].trim().startsWith('{')) {
        candidates.push(match[1].trim());
      }
    }

    // 2. If no code blocks, look for balanced outermost braces
    if (candidates.length === 0) {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidates.push(text.slice(firstBrace, lastBrace + 1));
      }
    }

    // Prioritize candidate matching expected keyword (e.g. "KnowledgeSnapshot", "sourceRevision", "SprintSpecification")
    if (expectedKeyword && candidates.length > 1) {
      candidates.sort((a, b) => {
        const aHas = a.includes(expectedKeyword) ? 1 : 0;
        const bHas = b.includes(expectedKeyword) ? 1 : 0;
        return bHas - aHas;
      });
    }

    // Parse candidates with sanitization (trailing commas & comments stripped)
    for (const rawCandidate of candidates) {
      const parsed = this.cleanAndParse(rawCandidate);
      if (parsed) return parsed;
    }

    return null;
  }

  private static cleanAndParse(raw: string): any | null {
    try {
      return JSON.parse(raw);
    } catch {}

    // Sanitize: strip single-line comments and trailing commas
    try {
      const sanitized = raw
        .replace(/\/\/[^\n]*/g, '') // Remove // comments
        .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas before } or ]
        .trim();

      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}
