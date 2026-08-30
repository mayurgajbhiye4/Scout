.PHONY: help up down build migrate test lint format

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
up: ## Start all services
	docker compose up --build -d

down: ## Stop all services
	docker compose down

logs: ## Tail all logs
	docker compose logs -f

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
migrate: ## Run Alembic migrations
	cd backend && alembic upgrade head

migrate-create: ## Create a new migration (usage: make migrate-create msg="add xyz")
	cd backend && alembic revision --autogenerate -m "$(msg)"

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------
backend-dev: ## Run backend dev server locally
	cd backend && uvicorn app.main:app --reload --port 8000

backend-test: ## Run backend tests
	cd backend && python -m pytest tests/ -v --tb=short

backend-lint: ## Lint backend
	cd backend && ruff check .

backend-format: ## Format backend
	cd backend && ruff format .

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
frontend-dev: ## Run frontend dev server locally
	cd frontend && npm run dev

frontend-test: ## Run frontend tests
	cd frontend && npm test

frontend-lint: ## Lint frontend
	cd frontend && npm run lint

frontend-build: ## Build frontend for production
	cd frontend && npm run build

# ---------------------------------------------------------------------------
# Combined
# ---------------------------------------------------------------------------
test: backend-test frontend-test ## Run all tests

lint: backend-lint frontend-lint ## Run all linters

install: ## Install all dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install
