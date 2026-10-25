# AI Research Workflows & Agent Architecture

Scout runs two LangGraph pipelines:

- **Research jobs** (`backend/app/agents/graph.py`, run by `services/research_job.py`): a multi-agent planner → workers → synthesizer → critic graph that produces a full report. Sections 1 and 2.
- **Research chat** (`backend/app/agent/`, run by `services/chat_service.py`): the streaming, cited chat used by the Copilot. It uses corrective RAG over the library, the knowledge graph and the web. Section 3.

## 1. LangGraph State Machine

The research process is modeled as a cyclic state graph in LangGraph:

```text
                    ┌──────────────┐
                    │    START     │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   Planner    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    Router    │
                    └──────┬───────┘
                           ↓
                 ┌─────────────────────┐
                 │ Parallel Fan-out     │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼───────────────┐
             ↓              ↓               ↓
        Web Worker     RAG Worker      GitHub Worker
             │              │               │
             └──────────────┼───────────────┘
                            ↓
                    ┌──────────────┐
                    │   Evidence   │
                    │  Processor   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │Contradiction │
                    │  Detector    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  Synthesizer │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    Critic    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ Revise?      │
                    └───┬──────┬───┘
                       yes     no
                        │       │
                        ↓       ↓
                  Synthesizer  Finalize
                        │       │
                        └───┐ ┌─┘
                            ↓ ↓
                           END
```

---

## 2. Agent Node Descriptions

### 1. Planner (`planner_node`)
- **Input**: `original_question`, `research_depth`, workspace document summary.
- **Responsibility**: Decomposes the high-level inquiry into atomic sub-questions.
- **Output**: Structured `ResearchPlan` containing sub-tasks with assigned types (`web`, `workspace`, `github`, `mixed`).

### 2. Router (`router_node`)
- **Responsibility**: Determines execution flow and tool routing for tasks.
- **Output**: Target worker routing plan with concurrency boundaries.

### 3. Parallel Research Workers
- **RAG / Retriever Worker (`retriever_node`)**: Executes semantic vector search with pgVector cosine distance over workspace document chunks.
- **Web Worker (`researcher_node`)**: Queries web search tools, downloads clean webpage text, and isolates factual excerpts.
- **GitHub Worker**: Retrieves source code repositories, READMEs, and technical files.

### 4. Evidence Processor (`evidence_node`)
- **Responsibility**: Normalizes raw worker responses into structured `EvidenceItem` models:
  - `claim`: Specific factual assertion.
  - `supporting_excerpt`: Verbatim quote from source.
  - `confidence`: Confidence metric (0.0 – 1.0).
  - `source_id`: ForeignKey linking back to verified `Source`.

### 5. Contradiction Detector (`contradiction_node`)
- **Responsibility**: Analyzes evidence across diverse sources to identify factual disagreements or nuances rather than arbitrarily suppressing opposing viewpoints.

### 6. Synthesizer (`synthesizer_node`)
- **Responsibility**: Composes a comprehensive research report using ONLY verified evidence items and explicitly formatted citation markers `[X]`.

### 7. Critic (`critic_node`) & Bounded Reflection Loop
- **Responsibility**: Evaluates the synthesized draft against the research question, verifies that every key claim maps to supporting evidence, and inspects for hallucinations.
- **Bounded Cycle**: If critique flags missing evidence or formatting gaps, it instructs revision up to `MAX_AGENT_REVISIONS = 2` iterations before forcing finalization.

---

## 3. Research Chat Pipeline (Corrective RAG)

Research chat answers one message at a time and streams the answer as it is written. It uses **corrective RAG**: hybrid retrieval, then an LLM evidence check that rewrites the query and switches source when the evidence does not answer the question. The graph is built in `app/agent/graph.py`, and its nodes are in `app/agent/nodes.py`.

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
          │       │ nothing relevant │ otherwise
          │       │ or web forced    │
          │       ↓                  │
          │  ┌──────────────┐        │
          ├─→│  web_search  │        │  Tavily
          │  └──────┬───────┘        │
          │         ↓                ↓
          │       ┌────────────────────┐
          │       │      evaluate      │  grade evidence, rewrite query, pick source
          │       └─────────┬──────────┘
          │                 │ route_after_evaluation
          │   insufficient  │  sufficient, skipped,
          └─────────────────┤  or no retries left
          (next_source)     ↓
                    ┌──────────────┐
                    │   generate   │  cited answer, streamed
                    └──────┬───────┘
                           ↓
                          END
