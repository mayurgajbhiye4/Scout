# AI Research Workflows & Agent Architecture

## Research Chat Pipeline (Agentic Corrective RAG)

Research chat answers one message at a time and streams the answer as it is written. It uses **agentic corrective RAG**. Hybrid retrieval runs first. Then an LLM evidence check grades what was found, sets aside off-topic sources, and decides the next step: answer, search the library again, or search the web, using up to three queries it writes itself. Code enforces the guardrails: a retry budget, no repeated searches, and the web only when it is configured. The graph is built in `app/agent/graph.py`, and its nodes are in `app/agent/nodes.py`.

```text
                    ┌──────────────┐
                    │    START     │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
          ┌────────→│   retrieve   │  library (pgVector) + knowledge graph (Neo4j)
          │         └──────┬───────┘
          │                │ should_search_web
          │       ┌────────┴─────────┐
          │       │ user asked for   │ otherwise
          │       │ web search       │
          │       ↓                  │
          │  ┌──────────────┐        │
          ├─→│  web_search  │        │  Tavily
          │  └──────┬───────┘        │
          │         ↓                ↓
          │       ┌────────────────────┐
          │       │      evaluate      │  grade, drop off-topic sources, pick next action
          │       └─────────┬──────────┘
          │                 │ route_after_evaluation
          │  action library │  answer, skipped,
          └──── or web ─────┤  or no retries left
          (next_source)     ↓
                    ┌──────────────┐
                    │   generate   │  cited answer, streamed
                    └──────┬───────┘
                           ↓
                          END
```

Every research turn is graded, including a first-pass library hit (`CHAT_GRADE_FIRST_PASS`). The grader picks what runs next: `retrieve` with new queries, `web_search` with its own queries, or `generate`. This repeats up to `CHAT_MAX_RETRIEVAL_RETRIES` times. When the budget runs out, the web is searched once more as a top-up if it hasn't been searched yet. The answer combines everything that wasn't set aside.

### 1. Retrieve (`retrieve_node`)
- **Queries**: on a retry, the `search_queries` the grader planned, each searched in turn (one DB session) with one shared embedding call. Otherwise this turn's message, prefixed with the previous user message when it is a short follow-up (under 12 words) and that message isn't small talk (under 4 words), so "what about its limitations?" still finds the right sources.
- **Knowledge graph**: `graph_engine.get_graph_evidence` returns the user's entities that match the query, with their neighbours, linked documents and memories. `get_related_sources_from_graph` returns the documents linked to those entities.
- **Library**: pgVector semantic candidates plus keyword (`ILIKE`) candidates, most query terms matched first, across the user's library. For "summarize this" questions, the opening chunks of the session's attached sources are added too.
- **Relevance filter** (`select_relevant_chunks`): a chunk is kept when its similarity reaches `RAG_STRONG_SIMILARITY`, or reaches `RAG_MIN_SIMILARITY` while covering `RAG_MIN_BAND_COVERAGE` of the question's keywords, or covers `RAG_MIN_KEYWORD_OVERLAP` of them at any similarity. Keywords match as whole words (plurals allowed), and coverage weights each one by its rarity (IDF) across the user's library chunks, so a chunk that only shares generic words ("coding", "AI") with the question doesn't count. Unrelated chunks score up to ~0.64 with this embedding model, so similarity alone only decides above that. Sources attached to the session get a slightly lower bar and a score boost; graph-linked sources get a score boost only. Results are capped per source (`RAG_MAX_CHUNKS_PER_SOURCE`) and in total (`RAG_MAX_CHUNKS`).
- **On a retry**: new chunks are merged with earlier ones (`merge_chunks` dedupes by id, keeps the best score, and re-ranks). Sources in `rejected` are skipped. Earlier graph evidence is kept if the new queries find none.
- **Output**: `retrieved_chunks`, `graph_evidence`, `session_memories`, and one entry per query appended to `searched`.

### 2. Web Search (`web_search_node`)
- **When**: on the first pass if the user forced web search ("Web always"). Otherwise when the grader picks the web, or once as a top-up when the retry budget runs out and the web hasn't been searched yet. Never without a Tavily key.
- **Queries**: same rule as `retrieve`. The grader's queries run concurrently.
- **Output**: results with a URL and snippet only, never placeholder results. On a retry, new pages are added to earlier results by URL, except pages in `rejected`. Appends one entry per query to `searched`.

### 3. Evidence Check (`evaluate_evidence_node`)
- **Goes straight to `generate`** when the message is conversational (under 4 words), or when the first library search found chunks and `CHAT_GRADE_FIRST_PASS` is off.
- **Goes to the web fallback without grading** when `CHAT_EVIDENCE_GRADING` is off or the retry budget is spent.
- **Grader**: one call to `grader_llm` (temperature 0, tagged `evidence_grader` so its tokens are never streamed to the user). The prompt holds:
  - the last few turns;
  - the searches already run, with their result counts;
  - up to 10 numbered evidence excerpts;
  - the search tools available (web only with a Tavily key).

  The grader is told to judge the evidence only, not its own knowledge.
- **Verdict** (JSON, read by `parse_verdict`):
  ```json
  {"sufficient": false, "reason": "Needs recent results", "action": "web",
   "queries": ["RAG evaluation benchmarks 2026"], "drop": [3]}
  ```
  - `action` is `answer`, `library` or `web`. A sufficient verdict always answers.
  - `queries` holds 1–3 standalone queries (pronouns resolved, key terms and synonyms), with several only for questions that have distinct parts.
  - `drop` lists the source numbers that are off-topic.
  - Replies in the older `{"sufficient", "reason", "query"}` format still parse, as a library retry.
