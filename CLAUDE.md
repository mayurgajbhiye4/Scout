# Working in this repo

- Never read `frontend/src/features/landing/LandingPage.tsx` in full (~2,200 lines). Search it with Grep, or Read only the line range you need using offset/limit.
- Never read `frontend/src/features/workspace/canvas/GraphCanvas.tsx` in full. Search it with Grep, or Read only the line range you need using offset/limit.
- Before changing chat streaming or source ingestion, read the state machines in `docs/architecture.md` section 5. Write `Source.status` only through `transition_source()`.