```

The arrow back from `evaluate` goes to `retrieve` when the next source is the library, and to `web_search` when it is the web.

### 1. Retrieve (`retrieve_node`)
- **Query**: the rewritten `search_query` on a retry. Otherwise the latest message, prefixed with the previous user message when it is a short follow-up (under 12 words), so "what about its limitations?" still finds the right sources.
- **Knowledge graph**: `graph_engine.get_graph_evidence` returns the user's entities that match the query, with their neighbours, linked documents and memories. `get_related_sources_from_graph` returns the documents linked to those entities.
- **Library**: pgVector semantic candidates plus keyword (`ILIKE`) candidates across the user's library. For "summarize this" questions, the opening chunks of the session's attached sources are added too.
- **Relevance filter** (`select_relevant_chunks`): a chunk is kept when its similarity reaches `RAG_MIN_SIMILARITY` or its keyword overlap reaches `RAG_MIN_KEYWORD_OVERLAP`. Sources attached to the session or linked through the graph get a slightly lower bar and a score boost. Results are capped per source (`RAG_MAX_CHUNKS_PER_SOURCE`) and in total (`RAG_MAX_CHUNKS`).
- **On a retry**: new chunks are merged with earlier ones (`merge_chunks` dedupes by id, keeps the best score, and re-ranks), and earlier graph evidence is kept if the new query finds none.
- **Output**: `retrieved_chunks`, `graph_evidence`, `session_memories`, and a new entry appended to `searched`.

### 2. Web Search (`web_search_node`)
- **When**: on the first pass, if the user forced web search ("Web always") or a substantive message (4+ words) found nothing relevant in the library. On a retry, when the evidence check chose the web. Never without a Tavily key.
- **Query**: same rule as `retrieve`, so a retry searches the rewritten query.
- **Output**: results with a URL and snippet only, never placeholder results. On a retry, new pages are added to earlier results by URL. Appends to `searched`.

### 3. Evidence Check (`evaluate_evidence_node`)
- **Skipped** (goes straight to `generate`) when `CHAT_EVIDENCE_GRADING` is off, the retry limit has been reached, or the message is conversational (under 4 words).
- **Grader**: one call to `grader_llm` (temperature 0, tagged `evidence_grader` so its tokens are never streamed to the user). The prompt holds the last few turns, the searches already run with their result counts, and up to 10 numbered evidence excerpts. The grader is told to judge the evidence only, not its own knowledge.
- **Verdict** (JSON, read by `parse_verdict`):
  ```json
  {"sufficient": false, "reason": "Only tangential", "query": "RAG evaluation benchmarks 2026", "source": "web"}
  ```
  `query` is a standalone rewrite (pronouns resolved, key terms and synonyms, different from earlier searches). `source` is `"library"` when the library seems to cover the topic but the query missed it, or `"web"` when the topic is general, recent or absent from the library.
- **Retry plan** (`plan_retry`): use the grader's source if it gave one, otherwise switch away from the last source searched. Never repeat a `(source, query)` pair that already ran, and never pick the web without a Tavily key. If nothing new is left to try, answer instead.
- **Output on a retry**: `next_source`, `search_query`, and `retrieval_attempts + 1`. Otherwise `next_source = None`.
- **Fail-open**: if grading errors, hits the `pipeline:llm` rate limit, or returns unreadable JSON, the pipeline answers with the evidence it already has.

### 4. Generate (`generate_node`)
- **Numbered sources**: library sources first (grouped by document), then one knowledge-graph source, then web results. Each is labelled `LIBRARY`, `KNOWLEDGE GRAPH` or `WEB` in the prompt.
- **Prompt notes**: when only web evidence was found, the answer says the library doesn't cover the question. After a retry, the prompt lists every search that ran and asks the model to say plainly what is still missing rather than fill gaps with uncited claims.
- **Citations**: only sources the answer actually cites by `[n]` (or names, for library sources) are returned.

### 5. State (`app/agent/state.py`)
| Field | Meaning |
| --- | --- |
| `retrieved_chunks`, `graph_evidence`, `web_search_results` | Evidence, accumulated across attempts |
| `searched` | Every search run: `{"source": "library" \| "web", "query", "found"}` |
| `evidence_verdict` | The grader's last verdict |
| `search_query`, `next_source` | The rewritten query and the source chosen for the next attempt |
| `retrieval_attempts` | Retries run so far |

### 6. Streaming Events (`services/chat_service.py`)
The chat endpoint streams Server-Sent Events. Only the `generate` node's tokens are sent as `delta`; grader output stays internal (`_is_answer_token`).

| Event | Sent when | Fields |
| --- | --- | --- |
| `status: "step"` | A node starts | `stage` (node name), `step` (label); `source` for searches, plus `query` on a retry |
| `status: "search"` | A search finishes | `source`, `query`, `found` |
| `status: "evidence"` | The evidence check finishes | `sufficient` (`null` when skipped), `reason`; `retry: {source, query, attempt, max_attempts}` and a `step` label when retrying |
| `delta` | Answer tokens | text |
| `done` | Answer saved | `content`, `citations`, `suggestions`, `research_trace` |

`research_trace` (`{"searches": [...], "retries": n, "verdict": {...}}`) is saved on the assistant message (`chat_messages.research_trace`). The frontend builds its live research timeline from these events (`features/workspace/copilot/researchProgress.ts`) and shows the saved trace as a collapsible "Research path" under the answer.

### 7. Settings & Cost
| Setting | Default | Effect |
| --- | --- | --- |
| `CHAT_EVIDENCE_GRADING` | `True` | Turns the evidence check, rewriting and retries on or off |
| `CHAT_MAX_RETRIEVAL_RETRIES` | `2` | Extra searches allowed per message after the first |
| `RAG_MIN_SIMILARITY` / `RAG_MIN_KEYWORD_OVERLAP` | `0.55` / `0.5` | Relevance bar for library chunks |
| `RAG_MAX_CHUNKS` / `RAG_MAX_CHUNKS_PER_SOURCE` | `8` / `3` | Library chunk caps |
| `MAX_RESULTS_PER_SEARCH` | `5` | Web results per search |

A message makes at most `CHAT_MAX_RETRIEVAL_RETRIES` grading calls (2 by default) in addition to the answer, because grading is skipped once the limit is reached. Grading and answers share the per-user `PIPELINE_LLM_RPM` limit.

### 8. Limits
- The first route (library first, web as a fallback) is a fixed rule, not a model decision.
- The model does not call search tools itself or break the question into sub-questions; for that, use a research job (sections 1–2).

Tests for this pipeline are in `backend/tests/unit/test_research_chat.py`.