- **Knowledge refinement** (`refine_evidence`): the dropped library sources and web pages are removed from the evidence and added to `rejected`, so later searches can't bring them back. The knowledge-graph source is never dropped. A verdict that says "sufficient" but drops every source is contradictory, so the evidence is kept.
- **Next search** (`next_search`, `plan_queries`): the grader's tool, if available, with any queries already run on that tool removed. If nothing new is left there, the other tool is tried; if nothing is left there either, the turn answers.
- **Output on a search**: `next_source`, `search_queries` (`search_query` is the first), and `retrieval_attempts + 1`. On the web fallback, `next_source = "web"`. Otherwise `next_source = None`.
- **Fail-open**: if grading errors, hits the `pipeline:llm` rate limit, or returns unreadable JSON, the planned search is skipped and the web fallback runs.

### 4. Generate (`generate_node`)
- **Numbered sources**: library sources first (grouped by document), then one knowledge-graph source, then web results. Each is labelled `LIBRARY`, `KNOWLEDGE GRAPH` or `WEB` in the prompt.
- **Answer format**: one synthesized paragraph (2-4 sentences, direct answer first), then 2-5 one-line bullets, or none when the paragraph says it all. No headings, tables, or notes about which sources were or weren't used. The reference list is appended by `chat_service` (name + link only), never written by the model.
- **Prompt notes**: when library and web evidence are both present, the prompt asks for one combined answer. After a retry, the prompt lists every search that ran and asks the model to name what is still missing in one bullet rather than fill gaps with uncited claims.
- **Follow-up questions**: in the same call, the model writes `FOLLOW_UPS_MARKER` and then up to `CHAT_SUGGESTION_COUNT` one-line questions about the sources it used, without quoting their titles. `split_follow_ups` returns them as `follow_ups`, and the answer message keeps only the text before the marker. `chat_service.FollowUpStreamFilter` holds the marker and everything after it out of the token stream, even when the marker is split across deltas. When the model writes none, `suggestion_service.build_suggestions` builds short, title-free fallbacks from the graph and library evidence.
- **Citations**: only sources the answer actually cites by `[n]` (or names, for library sources) are returned. The chat renders `[n]` as superscripts.

### 5. State (`app/agent/state.py`)
| Field | Meaning |
| --- | --- |
| `retrieved_chunks`, `graph_evidence`, `web_search_results` | Evidence, accumulated across attempts, minus what the grader set aside |
| `searched` | Every search run: `{"source": "library" \| "web", "query", "found"}` |
| `evidence_verdict` | The grader's last verdict |
| `search_queries`, `search_query`, `next_source` | The planned queries (and the first one) and the tool chosen for the next attempt |
| `rejected` | Library source ids and web URLs set aside as off-topic |
| `retrieval_attempts` | Retries run so far |
| `follow_ups` | Follow-up questions the answer model wrote after the marker |

### 6. Streaming Events (`services/chat_service.py`)
The chat endpoint streams Server-Sent Events. Only the `generate` node's tokens are sent as `delta`; grader output stays internal (`_is_answer_token`).

| Event | Sent when | Fields |
| --- | --- | --- |
| `status: "step"` | A node starts | `stage` (node name), `step` (label); `source` for searches, plus `query` on a retry |
| `status: "search"` | A search finishes | `source`, `query` (several queries joined with ` · `), `found` (summed) |
| `status: "evidence"` | The evidence check finishes | `sufficient` (`null` when skipped), `reason`; `dropped` when sources were set aside; `queries`, `retry: {source, query, attempt, max_attempts}` and a `step` label when searching again |
| `delta` | Answer tokens | text |
| `done` | Answer saved | `content`, `citations`, `suggestions`, `research_trace` |

`research_trace` (`{"searches": [...], "retries": n, "verdict": {...}}`) is saved on the assistant message (`chat_messages.research_trace`). The frontend builds its live research timeline from these events (`features/workspace/copilot/researchProgress.ts`) while the answer is being researched. The saved trace isn't shown under finished answers.

### 7. Settings & Cost
| Setting | Default | Effect |
| --- | --- | --- |
| `CHAT_EVIDENCE_GRADING` | `True` | Turns the evidence check, refinement and planned searches on or off |
| `CHAT_GRADE_FIRST_PASS` | `True` | Grades a first-pass library hit too (one grader call per research turn); off answers it ungraded |
| `CHAT_MAX_RETRIEVAL_RETRIES` | `2` | Searches the grader may order per message after the first |
| `CHAT_MAX_SEARCH_QUERIES` | `3` | Queries per planned search |
| `RAG_MIN_SIMILARITY` / `RAG_STRONG_SIMILARITY` | `0.57` / `0.66` | Similarity band where a chunk also needs keyword coverage, and the bar above which similarity alone is enough. Tuned for `gemini-embedding-001` (re-measure if the model changes) |
| `RAG_MIN_BAND_COVERAGE` / `RAG_MIN_KEYWORD_OVERLAP` | `0.5` / `0.8` | IDF-weighted keyword coverage needed inside the band, and enough to keep a chunk at any similarity |
| `RAG_MAX_CHUNKS` / `RAG_MAX_CHUNKS_PER_SOURCE` | `8` / `3` | Library chunk caps |
| `MAX_RESULTS_PER_SEARCH` | `5` | Web results per search |

A message makes at most `CHAT_MAX_RETRIEVAL_RETRIES` grading calls (1 by default) in addition to the answer, because grading is skipped once the limit is reached. Grading and answers share the per-user `PIPELINE_LLM_RPM` limit.

### 8. Limits
- The first route (library first, web as a fallback) is a fixed rule, not a model decision.
- The model does not call search tools itself or break the question into sub-questions.

Tests for this pipeline are in `backend/tests/unit/test_research_chat.py`.
