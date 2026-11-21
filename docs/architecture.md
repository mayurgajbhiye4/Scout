# System Architecture — AI Research Workspace

## 1. High-Level Architecture Overview

The AI Research Workspace is a modular monolith for source-grounded research. A React single-page app talks to one FastAPI service, which keeps relational data and vectors in PostgreSQL (pgvector) and the knowledge graph in Neo4j. The Copilot streams cited answers from a corrective RAG pipeline:

```text
React SPA (Vite) -- HTTPS / SSE --> FastAPI /api/v1 --> Research chat graph (app/agent/)
                                       |                  |  retrieve: library (pgvector) + knowledge graph (Neo4j)
                                       |                  |  web search (Tavily) when needed
                                       |                  |  evidence check: bounded retry with planned queries
                                       |                  v
                                       |                Generate: streamed answer with citations (Gemini)
                                       |
                                       +--> Source ingestion: extract -> chunk -> embed (Gemini) -> pgvector
                                                                                 \-> entity extraction -> Neo4j
```

| Service | Role | Configured by |
| --- | --- | --- |
| PostgreSQL 16 + pgvector | Accounts, sources, chunks with 768-dim embeddings, sessions, messages | `DATABASE_URL`, `DATABASE_URL_SYNC` (Alembic) |
| Neo4j | Per-user knowledge graph: concepts, relations, source links, user memory | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` |
| Google Gemini | Chat model (`LLM_MODEL`) and embeddings (`EMBEDDING_MODEL`) | `GEMINI_API_KEY` |
| Tavily | Web search; the web is never searched without a key | `TAVILY_API_KEY` |
| GitHub API | Repository ingestion (optional token raises the rate limit) | `GITHUB_TOKEN` |

See [ai-workflows.md](ai-workflows.md) for the chat pipeline in detail and [api.md](api.md) for the endpoints.

---

## 2. Backend Architecture

### Core Modules (`backend/app/`)
- **`main.py`**: App factory, CORS, request logging middleware, and the exception handlers that return the `{"error": {code, message, details}}` envelope. All routes are mounted under `/api/v1`.
- **`api/`**: REST endpoints (`/health`, `/auth`, `/users`, `/sources`, `/sessions`, `/chat`, `/knowledge`, `/graph-test`), with `deps.py` resolving the JWT user and the DB session.
- **`core/`**: Settings (`config.py`, read from `backend/.env`), JWT and password hashing (`security.py`), structured logging, the exception hierarchy, and rate limiting (`rate_limit.py`: per-endpoint limits plus per-user `PIPELINE_*_RPM` limits on LLM, embedding, graph and RAG calls).
- **`db/`**: Async SQLAlchemy 2.0 engine and session factory, and the declarative models (section 3).
- **`schemas/`**: Pydantic v2 request and response models.
- **`services/`**: Domain logic.
  - `source_service.py` runs ingestion. `source_lifecycle.py` owns `Source.status` (section 5).
  - `extractors/` turns web pages and GitHub repositories into text (YouTube transcripts come from `tools/youtube_transcript.py`; raw `content` needs no extractor).
  - `chunking.py` and `embedding_service.py` split and embed that text.
  - `session_service.py`, `chat_service.py` (SSE streaming and persistence), `memory_service.py` (session memory), `suggestion_service.py` (fallback research threads) and `auth_service.py` (email/password and Google sign-in) cover the rest.
- **`agent/`**: The research chat LangGraph graph (`graph.py`), its state (`state.py`), its nodes (`nodes.py`), and evidence-quote selection (`evidence.py`).
- **`graph/engine.py`**: The Neo4j knowledge graph: LLM entity and relation extraction at ingestion, graph evidence for retrieval, and the graph views served by `/knowledge`.
- **`memory/store.py`**: Per-user memory in Neo4j (likes, dislikes, explored and curious-about concepts) and the suggested starter prompts built from it.
- **`retrieval/`**: Keyword extraction, graph-fact formatting, and a cross-encoder reranker. The reranker is only used by the `/graph-test/retrieve` debug endpoint, not by chat.
- **`tools/`**: External adapters used at runtime: Tavily web search (`web_search.py`) and YouTube transcripts (`youtube_transcript.py`).
- **`utils/text_security.py`**: SSRF URL validation, untrusted-text sanitization, and token estimation.

### Source ingestion
`POST /sources` (or `POST /sessions/{id}/sources`) creates the source and ingests it inside the request. `POST /sources/upload` (or `POST /sessions/{id}/sources/upload`) does the same for a file: `extract_upload` reads its text first, refusing the file with a 413, 415 or 422 before anything is saved, and the source is then ingested from that text, skipping step 1.
1. **Extract**: YouTube URLs use the transcript and GitHub URLs the repository extractor. Anything else, or a failed special case, goes to `extract_url` (`services/extractors/document.py`). It downloads the file once, with the SSRF check on every redirect and a `MAX_UPLOAD_SIZE_MB` cap, then picks the extractor from the file's first bytes: `PdfExtractor` (pypdf), `DocxExtractor` (python-docx) or `WebExtractor` (HTML). A file that can't be read raises `ExtractionError`, whose message becomes the source's failure reason.
2. **Chunk and embed**: the text is chunked, embedded with Gemini, and stored in `source_chunks`. If embeddings are unavailable, nothing is stored and the source ends in `failed`.
3. **Graph**: entities and relations are extracted into Neo4j. A graph failure does not fail the source.

---

## 3. Database Schema

PostgreSQL 16+ with the `pgvector` extension. Migrations live in `backend/alembic/versions/`; the current head is `b9e5d3a7c1f8`.

| Table | Contents |
| --- | --- |
| `users` | Email, name, password hash (null for Google-only accounts), avatar, active flag |
| `oauth_accounts` | Linked sign-in providers; unique on `(provider, provider_account_id)` |
| `sources` | Each user's library: type, title, `canonical_uri`, extracted `content_text`, content hash, `metadata` (chunk count, errors), status, `last_indexed_at`. Unique on `(user_id, canonical_uri)` |
| `source_chunks` | Chunk text, index, token count, metadata, and a 768-dim `embedding` |
| `research_sessions` | Conversations: title, status, source policy, session and memory summaries, last activity |
| `session_sources` | Which sources are attached to which session (composite key) |
| `chat_messages` | Role, content, status, `suggested_questions`, `research_trace`, and `answer_extras` (evidence quotes, graph relations, research threads) |
| `message_citations` | Citation numbers on an answer with their source (null for web and graph citations) and a `locator` holding the snippet, title, URI and chunk index |
| `session_memories` | Per-session conversation memory with type, importance and an embedding |

Deleting a user, session, source or message cascades to the rows that belong to it.

Answer evidence and the research trace are stored as JSON on `chat_messages` rather than in their own tables. Migration `b9e5d3a7c1f8` dropped the old `evidence`, `agent_runs`, `ingestion_runs`, `research_events`, `research_summaries` and `web_search_runs` tables, which no code wrote to.

---

## 4. Security & Quality Guardrails

1. **Authentication**: Stateless JWT bearer tokens (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, default 24 h). Google sign-in verifies the Google ID token server-side and links to an existing account with the same verified email.
2. **Rate limiting**: Every endpoint has a per-user (or per-IP) limit, and the pipeline has per-user limits on model calls. A 429 carries `Retry-After` and `X-RateLimit-*` headers. `GET /api/v1/health/limits` lists every limit.
3. **SSRF Protection**: `ensure_public_url()` (`utils/text_security.py`) refuses non-http(s) URLs and any host that is, or resolves to, a non-public address (private, loopback, link-local/cloud metadata, shared and reserved ranges). `create_source` runs it before saving, so an internal URL is a 422, and the web extractor runs it again on every redirect hop. GitHub and YouTube ingestion only call fixed public hosts. DNS rebinding between the check and the fetch isn't covered.
4. **Prompt Injection Defense**: External sources are treated strictly as untrusted data, not instructions.
5. **Deterministic Citations**: Citations map to numbered sources the server built, never to citation keys the model invents. Only sources the answer actually cites are returned.
6. **Bounded Agent Loops**: Evidence-check retries are capped at `CHAT_MAX_RETRIEVAL_RETRIES`.
7. **Error envelope**: Errors return `{"error": {"code", "message", "details"}}`; unhandled exceptions return `INTERNAL_ERROR` without internals.

---

## 5. State Machines

Lifecycles with failure paths or races are written down in one place each. Change the machine, not its callers.

| Lifecycle | Where it's defined | States |
| --- | --- | --- |
| Chat turn | `frontend/src/features/workspace/copilot/chatTurn.ts` (pure reducer) | `idle → thinking ⇄ streaming → idle` |
| Source added in the UI | `PendingSource` in `frontend/src/features/workspace/useWorkspaceData.ts` | `ingesting → ready \| failed`, `failed → ingesting` |
| Source ingestion | `backend/app/services/source_lifecycle.py` (`TRANSITIONS`) | `pending → processing → indexed \| failed` |
| Evidence retrieval loop | `backend/app/agent/graph.py` (LangGraph) | retrieve, evaluate (grade + drop off-topic sources) → library \| web \| generate |

Rules these rely on:

- `Source.status` is only written through `transition_source()`.
- Only Gemini embeddings are ever stored; there is no local fallback. When Gemini is down, rate limited or has no `GEMINI_API_KEY`, `generate_embeddings` raises `EmbeddingUnavailable`, nothing is saved, the source ends in `failed` with "Ingestion failed: the embedding model is unavailable", and adding it again retries. At query time the library search is skipped and chat falls back to the web.
- An in-flight source is only trusted for `INGEST_LEASE`. Ingestion runs inside the request, so a crash leaves nothing to finish it; after the lease the next listing marks it `failed`, and adding the URL again takes it over.
- The server doesn't save failed or stopped chat replies. The reducer keeps them in `unsaved` and lays them over history syncs.
- One chat turn runs at a time, and opening another session cancels it.

Short-lived UI state (dialogs, hover, drag, delete popovers backed by a React Query mutation) stays as plain `useState`: its states can't conflict in a way a user would notice.

---

## 6. Frontend Architecture

React 18 + TypeScript, built with Vite. Styling is Tailwind CSS v4 with Radix UI primitives (`components/ui/`). Server state uses TanStack Query, and HTTP uses Axios (`api/client.ts`, which attaches the JWT and routes 429s to the rate-limit popup). The graph canvas is React Flow (`@xyflow/react`) with `d3-force` layout.

| Path (`frontend/src/`) | Contents |
| --- | --- |
| `app/` | Router, providers, root layout. `/` and `/sessions/:sessionId` both render `HomeRoute`, so the workspace stays mounted when the first message creates a session |
| `api/` | One module per backend area: `auth`, `sessions`, `sources`, `chat` (SSE reader), `knowledge` |
| `features/landing/`, `features/marketing/` | Signed-out landing page, feature sections, 404 page |
| `features/auth/` | Auth dialog (opened over any page through `authEvents.ts`), Google sign-in, `useAuth` |
| `features/workspace/` | The signed-in workspace (`UnifiedWorkspace.tsx`), sessions rail and tabs, floating windows |
| `features/workspace/canvas/` | Knowledge-graph views: graph canvas, concept map, map sketch, entity navigator, sources dock, add-source |
| `features/workspace/copilot/` | Chat: `useResearchChat` + `chatTurn` reducer, live research progress, answer card with citations, relation map and research threads |
| `features/workspace/flow/` | Session flow view and its source list |
| `features/theme/` | Light/dark theme context |
| `lib/` | Citation parsing (`claimKey` mirrors the backend), rate-limit manager, formatters, motion helpers |

The dev server proxies `/api` to `http://localhost:8000` (`vite.config.ts`).
