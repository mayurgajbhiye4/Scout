"""
Application configuration via Pydantic Settings.

Reads from environment variables or a .env file. All secrets and tunables
are declared here so the rest of the codebase never reads os.environ directly.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application settings — single source of truth for configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-to-a-random-64-char-string"
    DEBUG: bool = True

    # ── Database ─────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://airw:airw_dev_password@localhost:5432/airw_dev"
    DATABASE_URL_SYNC: str = "postgresql://airw:airw_dev_password@localhost:5432/airw_dev"

    # ── AI / LLM ─────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.0-flash"
    EMBEDDING_MODEL: str = "text-embedding-004"
    EMBEDDING_DIMENSIONS: int = 768

    # ── External Tools ───────────────────────────────────────────────────
    TAVILY_API_KEY: str = ""
    GITHUB_TOKEN: str = ""

    # ── CORS ─────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # ── Limits & Guardrails ──────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_RESEARCH_TASKS: int = 5
    MAX_RESULTS_PER_SEARCH: int = 5
    MAX_RETRIEVED_CHUNKS: int = 20
    MAX_AGENT_REVISIONS: int = 2
    MAX_RESEARCH_DURATION_SECONDS: int = 300

    # ── Research chat retrieval ──────────────────────────────────────────
    # A library chunk counts as relevant at this cosine similarity, or when it contains
    # RAG_MIN_KEYWORD_OVERLAP of the question's keywords. With nothing relevant, chat falls back to the web.
    RAG_MIN_SIMILARITY: float = 0.55
    RAG_MIN_KEYWORD_OVERLAP: float = 0.5
    RAG_MAX_CHUNKS: int = 8
    RAG_MAX_CHUNKS_PER_SOURCE: int = 3
    # Before answering, an LLM checks whether the evidence actually answers the question. When it doesn't,
    # the query is rewritten and searched again, switching between the library (RAG + knowledge graph) and the web.
    CHAT_EVIDENCE_GRADING: bool = True
    CHAT_MAX_RETRIEVAL_RETRIES: int = 2

    # ── Research chat answers ────────────────────────────────────────────
    # Hard cap on answer length (lines), enforced while streaming; the reference list is extra.
    CHAT_MAX_ANSWER_LINES: int = 300
    # Upper bound on generated tokens so a runaway answer can't burn quota
    CHAT_MAX_OUTPUT_TOKENS: int = 4096
    # Follow-up questions suggested after each answer (built from graph + retrieval, no LLM call)
    CHAT_SUGGESTION_COUNT: int = 3

    # ── Rate Limiting ────────────────────────────────────────────────────
    RATE_LIMIT_ENABLED: bool = True

    # Auth endpoints (per minute)
    RATE_LIMIT_AUTH_LOGIN: int = 5
    RATE_LIMIT_AUTH_REGISTER: int = 3
    RATE_LIMIT_AUTH_ME: int = 60
    RATE_LIMIT_AUTH_LOGOUT: int = 20
    RATE_LIMIT_AUTH_GOOGLE: int = 10

    # User profile (per minute)
    RATE_LIMIT_USERS_UPDATE: int = 15

    # Sources & Ingestion (per minute)
    RATE_LIMIT_SOURCES_INGEST: int = 10
    RATE_LIMIT_SOURCES_READ: int = 60
    RATE_LIMIT_SOURCES_DELETE: int = 20

    # Chat & Sessions (per minute)
    RATE_LIMIT_CHAT_STREAM: int = 15
    RATE_LIMIT_CHAT_HISTORY: int = 60
    RATE_LIMIT_SESSIONS_CREATE: int = 20
    RATE_LIMIT_SESSIONS_READ: int = 60
    RATE_LIMIT_SESSIONS_UPDATE: int = 30
    RATE_LIMIT_SESSIONS_DELETE: int = 20

    # Knowledge Graph & Memory (per minute)
    RATE_LIMIT_KNOWLEDGE_INTERACT: int = 30
    RATE_LIMIT_KNOWLEDGE_CURIOSITY: int = 10
    RATE_LIMIT_KNOWLEDGE_GRAPHS: int = 30

    # Test Graph & Lab (per minute)
    RATE_LIMIT_TEST_EXTRACT: int = 10
    RATE_LIMIT_TEST_RETRIEVE: int = 20
    RATE_LIMIT_TEST_MEMORY: int = 30
    RATE_LIMIT_TEST_CURIOSITY: int = 10

    # Health Probes (per minute)
    RATE_LIMIT_HEALTH: int = 120
    RATE_LIMIT_HEALTH_READY: int = 60

    # Pipeline-level safety caps (calls per minute)
    PIPELINE_LLM_RPM: int = 30
    PIPELINE_EMBEDDING_RPM: int = 60
    PIPELINE_GRAPH_RPM: int = 60
    PIPELINE_RAG_RPM: int = 30

    # ── JWT ──────────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── Google OAuth ─────────────────────────────────────────────────────
    # OAuth 2.0 Web Client ID from Google Cloud Console. Empty disables Google sign-in.
    GOOGLE_CLIENT_ID: str = ""

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
