"""
V1 API router aggregator.

Mounts all versioned endpoint routers under a single parent.
"""

from fastapi import APIRouter

from app.api.v1 import auth, documents, health, research, users, workspaces

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(documents.router, tags=["documents"])
api_router.include_router(research.router, tags=["research"])
