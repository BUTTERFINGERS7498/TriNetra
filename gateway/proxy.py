"""The defender's gateway: a reverse proxy in front of the demo app.

For every request it:
  1. identifies the session (cookie, or a generated id),
  2. forwards to the production upstream,
  3. scores the request with the rules in scoring/rules.py,
  4. accumulates the session's threat score in Redis, and
  5. once the score crosses SHADOW_THRESHOLD, transparently routes that
     session's future traffic to the shadow decoy instead of production.

Real users never cross the threshold, so they always stay on production.
A session that has been moved to shadow stays there.
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Response

sys.path.append("/app")
from common import store  # noqa: E402
from scoring.rules import SessionMemory, score_request  # noqa: E402

PROD_UPSTREAM = os.environ.get("PROD_UPSTREAM", "http://app-prod:8000")
SHADOW_UPSTREAM = os.environ.get("SHADOW_UPSTREAM", "http://app-shadow:8000")
SHADOW_THRESHOLD = float(os.environ.get("SHADOW_THRESHOLD", "15"))

# The gateway records every request it routes to the shadow decoy here, in
# one JSON line per request. The detector reads this file. Logging at the
# gateway keeps the pipeline app-agnostic: it works the same whether the
# protected app is the demo app or crAPI, with no cooperation from the app.
SHADOW_REQUEST_LOG = Path(os.environ.get("SHADOW_REQUEST_LOG", "/app/logs/shadow.log"))


def _log_shadow_request(record: dict) -> None:
    SHADOW_REQUEST_LOG.parent.mkdir(parents=True, exist_ok=True)
    with SHADOW_REQUEST_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")

app = FastAPI(title="mahoraga-gateway")
_client = httpx.AsyncClient(timeout=30.0)
_memory: dict[str, SessionMemory] = {}

_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
}


def _session_id(request: Request) -> tuple[str, bool]:
    sid = request.cookies.get("sid") or request.headers.get("x-session-id")
    if sid:
        return sid, False
    return uuid.uuid4().hex[:16], True


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(full_path: str, request: Request):
    sid, is_new = _session_id(request)
    shadowed = store.is_shadowed(sid)
    upstream = SHADOW_UPSTREAM if shadowed else PROD_UPSTREAM

    body = await request.body()
    fwd_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    fwd_headers["x-session-id"] = sid
    fwd_headers["x-forwarded-for"] = request.client.host if request.client else "-"

    url = f"{upstream}/{full_path}"
    upstream_resp = await _client.request(
        request.method, url, headers=fwd_headers, content=body,
        params=dict(request.query_params),
    )

    # Score the request now that we know the response status.
    mem = _memory.setdefault(sid, SessionMemory())
    hits = score_request(
        method=request.method,
        path=request.url.path,
        query=str(request.url.query),
        body=body.decode("utf-8", "replace")[:2000],
        user_agent=request.headers.get("user-agent", "-"),
        status=upstream_resp.status_code,
        mem=mem,
    )

    if hits:
        total = 0.0
        for hit in hits:
            total = store.bump_score(sid, hit.points, hit.reason)
            store.emit("score", session=sid, points=hit.points, reason=hit.reason, total=round(total, 1))
        if not shadowed and total >= SHADOW_THRESHOLD:
            store.route_to_shadow(sid)
            shadowed = True
            store.emit("shadow_route", session=sid, total=round(total, 1),
                       msg=f"session {sid} moved to shadow (score {total:.1f})")

    # Record requests served by the shadow decoy for the detector to read.
    if shadowed:
        _log_shadow_request({
            "ts": round(time.time(), 3),
            "session": sid,
            "ip": request.client.host if request.client else "-",
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "status": upstream_resp.status_code,
            "body": body.decode("utf-8", "replace")[:1000],
            "ua": request.headers.get("user-agent", "-"),
            "score": round(store.get_score(sid), 1),
        })

    resp_headers = {
        k: v for k, v in upstream_resp.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    response = Response(
        content=upstream_resp.content,
        status_code=upstream_resp.status_code,
        headers=resp_headers,
    )
    if is_new:
        response.set_cookie("sid", sid, httponly=True, samesite="lax")
    return response
