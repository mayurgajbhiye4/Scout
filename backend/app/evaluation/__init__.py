"""RAGAS evaluation layer: metric scoring, synthetic test data, offline runs and online monitoring.

- judge.py    Gemini judge LLM + embeddings that RAGAS metrics run on
- metrics.py  which metrics run where, scoring one turn, summarizing many
- online.py   sampled background scoring of production chat turns (answer_evaluations table)
- cli.py      `python -m app.evaluation.cli generate-testset | run | report`

See docs/evaluation.md for the guide and checklist.
"""
