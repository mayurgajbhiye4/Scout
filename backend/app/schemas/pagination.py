"""Offset paging shared by the list endpoints."""

from typing import Annotated

from fastapi import Query

MAX_PAGE_SIZE = 100

PageSkip = Annotated[int, Query(ge=0, description="Rows to skip")]
PageLimit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE, description="Rows in the page")]
