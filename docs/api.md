# API Reference — AI Research Workspace

Base URL: `http://localhost:8000/api/v1`. Interactive docs (Swagger) are served at `http://localhost:8000/docs`.

## Conventions

- **Auth**: every endpoint except `/health*`, `/auth/register`, `/auth/login`, `/auth/google` and `/auth/google/config` needs `Authorization: Bearer <access_token>`.
- **Response shape**: `/auth`, `/users` and `/health` wrap results as `{"data": ..., "meta": {}}`. `/sources`, `/sessions`, `/chat` and `/knowledge` return the resource directly.
- **Errors**: `{"error": {"code": "NOT_FOUND", "message": "...", "details": {}}}`. FastAPI validation errors (422) and plain `HTTPException`s (e.g. a 404 on detach) use FastAPI's `{"detail": ...}` shape.
- **Rate limits**: each endpoint has a per-user limit (per IP when unauthenticated); limits are configured by the `RATE_LIMIT_*` settings. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; a 429 also carries `Retry-After`. `GET /health/limits` lists them all.
- IDs are UUIDs; timestamps are ISO 8601 with time zone.

---

## 1. Health (`/health`)

| Method & path | Auth | Returns |
| --- | --- | --- |
| `GET /health` | – | `{"data": {"status": "healthy"}}` (liveness) |
| `GET /health/ready` | – | `{"data": {"status": "ready" \| "not_ready", "database": "connected" \| "disconnected"}}` |
| `GET /health/limits` | – | Every endpoint and pipeline rate limit, with `meta.total` |

---

## 2. Authentication (`/auth`)

### Register — `POST /auth/register` → 201
```json
{ "email": "user@example.com", "password": "at-least-8-chars", "name": "Ada" }
```
Returns `{"data": User}`. A duplicate email is a 409.

### Login — `POST /auth/login`
```json
{ "email": "user@example.com", "password": "..." }
```
Returns `{"data": {"access_token": "eyJ...", "token_type": "bearer"}}`.

### Google sign-in
- `GET /auth/google/config` → `{"data": {"enabled": true, "client_id": "..."}}`. `enabled` is false when `GOOGLE_CLIENT_ID` is unset.
- `POST /auth/google` with `{"credential": "<Google ID token>"}` → same token response as login. An existing account with the same verified email is linked.

### Current user — `GET /auth/me`
Returns `{"data": User}`.

### Logout — `POST /auth/logout`
Stateless; the client discards its token. Returns `{"data": {"message": "Logged out"}}`.

**User**: `{ "id", "email", "name", "is_active", "created_at" }`

---

## 3. Users (`/users`)

`PATCH /users/me` with `{"name": "New name"}` → `{"data": User}`.

---

## 4. Sources (`/sources`)

