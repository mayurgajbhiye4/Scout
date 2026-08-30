# AI Research Workspace

An intelligent workspace designed for deep, autonomous research. 
Powered by LangGraph and Google Gemini.

## Overview

The AI Research Workspace is a unified environment where you can:
1. **Ingest** documents, URLs, and text into a structured workspace.
2. **Retrieve** context semantically using pgVector.
3. **Research** questions autonomously via a multi-agent LangGraph workflow.
4. **Review** cited, markdown-formatted reports backed by hard evidence.

## Architecture

This is a monorepo consisting of:
- **Backend:** FastAPI, SQLAlchemy 2.0, Asyncpg, pgVector, LangGraph, Google GenAI SDK.
- **Frontend:** React, Vite, MUI 9, TanStack Query, React Router, React Hook Form, Zod.

## Quickstart

1. Copy `.env.example` to `.env` and fill in your `GEMINI_API_KEY` and Postgres URL.
2. Start the database:
   ```bash
   docker-compose up -d db
   ```
3. Run migrations:
   ```bash
   cd backend
   alembic upgrade head
   ```
4. Start backend:
   ```bash
   uvicorn app.main:app --reload
   ```
5. Start frontend:
   ```bash
   cd frontend
   npm run dev
   ```

See the `docs/` folder for more detailed architecture and workflow documentation.
