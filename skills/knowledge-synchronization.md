---
name: knowledge-synchronization
description: Audit repository lockfiles, source files, and external dependencies
role: KNOWLEDGE
---
# Procedure: Knowledge Synchronization
1. Compute SHA-256 of `package-lock.json` and inspect Git revision.
2. Scan workspace source files and relevant symbols.
3. Emit a valid JSON `KnowledgeSnapshot` artifact conforming to `knowledge-snapshot.schema.json`.