A source is an item in the user's library. Creating one ingests it in the same request (extract, chunk, embed, then graph extraction), so the response already shows `indexed` or `failed`.

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET /sources/` | `skip`, `limit` | `Source[]` |
| `GET /sources/{source_id}` | – | `Source` |
| `POST /sources/` | `SourceCreate` | `Source` (201) |
| `POST /sources/upload` | multipart: `file`, `title`? | `Source` (201); see **File upload** |
| `DELETE /sources/{source_id}` | – | 204; also removes its chunks, session links and citations |

**SourceCreate**: a source added by link; `url` is required. There is no raw-text source: files go through **File upload**, and any other field (such as the removed `content`) is a 422.
```json
{ "url": "https://github.com/owner/repo", "title": "optional", "source_type": "github" }
```
`source_type` is optional and inferred from the URL when absent. It accepts `website`, `pdf`, `youtube`, `github`, `notion`, `txt`, `markdown`, `docx`, and the aliases `web`, `url`, `link`, `video`, `repo`, `md`, `text`. Adding a URL the user already has returns the existing source: as-is when it is indexed with chunks, joined when its ingestion is still running (within `INGEST_LEASE`), and ingested again otherwise. A URL that isn't http(s), or whose host is or resolves to a private or internal address, is a 422 `VALIDATION_ERROR` and nothing is saved. For any URL that isn't YouTube or GitHub, the file is downloaded once (at most `MAX_UPLOAD_SIZE_MB`) and its format is read from its first bytes, not from the URL or `Content-Type`. A PDF gets its text layer (pypdf), a Word `.docx` its paragraphs and tables (python-docx), and anything else is parsed as a web page. `source_type` is then corrected to `pdf`, `docx` or `website` to match what was found. Scanned PDFs with no text, password-protected PDFs, legacy `.doc` files and other binary files (images, archives) end in `failed`, with the reason in `metadata.error`.

**File upload**: `POST /sources/upload` (or `POST /sessions/{id}/sources/upload`) takes `multipart/form-data` with a `file` field and an optional `title` field. It accepts only PDF, Word `.docx`, text (`.txt`) and Markdown (`.md`, `.markdown`). PDF and Word are recognised from the file's bytes, as for URLs. Text files are recognised by extension only, so other text formats (`.csv`, `.json`, `.html`, …) are refused even though they are `text/*`. The text is extracted before anything is saved, so a file that can't be read leaves no source behind:

| Problem | Response |
| --- | --- |
| Larger than `MAX_UPLOAD_SIZE_MB` (default 50) | 413 `FILE_TOO_LARGE` |
| Not a supported format (an image, a legacy `.doc`, a `.csv`, …) | 415 `UNSUPPORTED_FILE_TYPE`, with the supported formats in `message` |
| Supported but unreadable (a scanned PDF with no text, a password, a damaged file, an empty file) | 422 `VALIDATION_ERROR`, with the reason in `message` |

The source has `canonical_uri: null`, `mime_type` from the upload, `source_type` from the format found, and `metadata.filename`, `metadata.size_bytes` and, for PDFs, `metadata.page_count`. Its title is the `title` field, else the document's own title, else the file name without its extension. Uploading a file whose extracted text matches one the user already uploaded returns that source instead of a duplicate. The original file isn't stored, only its text.

**Source**:
```json
{
  "id": "…", "user_id": "…", "source_type": "website", "title": "…",
  "canonical_uri": "https://…", "external_id": null, "mime_type": null,
  "status": "pending | processing | indexed | failed",
  "chunk_count": 12, "metadata": { "chunk_count": 12, "error": "…" },
  "created_at": "…", "updated_at": "…", "last_indexed_at": "…"
}
```

---

## 5. Sessions (`/sessions`)

A session is one research conversation with its attached sources.

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /sessions/` | `skip`, `limit` (default 20) | `Session[]`, most recent activity first |
| `POST /sessions/` | `{"title"?, "source_policy"?, "source_ids"?}` | `Session` (201) |
| `GET /sessions/{session_id}` | – | `Session` |
| `PATCH /sessions/{session_id}` | `{"title"?, "status"?, "source_policy"?, "session_summary"?}` | `Session` |
| `DELETE /sessions/{session_id}` | – | 204; deletes its messages and links, not the sources |
| `GET /sessions/{session_id}/sources` | – | `Source[]` |
| `POST /sessions/{session_id}/sources` | `SourceCreate` | `Source` (201): creates or reuses the source, then attaches it |
| `POST /sessions/{session_id}/sources/upload` | multipart: `file`, `title`? | `Source` (201): like `POST /sources/upload`, then attaches it; 404 for an unknown session, checked before the file is read |
| `DELETE /sessions/{session_id}/sources/{source_id}` | – | 204; detaches only |

**Session**: `{ "id", "user_id", "title", "status": "draft | active | archived", "source_policy": "source_only | source_first", "session_summary", "last_activity_at", "created_at", "updated_at", "sources"? }`. `source_policy` defaults to `source_first`.

---

## 6. Chat (`/chat`)

### History — `GET /chat/sessions/{session_id}/messages`
Returns `ChatMessage[]` oldest first, or `[]` for a session that isn't the caller's:
```json
{
  "id": "…", "session_id": "…", "role": "user | assistant", "content": "markdown",
  "status": "completed", "created_at": "…",
  "citations": [{ "id": "…", "citation_index": 1, "source_id": "… | null", "locator": { "snippet": "…", "source_title": "…", "canonical_uri": "…", "chunk_index": 3, "source_type": "…", "retrieved_via": "library | session | graph | web" } }],
  "suggested_questions": ["…"], "research_trace": { … }, "answer_extras": { … }
}
```

### Send a message — `POST /chat/sessions/{session_id}/chat`
```json
{ "content": "How does corrective RAG decide to search the web?", "force_web_search": false }
```
A session that doesn't exist or isn't the caller's is a 404 before any streaming starts. Otherwise it responds with `text/event-stream`. Each event is one `data: <json>` line:

| Event | Example |
| --- | --- |
| Step started | `{"status": "step", "stage": "retrieve", "step": "Searching your library and knowledge graph", "source": "library"}` |
| Search finished | `{"status": "search", "source": "web", "query": "…", "found": 5}` |
| Evidence check | `{"status": "evidence", "sufficient": false, "reason": "…", "dropped": [3], "queries": ["…"], "retry": {"source": "web", "query": "…", "attempt": 1, "max_attempts": 2}}` |
| Answer text | `{"delta": "…"}` |
| Generation failed | `{"error_code": "rate_limited \| provider_credits \| provider_quota \| generation_failed", "error": "user-facing message"}` |
| Done | `{"done": true, "message_id": "…", "content": "…", "citations": [...], "suggestions": [...], "research_trace": {...}, "extras": {...}, "session_title"?: "…", "session_summary"?: "…"}` |

The user message is saved when the request starts; the assistant message is saved only when the answer completes. Field meanings for `research_trace` and `extras` are in [ai-workflows.md](ai-workflows.md#6-streaming-events-serviceschat_servicepy).

---

## 7. Knowledge graph (`/knowledge`)

The graph lives in Neo4j and is scoped to the current user.

| Method & path | Params / body | Returns |
| --- | --- | --- |
| `GET /knowledge/graphs` | `skip`, `limit` | `[{id, title, description, type: "universal" \| "document" \| "memory", source_id, node_count, edge_count, top_entities, created_at}]` |
| `GET /knowledge/graph` | `graph_id`: `universal` (default), `memory`, or one of the caller's source ids | `{"nodes": [...], "edges": [...]}`; empty for a source id that isn't the caller's |
| `GET /knowledge/graphs/{graph_id}` | – | same as above, by path |
| `POST /knowledge/graph/reextract` | – | `{"queued": n, "already_running": false}`; rebuilds the graph from every indexed source in the background (default limit 2/hour) |
| `POST /knowledge/memory/interact` | `{"action": "LIKES \| DISLIKES \| EXPLORED \| CURIOUS_ABOUT", "target_node_id", "target_label"?, "target_type"?: "Concept"}` | `{"status": "success"}`; any other `action` is a 422, and `target_type` is reduced to letters and digits |
| `GET /knowledge/memory/curiosity` | `refresh` (bool) | `{"suggested_prompts": [...], "curiosity_map": [...]}`; prompts are cached per user for 3 minutes; `suggested_prompts` is empty when the user has no knowledge graph yet |

---

## 8. Debug endpoints (`/graph-test`)

Authenticated helpers for exercising pipeline pieces directly. The frontend doesn't use them.

| Method & path | Body | Does |
| --- | --- | --- |
| `POST /graph-test/extract` | `{"text", "source_id", "source_title"}` | Runs graph extraction on the text |
| `POST /graph-test/retrieve` | `{"query", "top_k": 5}` | Hybrid search with cross-encoder reranking |
| `POST /graph-test/memory` | same as `/knowledge/memory/interact` | Records a memory interaction |
| `GET /graph-test/curiosity` | – | Suggested prompts |
