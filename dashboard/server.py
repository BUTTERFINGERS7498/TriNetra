"""Operator workspace: observed Redis state, patch inspection and live events.

Approval queues the existing reviewer. Recovery records intent; no host
command is ever executed by this service.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from redis.exceptions import RedisError, WatchError

sys.path.append(str(Path(__file__).resolve().parents[1]))
from common import store  # noqa: E402

STATIC = Path(__file__).parent / "static"
LANDING = Path(__file__).resolve().parents[1] / "frontend" / "dist"
PATCH_DIR = Path(os.environ.get("PATCH_DIR", "/app/patches")).resolve()
FORK_DIR = Path(os.environ.get("FORK_DIR", "/app/fork")).resolve()
MAX_ARTIFACT_BYTES = 1_000_000
# Comma-separated browser origins allowed to POST (Vercel front door → this API).
ALLOWED_ORIGINS = {
    o.strip().rstrip("/")
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://trinetra-bay.vercel.app,https://trinetra-qwlbvfj1h-sarvagya-sharmas-projects.vercel.app",
    ).split(",")
    if o.strip()
}
# Cloud split: Vercel = UI, Render = API. Set SERVE_STATIC=0 on Render.
SERVE_STATIC = os.environ.get("SERVE_STATIC", "1").strip().lower() not in {"0", "false", "no"}
PUBLIC_FRONTEND_URL = os.environ.get(
    "PUBLIC_FRONTEND_URL", "https://trinetra-bay.vercel.app"
).rstrip("/")
app = FastAPI(title="TriNetra workspace", docs_url="/api/docs", redoc_url=None)


def _origin_allowed(origin: str | None, request: Request) -> bool:
    if not origin:
        return True
    normalized = origin.rstrip("/")
    if normalized == str(request.base_url).rstrip("/"):
        return True
    if normalized in ALLOWED_ORIGINS:
        return True
    # Preview / alias deploys: *.vercel.app for this project name
    if normalized.endswith(".vercel.app") and "trinetra" in normalized:
        return True
    return False


@app.middleware("http")
async def workspace_headers(request: Request, call_next):
    if request.method == "POST":
        origin = request.headers.get("origin")
        if origin and not _origin_allowed(origin, request):
            return JSONResponse({"detail": "Cross-origin actions are not allowed"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    origin = request.headers.get("origin")
    if origin and _origin_allowed(origin, request):
        response.headers["Access-Control-Allow-Origin"] = origin.rstrip("/")
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RedisError)
async def redis_unavailable(_request: Request, _exc: RedisError):
    return JSONResponse({"detail": "The state store is unavailable. Check Redis."}, status_code=503)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "trinetra-api", "frontend": PUBLIC_FRONTEND_URL}


@app.get("/")
def index(request: Request):
    # Local Docker still serves the landing UI. On Render (SERVE_STATIC=0) this
    # host is API-only — send browsers to the Vercel front door.
    if not SERVE_STATIC:
        return RedirectResponse(PUBLIC_FRONTEND_URL + "/")
    if "preview" in request.query_params:
        return RedirectResponse(f"/workspace/?{request.url.query}")
    return FileResponse(LANDING / "index.html")


def _board(items):
    board = {stage: [] for stage in store.PIPELINE_STAGES}
    for item in items:
        board.setdefault(item.get("stage", "detected"), []).append(item)
    return board


def _sessions():
    ids = store.shadowed_sessions()
    if not ids:
        return []
    pipe = store.client().pipeline(transaction=False)
    for sid in ids:
        pipe.hgetall(store.session_key(sid))
    return [{"session": sid, "score": round(float(details.get("score", 0)), 1),
             "last_reason": details.get("last_reason", ""), "updated": details.get("updated"),
             "score_expired": not details} for sid, details in zip(ids, pipe.execute())]


@app.get("/api/pipeline")
def pipeline():
    return {"stages": store.PIPELINE_STAGES, "board": _board(store.pipeline_items())}


@app.get("/api/events")
def events():
    return {"events": store.recent_events(200)}


@app.get("/api/sessions")
def sessions():
    return {"shadowed": _sessions()}


@app.get("/api/workspace")
def workspace():
    try:
        items = store.pipeline_items()
        recent = store.recent_events(200)
        return {"connected": True, "observed_at": time.time(), "stages": store.PIPELINE_STAGES,
                "items": items, "sessions": _sessions(), "events": recent,
                "queues": {name: store.queue_depth(name) for name in ("fix", "review")}, "event_limit": 200}
    except RedisError:
        return JSONResponse({"connected": False, "observed_at": time.time(),
                             "detail": "The state store is unavailable. Start Redis and reconnect."}, status_code=503)


def _item(item_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", item_id):
        raise HTTPException(400, "Invalid finding identifier")
    raw = store.client().hget("pipeline:items", item_id)
    if raw is None:
        raise HTTPException(404, "Finding not found")
    return json.loads(raw)


@app.get("/api/findings/{item_id}/patch")
def patch(item_id: str):
    item = _item(item_id)
    # Only known artifact names are readable. Never follow item.patch_file.
    artifact = (PATCH_DIR / f"item-{item_id}.json").resolve()
    if not artifact.is_relative_to(PATCH_DIR):
        raise HTTPException(400, "Patch path is outside the artifact directory")
    if not artifact.is_file():
        return {"available": False, "files": [], "detail": "No patch artifact is available yet."}
    if artifact.stat().st_size > MAX_ARTIFACT_BYTES:
        raise HTTPException(413, "Patch artifact exceeds the inspection limit")
    try:
        proposal = json.loads(artifact.read_text(encoding="utf-8"))
        if not isinstance(proposal, dict) or not isinstance(proposal.get("files"), list):
            raise ValueError("Invalid artifact")
        files = []
        for entry in proposal["files"]:
            rel, after = entry["path"], entry["new_contents"]
            if not isinstance(rel, str) or not isinstance(after, str):
                raise ValueError("Invalid patch file")
            target = (FORK_DIR / rel).resolve()
            if Path(rel).is_absolute() or not target.is_relative_to(FORK_DIR):
                raise HTTPException(400, "Patch contains an out-of-sandbox path")
            before = entry.get("original_contents")
            baseline = "recorded" if isinstance(before, str) else None
            if before is None and item.get("stage") != "deployed" and target.is_file():
                if target.stat().st_size <= MAX_ARTIFACT_BYTES:
                    before = target.read_text(encoding="utf-8")
                    baseline = "current fork"
            if before is not None and not isinstance(before, str):
                raise ValueError("Invalid baseline")
            diff = "".join(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                              fromfile=f"a/{rel}", tofile=f"b/{rel}")) if baseline else None
            files.append({"path": rel, "diff": diff, "new_contents": after, "baseline": baseline})
        return {"available": True, "files": files, "explanation": proposal.get("explanation", "")}
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(422, "Patch artifact could not be read") from None


def _transition(item_id: str, action: str):
    """Atomically validate the item and save its state, queue job and event."""
    _item(item_id)
    for _ in range(4):
        try:
            with store.client().pipeline() as pipe:
                pipe.watch("pipeline:items")
                raw = pipe.hget("pipeline:items", item_id)
                if raw is None:
                    raise HTTPException(404, "Finding not found")
                item, now = json.loads(raw), f"{time.time():.3f}"
                if action == "approve":
                    if item.get("stage") != "reviewing" or not item.get("pending_deploy"):
                        raise HTTPException(409, "This patch is not awaiting approval")
                    if item.get("human_approved"):
                        raise HTTPException(409, "Approval has already been queued")
                    item.update(human_approved=True, awaiting_human=False, approved_at=now)
                    kind, msg = "reviewing", f"operator approved; queued for the reviewer: {item.get('title', '?')}"
                else:
                    if item.get("stage") != "deployed":
                        raise HTTPException(409, "Recovery can only be requested for a deployed item")
                    if item.get("rollback_requested"):
                        raise HTTPException(409, "A recovery request is already recorded")
                    item.update(rollback_requested=True, rollback_requested_at=now)
                    kind, msg = "rollback", f"operator requested recovery; manual action required: {item.get('title', '?')}"
                item["updated"] = now
                event = {"kind": kind, "ts": now, "item_id": item_id, "msg": msg}
                if action == "recovery":
                    event["cmd"] = item.get("rollback_cmd", "n/a")
                pipe.multi()
                pipe.hset("pipeline:items", item_id, json.dumps(item))
                if action == "approve":
                    pipe.rpush("queue:review", json.dumps({"item_id": item_id}))
                pipe.xadd("events", event, maxlen=5000, approximate=True)
                pipe.publish("events:live", json.dumps(event))
                pipe.execute()
                return {"ok": True, "item": item, "rollback_cmd": item.get("rollback_cmd", "n/a")}
        except WatchError:
            continue
    raise HTTPException(409, "The finding changed while saving. Refresh and try again.")


@app.post("/api/approve/{item_id}")
def approve(item_id: str):
    return _transition(item_id, "approve")


@app.post("/api/rollback/{item_id}")
def rollback(item_id: str):
    return _transition(item_id, "recovery")


@app.get("/api/stream")
def stream():
    def gen():
        try:
            for ev in store.recent_events(30):
                yield f"data: {json.dumps(ev)}\n\n"
            for ev in store.iter_live():
                yield f"data: {json.dumps(ev)}\n\n"
        except RedisError:
            yield 'event: unavailable\ndata: {"detail":"State store disconnected"}\n\n'
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


if SERVE_STATIC:
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    app.mount("/workspace", StaticFiles(directory=STATIC, html=True), name="workspace")
    # Keep this last so application/API routes take precedence over marketing assets.
    app.mount("/", StaticFiles(directory=LANDING, html=True), name="landing")
else:
    @app.get("/workspace")
    def workspace_ui_redirect():
        return RedirectResponse(PUBLIC_FRONTEND_URL + "/workspace?preview=1")

    @app.get("/workspace/")
    def workspace_ui_redirect_slash():
        return RedirectResponse(PUBLIC_FRONTEND_URL + "/workspace?preview=1")
