# System Architecture — AI Research Workspace

## 1. High-Level Architecture Overview

The AI Research Workspace is a modular monolith for source-grounded research. The Copilot streams cited answers from a corrective RAG pipeline:

```text
React workspace -- HTTPS / SSE --> FastAPI --> Research chat graph (app/agent/)
                                                 |  retrieve: library (pgvector) + knowledge graph (Neo4j)
                                                 |  web search when needed
                                                 |  evidence check: bounded retry with a rewritten query
                                                 v
                                               Generate: streamed answer with citations
```

See [ai-workflows.md](ai-workflows.md) for the pipeline in detail.

---

## 2. Backend Architecture

### Core Modules (`backend/app/`)
- **`api/`**: REST endpoints (`/auth`, `/users`, `/sources`, `/sessions`, `/chat`, `/knowledge`, `/graph-test`, `/health`) with dependency-injected user context and DB sessions.
- **`core/`**: Centralized application configuration, JWT & Argon2/Bcrypt security, structured logging, and custom exception hierarchy.
- **`db/`**: Async SQLAlchemy 2.0 engine, PostgreSQL session factory, and declarative models with pgvector support.
- **`schemas/`**: Pydantic v2 data transfer objects and validation models.
- **`services/`**: Deterministic domain logic (sources and ingestion, sessions, chat, retrieval, memory, auth).
- **`agent/`**: The research chat LangGraph graph, its state, and its node functions.
- **`graph/`, `memory/`, `retrieval/`**: Neo4j knowledge graph, user memory, and search helpers.
- **`tools/`**: Swappable tool adapters and Model Context Protocol (MCP) server integration.
- **`utils/`**: SSRF validation, text sanitization, token estimation, and prompt injection defense.

---

## 3. Database Schema

The persistence layer uses PostgreSQL 16+ with the `pgvector` extension:
- `users`, `oauth_accounts`: Accounts, hashed passwords, and linked sign-in providers.
- `sources`: Each user's source library: type, URL, extracted content, content hash, and ingestion status.
- `source_chunks`: Text chunks, token counts, and embedding vectors for retrieval.
- `ingestion_runs`: Records of ingestion attempts for a source.
- `research_sessions`: Conversations: title, status, source policy, and rolling summaries.
- `session_sources`: Which sources belong to which session.
- `chat_messages`: Messages with status, suggested follow-ups, and the research trace.
- `message_citations`: Citation numbers on an answer, with their source and locator.
- `session_memories`: Per-session conversation memory with embeddings.
- `evidence`: Claims and support status tied to a session and source.
- `web_search_runs`, `research_events`, `research_summaries`, `agent_runs`: Per-session records of searches, events, summaries, and agent execution.

---

## 4. Security & Quality Guardrails

1. **SSRF Protection**: External URLs are checked before loading to reject private IP ranges (RFC 1918, loopbacks, link-local metadata).
2. **Prompt Injection Defense**: External sources are treated strictly as untrusted data, not execution instructions.
3. **Deterministic Citations**: Citations are mapped to validated DB entities rather than allowing LLM hallucinated citation keys.
4. **Bounded Agent Loops**: Evidence-check retries are capped at `CHAT_MAX_RETRIEVAL_RETRIES` to eliminate runaway costs.

---

## 5. State Machines

Lifecycles with failure paths or races are written down in one place each. Change the machine, not its callers.

| Lifecycle | Where it's defined | States |
| --- | --- | --- |
| Chat turn | `frontend/src/features/workspace/copilot/chatTurn.ts` (pure reducer) | `idle → thinking ⇄ streaming → idle` |
| Source added in the UI | `PendingSource` in `frontend/src/features/workspace/useWorkspaceData.ts` | `ingesting → ready \| failed`, `failed → ingesting` |
| Source ingestion | `backend/app/services/source_lifecycle.py` (`TRANSITIONS`) | `pending → processing → indexed \| failed` |
| Evidence retrieval loop | `backend/app/agent/graph.py` (LangGraph) | retrieve, evaluate, retry or generate |

Rules these rely on:

- `Source.status` is only written through `transition_source()`.
- An in-flight source is only trusted for `INGEST_LEASE`. Ingestion runs inside the request, so a crash leaves nothing to finish it; after the lease the next listing marks it `failed`, and adding the URL again takes it over.
- The server doesn't save failed or stopped chat replies. The reducer keeps them in `unsaved` and lays them over history syncs.
- One chat turn runs at a time, and opening another session cancels it.

Short-lived UI state (dialogs, hover, drag, delete popovers backed by a React Query mutation) stays as plain `useState`: its states can't conflict in a way a user would notice.
