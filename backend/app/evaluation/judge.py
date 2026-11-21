"""The judge model RAGAS metrics run on.

Gemini is reached through its OpenAI-compatible endpoint: ragas' llm_factory drives it with instructor's
OpenAI client, which works with the instructor version langchain-openai allows (the native google-genai
route needs a newer instructor and openai 3.x). Embeddings use Gemini's embedding model directly.
"""

from functools import lru_cache

from app.core.config import settings

GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


class JudgeUnavailable(RuntimeError):
    """No GEMINI_API_KEY, so nothing can be scored."""


def judge_model() -> str:
    return settings.EVAL_JUDGE_MODEL or settings.LLM_MODEL


def _api_key() -> str:
    key = settings.GEMINI_API_KEY
    if not key or key == "your-gemini-api-key-here":
        raise JudgeUnavailable("GEMINI_API_KEY is not set; RAGAS metrics need a judge model")
    return key


@lru_cache(maxsize=1)
def judge_llm():
    """Structured-output LLM for ragas.metrics.collections metrics."""
    from openai import AsyncOpenAI
    from ragas.llms import llm_factory

    client = AsyncOpenAI(api_key=_api_key(), base_url=GEMINI_OPENAI_BASE_URL)
    model_args: dict = {"max_tokens": settings.EVAL_JUDGE_MAX_TOKENS}
    if settings.EVAL_JUDGE_REASONING_EFFORT:
        model_args["reasoning_effort"] = settings.EVAL_JUDGE_REASONING_EFFORT
    return llm_factory(judge_model(), client=client, **model_args)


@lru_cache(maxsize=1)
def judge_embeddings():
    """Embeddings for metrics that compare meaning (answer relevancy)."""
    from google import genai
    from ragas.embeddings import GoogleEmbeddings

    return GoogleEmbeddings(client=genai.Client(api_key=_api_key()), model=settings.EMBEDDING_MODEL)


# Who asks questions in this app. Fixed personas make synthetic questions sound like real users, and skip
# ragas' LLM persona step (which fails when Gemini blocks a document summary and returns nothing).
PERSONAS = (
    (
        "Graduate researcher",
        "Reads papers and reports in depth; asks precise questions about methods, results, "
        "limitations and how findings compare across sources.",
    ),
    (
        "Student learning the topic",
        "New to the subject; asks what concepts mean, how they work and why they matter, in plain words.",
    ),
    (
        "Industry analyst",
        "Needs decision-ready facts; asks for numbers, trade-offs, trends and practical implications.",
    ),
)
# Steers question writing toward the questions this research assistant is built to answer
GENERATION_CONTEXT = (
    "Questions are asked in a research assistant that answers from the user's own library of papers, "
    "articles, videos and notes, citing its sources. Ask questions a reader of these documents would "
    "realistically ask, answerable from the documents themselves."
)


def testset_generator():
    """TestsetGenerator for synthetic data. It still takes LangChain models, wrapped by ragas."""
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
    from ragas.testset import TestsetGenerator
    from ragas.testset.persona import Persona

    key = _api_key()
    llm = ChatGoogleGenerativeAI(model=judge_model(), google_api_key=key, temperature=0.2)
    model = settings.EMBEDDING_MODEL
    embeddings = GoogleGenerativeAIEmbeddings(
        model=model if model.startswith("models/") else f"models/{model}", google_api_key=key
    )
    generator = TestsetGenerator.from_langchain(llm, embeddings, llm_context=GENERATION_CONTEXT)
    generator.persona_list = [Persona(name=n, role_description=d) for n, d in PERSONAS]
    return generator
