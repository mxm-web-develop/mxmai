# PPTX compiler service

## Role

Standalone **async HTTP microservice** that compiles platform deck IR → `.pptx`.
mxmcgi `renderPptx` posts a job and polls; the service runs compiles on a **thread pool**
so many decks can be in flight without blocking the Node worker process on `spawn`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | liveness + queue counts |
| POST | `/v1/compile/jobs` | enqueue compile (`{ title, visual_system, slides }`) → `{ jobId, pollUrl, fileUrl }` |
| GET | `/v1/compile/jobs/{id}` | `queued \| running \| succeeded \| failed` |
| GET | `/v1/compile/jobs/{id}/file` | PPTX bytes when succeeded |

Optional auth: set `PPTX_COMPILER_API_TOKEN` and send `Authorization: Bearer …`.

## Run

```bash
cd mxmcgi/tools/pptx-compiler
pip install -r requirements.txt
# or: python3 -m uvicorn server:app --host 0.0.0.0 --port 4010
PPTX_COMPILER_WORKERS=4 python3 server.py
```

## mxmcgi env

```bash
PPTX_COMPILER_URL=http://127.0.0.1:4010
# PPTX_COMPILER_API_TOKEN=
# PPTX_COMPILER_POLL_MS=500
# PPTX_COMPILER_TIMEOUT_MS=180000
```

If `PPTX_COMPILER_URL` is empty string, `renderPptx` falls back to local `spawn`.
Unset / default → `http://127.0.0.1:4010` (same-host deploy).

## Concurrency model

- **Across jobs**: `ThreadPoolExecutor(PPTX_COMPILER_WORKERS)` — default 4 concurrent decks.
- **Within a deck**: pages still rendered in order inside one job (layout consistency).
- **Job store**: in-memory (single uvicorn worker). Multi-host needs shared store later.

## Origin

Inspired by [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) (MIT) intermediate-language idea.
We do **not** vendor their Skill / `attribution_guard` / full `svg_to_pptx` package.
