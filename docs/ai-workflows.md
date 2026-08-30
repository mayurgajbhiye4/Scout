# AI Research Workflows & Agent Architecture

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
