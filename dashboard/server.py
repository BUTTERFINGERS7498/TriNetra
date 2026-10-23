"""Dashboard backend.

Serves the single-page UI and the small JSON/SSE API behind it:

  GET  /                 -> the dashboard page
  GET  /api/pipeline     -> current pipeline board items
  GET  /api/events       -> recent events (initial fill)
  GET  /api/sessions     -> sessions currently routed to shadow + scores
  GET  /api/stream       -> Server-Sent Events, one per live event
  POST /api/rollback/{id}-> roll back a deployed patch (records intent)

It is read-mostly: the only mutating call is rollback, which flips a
deployed item back and emits an event the operator can act on.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

sys.path.append("/app")
from common import store  # noqa: E402

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="mahoraga-dashboard")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/pipeline")
def pipeline():
    items = store.pipeline_items()
    board = {stage: [] for stage in store.PIPELINE_STAGES}
    for it in items:
        board.setdefault(it.get("stage", "detected"), []).append(it)
    return {"stages": store.PIPELINE_STAGES, "board": board}


@app.get("/api/events")
def events():
    return {"events": store.recent_events(200)}


@app.get("/api/sessions")
def sessions():
    out = []
    for sid in store.shadowed_sessions():
        out.append({"session": sid, "score": round(store.get_score(sid), 1)})
    return {"shadowed": out}


@app.post("/api/approve/{item_id}")
def approve(item_id: str):
    """Human approves a patch the model approved but was held for review.

    Marks it approved and re-queues it; the reviewer worker re-runs the static
    safety gate and deploys. No effect unless the item is awaiting approval.
    """
    item = store.update_pipeline_item(item_id, human_approved=True)
    if item is None:
        return {"ok": False, "error": "unknown item"}
    if not item.get("pending_deploy"):
        return {"ok": False, "error": "item is not awaiting human approval"}
    store.enqueue("review", {"item_id": item_id})
    store.emit("reviewing", item_id=item_id, msg=f"operator approved; deploying: {item.get('title','?')}")
    return {"ok": True}


@app.post("/api/rollback/{item_id}")
def rollback(item_id: str):
    item = store.update_pipeline_item(item_id, stage="rejected", rolled_back=True)
    if item is None:
        return {"ok": False, "error": "unknown item"}
    store.emit("rollback", item_id=item_id,
               msg=f"operator rolled back: {item.get('title','?')}",
               cmd=item.get("rollback_cmd", "n/a"))
    return {"ok": True, "rollback_cmd": item.get("rollback_cmd", "n/a")}


@app.get("/api/stream")
def stream():
    def gen():
        # Replay a little history first so a fresh page isn't empty.
        for ev in store.recent_events(30):
            yield f"data: {json.dumps(ev)}\n\n"
        for ev in store.iter_live():
            yield f"data: {json.dumps(ev)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


# Static assets (if any are added later).
app.mount("/static", StaticFiles(directory=STATIC), name="static")
