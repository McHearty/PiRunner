export const ARTIFACT_SKELETONS: Record<string, string> = {
  ConceptPackage: `\`\`\`json
{
  "title": "Feature Title",
  "summary": "Executive summary of the concept",
  "objectives": ["Primary objective"],
  "intendedUsers": ["Target user"],
  "majorCapabilities": ["Key capability"],
  "constraints": [],
  "assumptions": [],
  "nonGoals": [],
  "terminology": [],
  "unresolvedQuestions": []
}
\`\`\``,

  MasterSpecification: `\`\`\`json
{
  "title": "Master Technical Specification",
  "version": "1.0.0",
  "conceptArtifactId": "art-concept",
  "architecture": { "overview": "...", "components": ["..."], "boundaries": ["..."] },
  "functionalRequirements": [{ "id": "REQ-001", "statement": "...", "priority": "MUST" }],
  "nonFunctionalRequirements": [],
  "interfaces": [],
  "invariants": [],
  "dataContracts": [],
  "stateMachines": [],
  "errorBehavior": [],
  "securityBoundaries": [],
  "persistenceRequirements": [],
  "compatibilityRequirements": [],
  "testRequirements": [],
  "acceptanceCriteria": [{ "id": "AC-001", "statement": "...", "requirementIds": ["REQ-001"] }],
  "implementationConstraints": [],
  "unresolvedQuestions": []
}
\`\`\``,

  SprintSpecification: `\`\`\`json
{
  "masterSpecificationArtifactId": "art-spec",
  "surgicalChange": false,
  "sprintNumber": 1,
  "goals": ["Implement requested feature"],
  "tasks": [
    {
      "id": "TASK-1",
      "title": "Implement specific changes",
      "requirementIds": ["REQ-001"]
    }
  ],
  "acceptanceCriteria": [
    {
      "id": "AC-001",
      "statement": "Acceptance verification condition"
    }
  ]
}
\`\`\``,

  KnowledgeSnapshot: `\`\`\`json
{
  "sourceRevision": "a1b2c3d",
  "dependencyLockHash": "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff",
  "verifiedAt": "2026-10-05T00:00:00.000Z",
  "freshnessPolicyVersion": "1.0.0",
  "relevantSourceFiles": [
    { "path": "src/index.ts", "contentHash": "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff", "language": "typescript" }
  ],
  "relevantSymbols": [
    { "name": "hitmExtension", "kind": "function", "location": { "path": "src/extension.ts", "line": 20, "column": 0 }, "exported": true }
  ],
  "dependencies": [
    { "name": "vitest", "version": "^2.0.0", "resolved": "2.1.9", "ecosystem": "npm", "manifestPath": "package.json" }
  ],
  "documentationRefs": [
    { "identifier": "TECHSPEC.md", "title": "TECHSPEC.md", "retrievedAt": "2026-10-05T12:00:00.000Z" }
  ],
  "notes": "Incremental knowledge delta synchronized"
}
\`\`\``,

  TestSpecification: `\`\`\`json
{
  "masterSpecificationArtifactId": "art-spec",
  "sprintSpecificationArtifactId": "art-sprint",
  "testCases": [
    {
      "id": "TC-001",
      "requirementIds": ["REQ-001"],
      "acceptanceCriteriaIds": ["AC-001"],
      "category": "UNIT",
      "description": "Verify expected behavior",
      "preconditions": [],
      "inputs": [],
      "expectedBehavior": ["Expected outcome"],
      "failureCondition": ["Failure outcome"],
      "testPath": "tests/unit/feature.test.ts",
      "testSymbol": "testFeature"
    }
  ],
  "requirementCoverage": [{ "requirementId": "REQ-001", "disposition": "AUTOMATED", "testCaseIds": ["TC-001"] }],
  "invariants": [],
  "fixtures": [],
  "testFramework": "vitest",
  "testRootPaths": ["tests"],
  "protectedPaths": ["src/**"],
  "executionCommand": "npm test",
  "testSuiteContentHash": "d4176a96a82e4b000056b704e9514c3b99037c6bd7d05405cf318671b416a997",
  "unresolvedQuestions": []
}
\`\`\``,

  ImplementationResult: `\`\`\`json
{
  "status": "COMPLETED",
  "sprintSpecificationArtifactId": "art-sprint",
  "testSpecificationArtifactId": "art-test-spec",
  "testSuiteContentHash": "d4176a96a82e4b000056b704e9514c3b99037c6bd7d05405cf318671b416a997",
  "commitSha": "0000000000000000000000000000000000000000",
  "changedFiles": ["src/feature.ts"],
  "testsExecuted": true,
  "testSummary": { "passed": 1, "failed": 0, "skipped": 0 },
  "blockingIssues": []
}
\`\`\``,

  SkillPackage: `\`\`\`json
{
  "name": "new-procedure",
  "version": "1.0.0",
  "targetRole": "PLANNING",
  "description": "Procedure description",
  "parameterizedInputs": [],
  "procedure": ["Step 1", "Step 2"],
  "successCriteria": ["Verification criteria"],
  "verifiedUses": ["use-1", "use-2", "use-3"]
}
\`\`\``
};
