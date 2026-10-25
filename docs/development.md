# Local Development Guide

## Prerequisites
- **Python**: 3.12+
- **Node.js**: 20+
- **PostgreSQL**: 16+ with `pgvector` extension (or Docker Compose)
- **Package Managers**: `uv` or `pip` / `npm`

---

## 1. Environment Setup

Copy example environment variables:
```bash
cp .env.example .env
```

Key environment configuration:
- `DATABASE_URL`: `postgresql+asyncpg://postgres:postgres@localhost:5432/ai_research_workspace`
- `GEMINI_API_KEY`: API key from Google AI Studio
- `SECRET_KEY`: Random 32+ character string for JWT signing
- `MAX_RESEARCH_TASKS`: Maximum sub-questions per research session (default: 5)
- `MAX_AGENT_REVISIONS`: Maximum critique & reflection iterations (default: 2)
- `GOOGLE_CLIENT_ID`: OAuth 2.0 Web Client ID for "Sign in with Google" (optional — the button is hidden when empty)

### Google Sign-In

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. **Google Auth Platform → Branding** (OAuth consent screen): set app name, support email, and developer contact. Audience: **External**; while in *Testing*, add your Google accounts under **Test users**.
3. **Google Auth Platform → Clients → Create client**: type **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173` and `http://localhost` (plus your production origin later).
   - No redirect URI is needed (popup flow).
4. Copy the Client ID into `backend/.env` as `GOOGLE_CLIENT_ID=...`, then restart the backend.
5. Run `alembic upgrade head` (adds a unique constraint on `oauth_accounts`).

Flow: the frontend loads the Client ID from `GET /api/v1/auth/google/config`, Google Identity Services returns a signed ID token, and `POST /api/v1/auth/google` verifies it and issues the app's own JWT. Existing email/password accounts with the same verified email are linked automatically.

---

## 2. Running Locally with Docker Compose

Start the full stack (PostgreSQL + pgvector, FastAPI backend, React frontend):
```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`

---

## 3. Running Backend Locally

### Setup Python Environment
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

### Apply Database Migrations
```bash
alembic upgrade head
```

### Start Development Server
```bash
uvicorn app.main:app --reload --port 8000
```

---

## 4. Running Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

---

## 5. Testing

### Backend Unit & Integration Tests
```bash
cd backend
pytest tests/unit -v
pytest tests/integration -v
pytest tests/api -v
```

### Code Formatting & Linting
```bash
ruff check app tests
ruff format --check app tests
```

### Frontend Tests & Type Checking
```bash
cd frontend
npm run typecheck
npm test
npm run build
```
