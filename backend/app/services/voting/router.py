"""Votes, result, tie-break (BE-19 – BE-21). Endpoints are added as their tasks are built."""
from fastapi import APIRouter

router = APIRouter(tags=["voting"])
