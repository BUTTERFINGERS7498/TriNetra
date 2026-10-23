"""A small demo web app the defender protects.

This is a plain, ordinary shop-style API — a login, a product catalog,
and an orders endpoint — with nothing deliberately malicious in it. Its
only special behavior is a logging middleware that writes one structured
JSON line per request. The shadow instance writes its log where the
detector agent can read it.

The same image runs as both the production app and the shadow decoy; the
APP_ROLE env var ("prod" or "shadow") selects which, and only changes the
banner and the log destination.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

APP_ROLE = os.environ.get("APP_ROLE", "prod")
LOG_DIR = Path(os.environ.get("APP_LOG_DIR", "/app/logs"))
LOG_FILE = LOG_DIR / f"{APP_ROLE}.log"

app = FastAPI(title=f"demo-shop ({APP_ROLE})")

# A tiny in-memory dataset; resets on restart, which is fine for a demo.
_USERS = {"alice": "password123", "bob": "hunter2"}
_PRODUCTS = [
    {"id": 1, "name": "Coffee Mug", "price": 12.5},
    {"id": 2, "name": "Notebook", "price": 6.0},
    {"id": 3, "name": "Pen Set", "price": 9.25},
]
_ORDERS: list[dict] = []


def _log(record: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    body = b""
    try:
        body = await request.body()
    except Exception:
        pass
    response = await call_next(request)
    _log(
        {
            "ts": round(start, 3),
            "role": APP_ROLE,
            "session": request.headers.get("x-session-id", "-"),
            "ip": request.client.host if request.client else "-",
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "status": response.status_code,
            "body": body.decode("utf-8", "replace")[:1000],
            "ua": request.headers.get("user-agent", "-"),
            "duration_ms": round((time.time() - start) * 1000, 1),
        }
    )
    return response


@app.get("/health")
def health():
    return {"ok": True, "role": APP_ROLE}


@app.get("/")
def index():
    return {"app": "demo-shop", "role": APP_ROLE, "endpoints": ["/login", "/products", "/orders"]}


@app.post("/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username", "")
    password = data.get("password", "")
    if _USERS.get(username) == password:
        return {"token": f"token-for-{username}", "user": username}
    return JSONResponse({"error": "invalid credentials"}, status_code=401)


@app.get("/products")
def products():
    return {"products": _PRODUCTS}


@app.get("/products/{product_id}")
def product(product_id: int):
    for p in _PRODUCTS:
        if p["id"] == product_id:
            return p
    return JSONResponse({"error": "not found"}, status_code=404)


@app.post("/orders")
async def create_order(request: Request):
    data = await request.json()
    order = {"id": len(_ORDERS) + 1, "product_id": data.get("product_id"), "qty": data.get("qty", 1)}
    _ORDERS.append(order)
    return order


@app.get("/orders")
def list_orders():
    return {"orders": _ORDERS}
