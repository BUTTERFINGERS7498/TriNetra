"""Shared state store backed by Redis.

Every service (gateway, orchestrator, dashboard) imports this to read and
write the pieces of shared state:

  * session scores + verdicts        (hash  "session:<id>")
  * the set of sessions routed to shadow
  * the pipeline board items          (list  "pipeline")
  * an append-only event log          (stream "events")

Redis is reached via REDIS_URL (default redis://redis:6379/0). Nothing
here raises on a missing key; callers get sensible empties instead.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Iterable

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
# Optional: when set, authenticate to Redis. Keeps a compromised neighbour on
# the shared network from reading/zeroing session scores without the password.
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", "")

_client: redis.Redis | None = None


def client() -> redis.Redis:
    global _client
    if _client is None:
        kwargs: dict[str, Any] = {"decode_responses": True, "socket_connect_timeout": 3}
        if REDIS_PASSWORD:
            kwargs["password"] = REDIS_PASSWORD
        _client = redis.from_url(REDIS_URL, **kwargs)
    return _client


# ----- events ---------------------------------------------------------------

def emit(kind: str, **fields: Any) -> None:
    """Append one event to the shared log and publish it for live tailing."""
    payload = {"kind": kind, "ts": f"{time.time():.3f}", **{k: _coerce(v) for k, v in fields.items()}}
    c = client()
    c.xadd("events", payload, maxlen=5000, approximate=True)
    c.publish("events:live", json.dumps(payload))


def recent_events(count: int = 200) -> list[dict[str, Any]]:
    entries = client().xrevrange("events", count=count)
    out = []
    for _id, data in entries:
        data = dict(data)
        data["id"] = _id
        out.append(data)
    out.reverse()
    return out


def _coerce(v: Any) -> str:
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return str(v)


# ----- sessions / scoring ----------------------------------------------------

def session_key(session_id: str) -> str:
    return f"session:{session_id}"


def bump_score(session_id: str, delta: float, reason: str) -> float:
    """Add delta to a session's threat score and return the new total."""
    c = client()
    key = session_key(session_id)
    new_total = c.hincrbyfloat(key, "score", delta)
    c.hset(key, mapping={"last_reason": reason, "updated": f"{time.time():.3f}"})
    c.expire(key, 3600)
    return float(new_total)


def get_score(session_id: str) -> float:
    val = client().hget(session_key(session_id), "score")
    return float(val) if val else 0.0


def route_to_shadow(session_id: str) -> None:
    client().sadd("shadow_sessions", session_id)


def is_shadowed(session_id: str) -> bool:
    return bool(client().sismember("shadow_sessions", session_id))


def shadowed_sessions() -> list[str]:
    return sorted(client().smembers("shadow_sessions"))


# ----- pipeline board --------------------------------------------------------

PIPELINE_STAGES = ["detected", "fixing", "reviewing", "deployed", "rejected"]


def add_pipeline_item(item: dict[str, Any]) -> str:
    item = dict(item)
    item.setdefault("created", f"{time.time():.3f}")
    item_id = item.get("id") or client().incr("pipeline:seq")
    item["id"] = str(item_id)
    client().hset("pipeline:items", item["id"], json.dumps(item))
    return item["id"]


def update_pipeline_item(item_id: str, **changes: Any) -> dict[str, Any] | None:
    c = client()
    raw = c.hget("pipeline:items", item_id)
    if not raw:
        return None
    item = json.loads(raw)
    item.update(changes)
    item["updated"] = f"{time.time():.3f}"
    c.hset("pipeline:items", item_id, json.dumps(item))
    return item


def pipeline_items() -> list[dict[str, Any]]:
    raw = client().hgetall("pipeline:items")
    items = [json.loads(v) for v in raw.values()]
    items.sort(key=lambda it: float(it.get("created", 0)))
    return items


# ----- simple work queue -----------------------------------------------------

def enqueue(queue: str, payload: dict[str, Any]) -> None:
    client().rpush(f"queue:{queue}", json.dumps(payload))


def dequeue(queue: str, timeout: int = 5) -> dict[str, Any] | None:
    res = client().blpop(f"queue:{queue}", timeout=timeout)
    if not res:
        return None
    _key, value = res
    return json.loads(value)


def queue_depth(queue: str) -> int:
    return int(client().llen(f"queue:{queue}"))


def iter_live() -> Iterable[dict[str, Any]]:
    """Yield events as they are published (used by the dashboard SSE)."""
    pubsub = client().pubsub()
    pubsub.subscribe("events:live")
    try:
        for message in pubsub.listen():
            if message.get("type") == "message":
                yield json.loads(message["data"])
    finally:
        pubsub.close()
