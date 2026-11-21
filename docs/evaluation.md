# Evaluation (RAGAS)

How to measure, test and monitor the quality of research chat answers with [RAGAS](https://docs.ragas.io).

The evaluation layer lives in `backend/app/evaluation/`:

| File | What it does |
| --- | --- |
| `judge.py` | The judge model the metrics run on (Gemini), and the synthetic test set generator |
| `metrics.py` | Which metrics run where, scoring one chat turn, summarizing many, alert floors |
| `online.py` | Scores a sample of production answers in the background and stores the scores |
| `cli.py` | `generate-testset`, `run` and `report` commands |
| `db/models/answer_evaluation.py` | The `answer_evaluations` table that online scores go into |

All commands below run from `backend/` with the venv's Python:

```powershell
cd backend
myenv\Scripts\python.exe -m app.evaluation.cli --help
```

---

## 1. Installation

`ragas==0.4.*` is in `backend/requirements.txt`, together with `rapidfuzz` (synthetic test sets need it,
but ragas doesn't declare it). RAGAS pulls in `langchain`, `langchain-community`, `openai`, `datasets` and
`pandas`, and needs newer versions of three packages the backend pins:

| Package | Was | Now | Required by |
| --- | --- | --- | --- |
| `langchain-core` | 1.6.0 | 1.8.3 | `langchain` 1.5 needs `>=1.8` |
| `langgraph` | 1.2.11 | 1.2.23 | `langchain` 1.5 needs `>=1.2.12` |
| `pydantic-settings` | 2.7 | 2.16 | `langchain-community` needs `>=2.10` |

The whole backend test suite passes on the new versions. To install on a fresh machine:

```powershell
myenv\Scripts\python.exe -m pip install -r requirements.txt
myenv\Scripts\alembic.exe upgrade head      # creates answer_evaluations
```

On this PC, pip needs `--use-feature=truststore` because HTTPS is intercepted.

### The judge model

Every metric is scored by an LLM "judge". It is Gemini, called through Google's OpenAI-compatible endpoint
(RAGAS' `llm_factory` drives it with instructor's OpenAI client), with `GEMINI_API_KEY`. The native
google-genai route needs a newer `instructor`, which needs `openai` 3.x, which `langchain-openai` doesn't
allow yet.

| Setting | Default | Notes |
| --- | --- | --- |
| `EVAL_JUDGE_MODEL` | `LLM_MODEL` | A stronger judge than the answer model gives steadier scores |
| `EVAL_JUDGE_MAX_TOKENS` | 8192 | Thinking models spend output tokens on reasoning; RAGAS' default of 1024 cut the judge's JSON off (`IncompleteOutputException`) |
| `EVAL_JUDGE_REASONING_EFFORT` | `low` | Faster, and scored as well as more thinking did. Set it empty for models that reject the parameter (e.g. `gemini-2.0-flash`) |

---

## 2. Metrics: what they mean and how to read them

Every score is between 0 and 1, and higher is better.

| Metric | Question it answers | Needs a reference? | Where it runs | A low score means |
| --- | --- | --- | --- | --- |
| **Faithfulness** | Is every claim in the answer supported by the retrieved sources? | No | online + offline | Hallucination: the model added facts the sources don't contain |
| **Answer relevancy** | Does the answer address the question that was asked? | No | online + offline | Off-topic, evasive or padded answers |
| **Context precision** | Were the retrieved sources useful? | No online (judged against the answer), yes offline | online + offline | Retrieval noise: off-topic chunks ranked high |
| **Context recall** | Did retrieval find everything the reference answer needs? | Yes | offline | Retrieval misses: relevant documents not found |
| **Factual correctness** | Does the answer agree with the reference answer? | Yes | offline | Wrong or incomplete answer |

"Retrieved contexts" are exactly what the answer model saw: the numbered source blocks (library chunks,
knowledge-graph facts, web results) that `generate_node` builds. It returns them as `contexts`.

### Diagnosing with the metrics together

| Pattern | Likely cause | Where to look |
| --- | --- | --- |
| Low context recall, low faithfulness | Retrieval missed the evidence, so the model filled the gap | `RAG_MIN_SIMILARITY`, keyword thresholds, chunking, the grader's retries |
| High recall, low precision | The right chunks come back, buried in noise | `RAG_MAX_CHUNKS`, relevance thresholds, the reranker |
| Good contexts, low faithfulness | The model ignores or goes beyond its sources | `RESEARCH_SYSTEM_PROMPT` citation rules, temperature |
| Good faithfulness, low factual correctness | Faithful to the wrong or incomplete sources | Library coverage, web fallback |
| Low answer relevancy | The answer drifts or hedges | Prompt, answer-length limits |
| Many answers with 0 contexts | Library search finds nothing and the web is off or failing | Embeddings, `TAVILY_API_KEY` |

### Reading scores responsibly

- **One score is noisy.** In testing, the same answer scored 0.67, 0.86 and 0.78 faithfulness with three
  judge settings. Compare means over 20 or more questions, never single answers.
- **Keep the judge fixed** when comparing runs. A different judge model makes old and new scores incomparable
  (each run records `judge_model`).
- **Read the worst answers.** The metrics tell you where to look; reading the answer tells you why.

---

## 3. Synthetic evaluation data

RAGAS builds a knowledge graph from your documents (summaries, headlines, entities, links between documents)
and writes questions with reference answers from it:

- **single_hop_specific**: a fact from one document ("What language is node-redis for?")
- **multi_hop_abstract**: a theme across documents ("How do these sources approach agent memory?")
- **multi_hop_specific**: a precise question that needs two documents together

Questions are written in the voice of three personas that fit this app (graduate researcher, student,
industry analyst; see `PERSONAS` in `judge.py`), with varied style and length. Some are deliberately
misspelled or terse, to test robustness.

```powershell
# 20 questions from one user's 30 most recent indexed sources
myenv\Scripts\python.exe -m app.evaluation.cli generate-testset --user-email you@example.com --size 20

# Small library (a handful of documents): single-document questions only
myenv\Scripts\python.exe -m app.evaluation.cli generate-testset --user-email you@example.com --size 10 --single-hop
```

This writes `eval_data/testset.jsonl` (what `run` reads) and `eval_data/testset.csv` (for reading in a
spreadsheet). Generation sends the documents to Gemini, as ingestion already does.

### Making it high quality

1. **Review every row.** Delete questions that are trivial, ambiguous, or that the documents don't answer.
   Fix reference answers that are wrong. A bad reference answer makes every later run look worse than it is.
2. **Add golden questions by hand**: real questions users asked, past bugs, edge cases. Use the same format;
   only `question` is required:
   ```json
   {"question": "Compare HNSW and IVF indexes in my notes", "reference": "HNSW ... IVF ...", "synthesizer": "manual"}
   ```
   Questions with no `reference` skip context recall and factual correctness.
3. **Cover the whole pipeline**: questions your library answers, questions only the web answers (run with
   `--web`), follow-ups, small talk ("thanks!"), and questions nothing answers (the right answer says so).
4. **Size it well**: 20–50 questions to start, more for the areas you're changing. Generating costs about
   10–20 Gemini calls per question.
5. **Freeze it.** Commit `eval_data/testset.jsonl` and only change it on purpose. Comparisons need the same
   questions. (`eval_data/runs/` is gitignored.)

---

## 4. Offline evaluation runs

`run` answers each test question with the real research agent (the same LangGraph pipeline as chat, against
the user's library), scores it on all five metrics, and saves the results.

```powershell
myenv\Scripts\python.exe -m app.evaluation.cli run --user-email you@example.com

# Compare with an earlier run
myenv\Scripts\python.exe -m app.evaluation.cli run --user-email you@example.com `
    --baseline eval_data\runs\20261119-212640\summary.json

# Quick check while iterating: first 5 questions, cheaper metrics only
myenv\Scripts\python.exe -m app.evaluation.cli run --user-email you@example.com --limit 5 `
    --metrics faithfulness,answer_relevancy
```

Output:

```
metric                    n    mean  median     p10     min   vs base
---------------------------------------------------------------------
answer_relevancy          3   0.862   0.858   0.815   0.815    +0.046
context_precision         2   0.500   0.500   0.000   0.000    -0.500   << below floor
context_recall            2   0.750   0.750   0.750   0.750    +0.250
factual_correctness       3   0.223   0.000   0.000   0.000    +0.223
faithfulness              2   0.900   0.900   0.800   0.800
```

`n` is how many questions the metric applied to. Context metrics skip answers with no sources, and
reference metrics skip questions with no reference. `p10` is the score of the worst 10%, which shows how bad
the bad answers get, where the mean can hide them.

Each run saves to `eval_data/runs/<timestamp>/`:

- `summary.json`: means and percentiles per metric, models used, alerts. This is what `--baseline` reads.
- `results.csv`: one row per question with every score, the answer, the reference and errors. Open it,
  sort by a metric, and read the lowest rows.
- `results.jsonl`: the same, plus the full retrieved contexts and the searches the agent ran.

### Analysing results

```python
import pandas as pd
df = pd.read_csv("eval_data/runs/20261119-212938/results.csv")
df.sort_values("faithfulness").head(10)[["question", "faithfulness", "contexts", "answer"]]
df[df.contexts == 0]                       # questions retrieval found nothing for
df.groupby(df.contexts > 0)[["faithfulness", "answer_relevancy"]].mean()
```

### The improvement loop

1. Run on `main` and keep the `summary.json` as the baseline.
2. Change one thing (a threshold, the prompt, chunk size, the model).
3. Run again with `--baseline`. Keep the change when the metrics you targeted improve and the others don't
   drop.
4. Read the five worst answers of each run, every time.

### In CI

`--fail-on-alert` exits with 1 when a metric's mean is below its floor (section 5), so a scheduled job can
block a release. It needs a database with a seeded library and `GEMINI_API_KEY`. Run it nightly or before a
release rather than on every push: a 30-question run takes a few minutes and a few hundred Gemini calls.

---

## 5. Online monitoring (production)

When enabled, after each chat answer is saved and streamed, a sample of turns is scored in the background
with the three reference-free metrics:

```
chat answer saved → done event sent → sampled? → background task: faithfulness, answer relevancy,
context precision → answer_evaluations row + one "ragas_online_eval" log line
```

It never affects the user's reply. It runs after the done event, uses its own DB session, is capped by
`EVAL_ONLINE_TIMEOUT_SECONDS`, and logs failures instead of raising them.

| Setting | Default | Notes |
| --- | --- | --- |
| `EVAL_ONLINE_ENABLED` | `false` | Turn on in `.env` |
| `EVAL_ONLINE_SAMPLE_RATE` | 0.1 | Share of answers scored. Each one costs about 5–10 judge calls plus embeddings |
| `EVAL_ONLINE_TIMEOUT_SECONDS` | 120 | Longer evaluations are dropped |
| `EVAL_ALERT_FAITHFULNESS` | 0.7 | Floors for the report and `--fail-on-alert` |
| `EVAL_ALERT_ANSWER_RELEVANCY` | 0.7 | |
| `EVAL_ALERT_CONTEXT_PRECISION` | 0.5 | |

Start with 1.0 in development to see it working, then 0.05–0.2 in production depending on traffic and Gemini
quota. The judge shares `GEMINI_API_KEY` and its quota with chat itself.

### Viewing the scores

```powershell
myenv\Scripts\python.exe -m app.evaluation.cli report --days 7
```

This prints the summary per metric, the number of answers with errors or no sources, a daily trend (to
spot a drop after a deploy or prompt change), the five least faithful answers with their session and
message ids, and alerts. `--fail-on-alert` makes it exit 1 for a cron job or scheduled CI check.

For dashboards, query the table directly:

```sql
-- Daily means
SELECT date_trunc('day', created_at) AS day, count(*),
       avg(faithfulness), avg(answer_relevancy), avg(context_precision)
FROM answer_evaluations GROUP BY 1 ORDER BY 1 DESC;

-- Likely hallucinations, with the answer text
SELECT e.faithfulness, e.created_at, m.content
FROM answer_evaluations e JOIN chat_messages m ON m.id = e.message_id
WHERE e.faithfulness < 0.5 ORDER BY e.created_at DESC LIMIT 20;
```

Or alert from logs: in production every scored answer writes one JSON log line, `ragas_online_eval`, with
the three scores, so a log platform (Datadog, Grafana Loki, CloudWatch) can chart and alert on them without
touching the database.

### Using what monitoring finds

- **Low-scoring answers become test cases.** Add the question to `testset.jsonl` with a correct reference
  answer, so the fix is checked in every offline run from then on.
- **A sudden drop** in the daily trend after a deploy points at that deploy. Run offline with the previous
  summary as `--baseline` to confirm it.
- **Many answers with no sources** means retrieval or the web fallback is failing (for example an expired
  `TAVILY_API_KEY`), not that the model got worse.

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `IncompleteOutputException` in `errors` | Raise `EVAL_JUDGE_MAX_TOKENS` or lower `EVAL_JUDGE_REASONING_EFFORT` |
| `400 ... reasoning_effort` | The judge model doesn't support it: set `EVAL_JUDGE_REASONING_EFFORT=` (empty) |
| `JudgeUnavailable` | `GEMINI_API_KEY` is missing |
| `rapidfuzz is required` | `pip install -r requirements.txt` |
| `generate-testset`: "No compatible query synthesizers" | Too few or too short documents for multi-hop: add `--single-hop` or more sources |
| Few samples generated | Gemini refused some documents (safety or recitation); they're skipped. Generate a larger set |
| Online report is empty | `EVAL_ONLINE_ENABLED=true`, sample rate above 0, then restart the server |
| `answer_evaluations` already exists during `alembic upgrade` | Handled: the app's startup `create_all` made it first; the migration only adds missing indexes |

---

## 7. Checklist

### Setup
- [ ] `pip install -r backend/requirements.txt` (ragas, rapidfuzz, updated pins)
- [ ] `alembic upgrade head` (creates `answer_evaluations`)
- [ ] `GEMINI_API_KEY` set; optionally set `EVAL_JUDGE_MODEL` to a stronger model
- [ ] `pytest backend/tests/unit/test_evaluation.py` passes

### Metrics baseline
- [ ] Generate a test set of 20–50 questions from a representative library
- [ ] Review it by hand: delete weak questions, fix wrong references
- [ ] Add 5–10 golden questions: real user questions, past failures, "not in my library" cases
- [ ] Commit `eval_data/testset.jsonl`
- [ ] Run the offline evaluation and keep its `summary.json` as the baseline
- [ ] Read the 5 worst answers per metric and note the failure patterns (section 2)
- [ ] Set the `EVAL_ALERT_*` floors from the baseline (for example, the baseline mean minus 0.1)

### Improvement loop (every pipeline, prompt or model change)
- [ ] Change one thing
- [ ] `run --baseline <previous summary.json>`
- [ ] Keep the change only if the target metric improves and the others hold
- [ ] Update the baseline when a change is kept

### Production monitoring
- [ ] `EVAL_ONLINE_ENABLED=true` with `EVAL_ONLINE_SAMPLE_RATE=1.0` in development; confirm rows appear with `report`
- [ ] In production, set the sample rate to fit traffic and Gemini quota (0.05–0.2)
- [ ] Schedule `report --days 1 --fail-on-alert` daily (cron or a scheduled CI job), or alert on the `ragas_online_eval` log line
- [ ] Each week, read the least faithful answers and add the real failures to the test set
- [ ] After each deploy, check the daily trend for a drop

### Ongoing
- [ ] Re-run the offline evaluation nightly or before each release (`--fail-on-alert` in CI)
- [ ] Regenerate or extend the test set when the library or the product's use cases change
- [ ] Keep the judge model fixed across comparisons; when changing it, re-run the baseline first
