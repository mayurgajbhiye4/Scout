# System Architecture — AI Research Workspace

## 1. High-Level Architecture Overview

The AI Research Workspace is a modular monolith designed for deep, evidence-backed research synthesis. Rather than performing a single-turn LLM generation, it orchestrates an autonomous multi-stage workflow:

```text
                               ┌──────────────────────┐
                               │        USER          │
                               └──────────┬───────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │     React + MUI 9    │
                               │  Research Workspace  │
                               └──────────┬───────────┘
                                          │ HTTPS / SSE
                                          ▼
                               ┌──────────────────────┐
                               │       FastAPI        │
                               │   REST + Progress    │
                               └──────────┬───────────┘
                                          │
                                   Research Session
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │   Research Planner   │
                               │   Query Decomposition│
                               └──────────┬───────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │       Router         │
                               │ choose workers/tools │
                               └──────────┬───────────┘
                                          │
                         ┌───────────────┼────────────────┐
                         │               │                │
                         ▼               ▼                ▼
                    ┌────────┐     ┌────────┐      ┌─────────┐
                    │ Web Job│     │ PDF/RAG│      │GitHub Job│
                    └────┬───┘     └────┬───┘      └────┬────┘
                         │              │               │
                         ▼              ▼               ▼
                    Web Agent       RAG Agent      GitHub Agent
                         │              │               │
                         └──────────────┼───────────────┘
                                        │
                                  Evidence Extraction
                                        │
                                        ▼
                               ┌──────────────────────┐
                               │ pgVector + Postgres  │
                               │ evidence + memory    │
                               └──────────┬───────────┘
                                          │
                                          ▼
                               Evidence Verification
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │ Contradiction Check  │
                               └──────────┬───────────┘
                                          │
                                          ▼
                                  Draft Synthesizer
                                          │
                                          ▼
                                       Critic
                                          │
                                ┌─────────┴─────────┐
                                │                   │
                             Enough?           Not enough
                                │                   │
                                ▼                   └──────► Bounded Revision
                         Final Report
                                │
                     ┌──────────┼───────────┐
                     ▼          ▼           ▼
                  Summary    Evidence    Sources
                                │
                                ▼
                         Mindmap / System Tree
```

---

## 2. Backend Architecture

### Core Modules (`backend/app/`)
- **`api/`**: REST endpoints (`/auth`, `/workspaces`, `/documents`, `/sources`, `/research`, `/health`) with dependency-injected user context and DB sessions.
- **`core/`**: Centralized application configuration, JWT & Argon2/Bcrypt security, structured logging, and custom exception hierarchy.
- **`db/`**: Async SQLAlchemy 2.0 engine, PostgreSQL session factory, and declarative models with pgvector support.
- **`schemas/`**: Pydantic v2 data transfer objects and validation models.
- **`services/`**: Deterministic domain logic (`WorkspaceService`, `DocumentService`, `IngestionService`, `RetrievalService`, `CitationService`, `ResearchService`).
- **`agents/`**: LangGraph graph definition, state typing, prompts, and individual agent node functions.
- **`tools/`**: Swappable tool adapters and Model Context Protocol (MCP) server integration.
- **`jobs/`**: Background execution workers for long-running ingestion and research sessions.
- **`utils/`**: SSRF validation, text sanitization, token estimation, and prompt injection defense.

---

## 3. Database Schema

The persistence layer uses PostgreSQL 16+ with the `pgvector` extension:
- `users`: User authentication, hashed passwords, timestamps.
- `workspaces`: Multi-tenant workspace data boundaries.
- `documents`: Uploaded files (PDF, DOCX, TXT) and ingested URLs.
- `document_chunks`: Text chunks, token counts, and `vector(768)` embedding vectors with HNSW/IVFFlat indexing.
- `sources`: Unified source registry containing raw content, external URLs, and SHA-256 deduplication hashes.
- `research_sessions`: Research questions, depth mode, execution status, error logs, and execution duration.
- `research_tasks`: Decomposed sub-questions and assigned worker execution status.
- `evidence`: Verified factual claims, supporting excerpts, confidence scores, and foreign keys to sources.
- `reports`: Final synthesized Markdown reports with metadata.
- `report_citations`: Deterministic mapping between report citation keys (`[1]`, `[2]`), sources, and evidence.
- `agent_runs`: Observability audit log tracking node execution, latency, and token usage.

---

## 4. Security & Quality Guardrails

1. **SSRF Protection**: External URLs are checked before loading to reject private IP ranges (RFC 1918, loopbacks, link-local metadata).
2. **Prompt Injection Defense**: External sources are treated strictly as untrusted data, not execution instructions.
3. **Deterministic Citations**: Citations are mapped to validated DB entities rather than allowing LLM hallucinated citation keys.
4. **Bounded Agent Loops**: Reflection and revisions are strictly capped at `MAX_AGENT_REVISIONS = 2` to eliminate runaway costs.
