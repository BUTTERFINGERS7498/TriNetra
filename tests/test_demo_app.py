"""Tests for the demo app the defender protects.

These back the Verify stage of the CI pipeline: when the fixer agent patches
demo_app, this suite is what proves the patch did not break the app's normal
behaviour before it is released.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

APP_PATH = Path(__file__).resolve().parents[1] / "demo_app" / "app.py"


def _load_app(tmp_log_dir: Path):
    """Import demo_app/app.py with its log directory pointed at a temp dir."""
    import os

    os.environ["APP_LOG_DIR"] = str(tmp_log_dir)
    os.environ["APP_ROLE"] = "prod"
    spec = importlib.util.spec_from_file_location("demo_app_under_test", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["demo_app_under_test"] = module
    spec.loader.exec_module(module)
    return module.app


@pytest.fixture()
def client(tmp_path):
    return TestClient(_load_app(tmp_path))


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_index_lists_endpoints(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "/products" in r.json()["endpoints"]


def test_products_listed(client):
    r = client.get("/products")
    assert r.status_code == 200
    assert len(r.json()["products"]) >= 1


def test_single_product_found(client):
    r = client.get("/products/1")
    assert r.status_code == 200
    assert r.json()["id"] == 1


def test_unknown_product_is_404(client):
    r = client.get("/products/9999")
    assert r.status_code == 404


def test_login_succeeds_with_valid_credentials(client):
    r = client.post("/login", json={"username": "alice", "password": "password123"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_rejects_bad_password(client):
    r = client.post("/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401


def test_login_rejects_unknown_user(client):
    r = client.post("/login", json={"username": "nobody", "password": "x"})
    assert r.status_code == 401


def test_order_round_trip(client):
    created = client.post("/orders", json={"product_id": 1, "qty": 2})
    assert created.status_code == 200
    assert created.json()["qty"] == 2
    listed = client.get("/orders")
    assert listed.status_code == 200
    assert any(o["product_id"] == 1 for o in listed.json()["orders"])


def test_request_logging_writes_a_line(tmp_path):
    c = TestClient(_load_app(tmp_path))
    c.get("/products")
    log = tmp_path / "prod.log"
    assert log.exists() and log.read_text(encoding="utf-8").strip()
