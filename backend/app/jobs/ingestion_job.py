"""
Ingestion background job.
"""

from app.services.ingestion_service import run_ingestion_job

__all__ = ["run_ingestion_job"]
