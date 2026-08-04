#!/usr/bin/env python3
"""
PPTX Compiler Service — async job API for deck IR → PPTX.

Endpoints:
  GET  /health
  POST /v1/compile/jobs          body: deck IR JSON → { jobId, status, pollUrl }
  GET  /v1/compile/jobs/{jobId}  → status (+ error)
  GET  /v1/compile/jobs/{jobId}/file → application/pptx bytes when ready

Concurrency: ThreadPoolExecutor (PPTX_COMPILER_WORKERS, default 4).
Jobs TTL: PPTX_COMPILER_JOB_TTL_SEC (default 3600). In-memory store (single instance).

Env:
  PPTX_COMPILER_HOST=0.0.0.0
  PPTX_COMPILER_PORT=4010
  PPTX_COMPILER_WORKERS=4
  PPTX_COMPILER_JOB_TTL_SEC=3600
  PPTX_COMPILER_API_TOKEN=   # optional Bearer token

Run:
  cd mxmcgi/tools/pptx-compiler
  uvicorn server:app --host 0.0.0.0 --port 4010
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from build_pptx_from_ir import build_pptx_bytes

HOST = os.environ.get("PPTX_COMPILER_HOST", "0.0.0.0")
PORT = int(os.environ.get("PPTX_COMPILER_PORT", "4010"))
WORKERS = max(1, int(os.environ.get("PPTX_COMPILER_WORKERS", "4")))
JOB_TTL_SEC = max(60, int(os.environ.get("PPTX_COMPILER_JOB_TTL_SEC", "3600")))
API_TOKEN = (os.environ.get("PPTX_COMPILER_API_TOKEN") or "").strip()


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


@dataclass
class Job:
    id: str
    status: JobStatus
    created_at: float
    updated_at: float
    deck: Dict[str, Any]
    error: Optional[str] = None
    pptx_bytes: Optional[bytes] = None
    slide_count: int = 0
    meta: Dict[str, Any] = field(default_factory=dict)


_jobs: Dict[str, Job] = {}
_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix="pptx-compile")


class CompileJobRequest(BaseModel):
    title: Optional[str] = None
    visual_system: Optional[Dict[str, Any]] = None
    slides: List[Dict[str, Any]] = Field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None


class CompileJobCreateResponse(BaseModel):
    jobId: str
    status: JobStatus
    pollUrl: str
    fileUrl: str


class CompileJobStatusResponse(BaseModel):
    jobId: str
    status: JobStatus
    error: Optional[str] = None
    slideCount: Optional[int] = None
    createdAt: float
    updatedAt: float
    fileUrl: Optional[str] = None


app = FastAPI(title="MXM PPTX Compiler", version="1.0.0")


def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    if not API_TOKEN:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[7:].strip()
    if token != API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")


def _purge_expired(now: Optional[float] = None) -> None:
    ts = now if now is not None else time.time()
    with _lock:
        dead = [jid for jid, j in _jobs.items() if ts - j.created_at > JOB_TTL_SEC]
        for jid in dead:
            _jobs.pop(jid, None)


def _run_job(job_id: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = JobStatus.running
        job.updated_at = time.time()
        deck = job.deck

    try:
        pptx = build_pptx_bytes(deck)
        slides = deck.get("slides") or []
        with _lock:
            job = _jobs.get(job_id)
            if not job:
                return
            job.pptx_bytes = pptx
            job.slide_count = len(slides) if isinstance(slides, list) else 0
            job.status = JobStatus.succeeded
            job.updated_at = time.time()
            job.error = None
    except Exception as e:  # noqa: BLE001 — surface to job status
        with _lock:
            job = _jobs.get(job_id)
            if not job:
                return
            job.status = JobStatus.failed
            job.error = str(e)[:800]
            job.updated_at = time.time()


@app.get("/health")
def health() -> Dict[str, Any]:
    with _lock:
        counts = {s.value: 0 for s in JobStatus}
        for j in _jobs.values():
            counts[j.status.value] = counts.get(j.status.value, 0) + 1
    return {
        "ok": True,
        "workers": WORKERS,
        "jobs": counts,
        "script": str(Path(__file__).resolve().parent / "build_pptx_from_ir.py"),
    }


@app.post("/v1/compile/jobs", response_model=CompileJobCreateResponse)
def create_job(
    body: CompileJobRequest,
    _: None = Depends(require_token),
) -> CompileJobCreateResponse:
    _purge_expired()
    if not body.slides:
        raise HTTPException(status_code=400, detail="slides[] required")
    if len(body.slides) > 48:
        raise HTTPException(status_code=400, detail="too many slides (max 48)")

    job_id = uuid.uuid4().hex
    now = time.time()
    deck = {
        "title": body.title or "演示文稿",
        "visual_system": body.visual_system or {},
        "slides": body.slides,
    }
    job = Job(
        id=job_id,
        status=JobStatus.queued,
        created_at=now,
        updated_at=now,
        deck=deck,
        meta=body.meta or {},
    )
    with _lock:
        _jobs[job_id] = job

    _executor.submit(_run_job, job_id)
    return CompileJobCreateResponse(
        jobId=job_id,
        status=JobStatus.queued,
        pollUrl=f"/v1/compile/jobs/{job_id}",
        fileUrl=f"/v1/compile/jobs/{job_id}/file",
    )


@app.get("/v1/compile/jobs/{job_id}", response_model=CompileJobStatusResponse)
def get_job(job_id: str, _: None = Depends(require_token)) -> CompileJobStatusResponse:
    _purge_expired()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        return CompileJobStatusResponse(
            jobId=job.id,
            status=job.status,
            error=job.error,
            slideCount=job.slide_count if job.status == JobStatus.succeeded else None,
            createdAt=job.created_at,
            updatedAt=job.updated_at,
            fileUrl=f"/v1/compile/jobs/{job.id}/file"
            if job.status == JobStatus.succeeded
            else None,
        )


@app.get("/v1/compile/jobs/{job_id}/file")
def get_job_file(job_id: str, _: None = Depends(require_token)) -> Response:
    _purge_expired()
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        if job.status == JobStatus.failed:
            raise HTTPException(status_code=409, detail=job.error or "compile failed")
        if job.status != JobStatus.succeeded or not job.pptx_bytes:
            raise HTTPException(status_code=409, detail=f"not ready: {job.status.value}")
        data = job.pptx_bytes

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f'attachment; filename="deck-{job_id[:8]}.pptx"',
            "Cache-Control": "no-store",
        },
    )


def main() -> None:
    import uvicorn

    uvicorn.run(
        "server:app",
        host=HOST,
        port=PORT,
        reload=False,
        workers=1,  # job store is in-process; scale via PPTX_COMPILER_WORKERS thread pool
    )


if __name__ == "__main__":
    main()
