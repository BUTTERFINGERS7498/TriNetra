"""Workspace contracts, atomic operator actions and sandboxed artifact access."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urljoin

import fakeredis
import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError

from common import store
from dashboard import server


@pytest.fixture()
def workspace(monkeypatch, tmp_path):
    db = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(store, "_client", db)
    patch_dir, fork_dir = tmp_path / "patches", tmp_path / "fork"
    patch_dir.mkdir()
    fork_dir.mkdir()
    monkeypatch.setattr(server, "PATCH_DIR", patch_dir)
    monkeypatch.setattr(server, "FORK_DIR", fork_dir)
    with TestClient(server.app) as client:
        yield client, db, patch_dir, fork_dir
    db.close()


def add_item(db, item_id="1", **fields):
    item = {"id": item_id, "title": "Ownership check", "created": "100", "stage": "reviewing",
            "pending_deploy": True, "awaiting_human": True, **fields}
    db.hset("pipeline:items", item_id, json.dumps(item))
    return item


def read_item(db, item_id="1"):
    return json.loads(db.hget("pipeline:items", item_id))


def test_workspace_serves_shell_and_assets(workspace):
    client, *_ = workspace
    response = client.get("/workspace/")
    assert response.status_code == 200
    assert 'id="inspector"' in response.text
    assert './workspace.js' in response.text
    for asset in ("workspace.js", "workspace.css", "sample-data.js", "favicon.svg"):
        assert client.get(f"/workspace/{asset}").status_code == 200
        # Existing static URLs remain valid for older clients.
        assert client.get(f"/static/{asset}").status_code == 200


def test_landing_to_workspace_navigation_resolves_scripts_and_styles(workspace):
    client, *_ = workspace

    class Resources(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links, self.assets = [], []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == "a":
                self.links.append(attrs.get("href", ""))
            if tag in ("script", "link"):
                self.assets.append(attrs.get("src") or attrs.get("href", ""))

    response = client.get("/")
    assert response.status_code == 200
    landing = Resources()
    landing.feed(response.text)
    workspace_links = [href for href in landing.links if href == "/workspace/"]
    assert len(workspace_links) >= 4  # Desktop/mobile navigation, hero and closing action.
    assert "#workspace" not in landing.links
    for href in workspace_links:
        assert 'id="inspector"' in client.get(href).text
    shell = Resources()
    shell.feed(client.get("/workspace/").text)
    for resource in shell.assets:
        assert client.get(urljoin("/workspace/", resource)).status_code == 200
    assert client.get("/styles.css").status_code == 200
    assert client.get("/api/workspace").json()["connected"] is True


def test_previous_sample_url_redirects_to_workspace(workspace):
    client, *_ = workspace
    response = client.get("/?preview=1", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/workspace/?preview=1"
    assert 'id="inspector"' in client.get(response.headers["location"]).text


def test_empty_workspace_is_connected_without_invented_data(workspace):
    client, *_ = workspace
    response = client.get("/api/workspace")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["connected"] is True
    assert data["items"] == data["events"] == data["sessions"] == []
    assert data["queues"] == {"fix": 0, "review": 0}


def test_snapshot_uses_runtime_items_queues_and_expiring_scores(workspace):
    client, db, *_ = workspace
    add_item(db)
    store.enqueue("fix", {"item_id": "1"})
    store.emit("reviewing", item_id="1", msg="Ready")
    db.sadd("shadow_sessions", "active", "expired")
    db.hset("session:active", mapping={"score": 22.25, "last_reason": "enumeration", "updated": "120"})
    data = client.get("/api/workspace").json()
    assert len(data["items"]) == len(data["events"]) == 1
    assert data["queues"]["fix"] == 1
    assert data["sessions"][0]["score"] == 22.2
    assert data["sessions"][1]["score_expired"] is True
    assert client.get("/api/pipeline").json()["board"]["reviewing"][0]["id"] == "1"
    assert client.get("/api/sessions").json()["shadowed"] == data["sessions"]


def test_disconnected_store_returns_actionable_503(workspace, monkeypatch):
    client, *_ = workspace
    def unavailable():
        raise ConnectionError("private connection string must not leak")
    monkeypatch.setattr(store, "pipeline_items", unavailable)
    response = client.get("/api/workspace")
    assert response.status_code == 503
    assert response.json()["connected"] is False
    assert "private connection" not in response.text


def test_approval_queues_one_review_and_preserves_stage(workspace):
    client, db, *_ = workspace
    add_item(db)
    response = client.post("/api/approve/1")
    assert response.status_code == 200
    saved = read_item(db)
    assert saved["stage"] == "reviewing"
    assert saved["human_approved"] is True
    assert saved["awaiting_human"] is False
    assert saved["pending_deploy"] is True
    assert json.loads(db.lindex("queue:review", 0)) == {"item_id": "1"}
    assert client.post("/api/approve/1").status_code == 409
    assert db.llen("queue:review") == 1
    assert len(store.recent_events()) == 1


@pytest.mark.parametrize("fields", [{"stage": "detected"}, {"stage": "deployed"}, {"pending_deploy": False}])
def test_invalid_approval_cannot_leave_approval_flags(workspace, fields):
    client, db, *_ = workspace
    original = add_item(db, **fields)
    assert client.post("/api/approve/1").status_code == 409
    assert read_item(db) == original
    assert db.llen("queue:review") == 0


def test_concurrent_approval_requests_do_not_duplicate_work(workspace):
    client, db, *_ = workspace
    add_item(db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/approve/1").status_code, range(2)))
    assert sorted(responses) == [200, 409]
    assert db.llen("queue:review") == 1


def test_recovery_records_intent_without_changing_deployment(workspace):
    client, db, *_ = workspace
    add_item(db, stage="deployed", pending_deploy=False, rollback_cmd="git checkout -- app.py")
    response = client.post("/api/rollback/1")
    assert response.status_code == 200
    saved = read_item(db)
    assert saved["stage"] == "deployed"
    assert saved["rollback_requested"] is True
    assert "rolled_back" not in saved
    assert response.json()["rollback_cmd"] == "git checkout -- app.py"
    assert "manual action required" in store.recent_events()[-1]["msg"]
    assert client.post("/api/rollback/1").status_code == 409


def test_recovery_rejects_undeployed_finding(workspace):
    client, db, *_ = workspace
    original = add_item(db)
    assert client.post("/api/rollback/1").status_code == 409
    assert read_item(db) == original


def test_unknown_finding_is_404(workspace):
    client, *_ = workspace
    for path in ("/api/approve/missing", "/api/rollback/missing"):
        assert client.post(path).status_code == 404
    assert client.get("/api/findings/missing/patch").status_code == 404


def test_cross_origin_action_rejected_before_mutation(workspace):
    client, db, *_ = workspace
    original = add_item(db)
    assert client.post("/api/approve/1", headers={"Origin": "https://other.example"}).status_code == 403
    assert read_item(db) == original
    assert client.post("/api/approve/1", headers={"Origin": "http://testserver"}).status_code == 200


def write_patch(patch_dir, **changes):
    proposal = {"explanation": "Add a scope check", "files": [
        {"path": "app.py", "new_contents": "new = True\n", **changes}
    ]}
    (patch_dir / "item-1.json").write_text(json.dumps(proposal))


def test_patch_uses_recorded_baseline_after_deployment(workspace):
    client, db, patch_dir, fork_dir = workspace
    add_item(db, stage="deployed")
    (fork_dir / "app.py").write_text("new = True\n")
    write_patch(patch_dir, original_contents="old = True\n")
    data = client.get("/api/findings/1/patch").json()
    assert data["available"] is True
    assert data["files"][0]["baseline"] == "recorded"
    assert "-old = True" in data["files"][0]["diff"]
    assert "+new = True" in data["files"][0]["diff"]


def test_patch_uses_current_fork_only_before_deployment(workspace):
    client, db, patch_dir, fork_dir = workspace
    add_item(db)
    (fork_dir / "app.py").write_text("old = True\n")
    write_patch(patch_dir)
    assert client.get("/api/findings/1/patch").json()["files"][0]["baseline"] == "current fork"
    add_item(db, stage="deployed")
    file = client.get("/api/findings/1/patch").json()["files"][0]
    assert file["baseline"] is None and file["diff"] is None


def test_patch_never_reads_arbitrary_item_path(workspace, tmp_path):
    client, db, *_ = workspace
    secret = tmp_path / "private.json"
    secret.write_text('{"secret":"private"}')
    add_item(db, patch_file=str(secret))
    response = client.get("/api/findings/1/patch")
    assert response.json()["available"] is False
    assert "private" not in response.text


@pytest.mark.parametrize("path", ["../private.py", "/etc/passwd"])
def test_patch_rejects_paths_outside_fork(workspace, path):
    client, db, patch_dir, *_ = workspace
    add_item(db)
    write_patch(patch_dir, path=path)
    assert client.get("/api/findings/1/patch").status_code == 400


def test_patch_rejects_symlinks_outside_artifact_mount(workspace, tmp_path):
    client, db, patch_dir, *_ = workspace
    add_item(db)
    outside = tmp_path / "outside.json"
    outside.write_text('{"files":[]}')
    (patch_dir / "item-1.json").symlink_to(outside)
    assert client.get("/api/findings/1/patch").status_code == 400


def test_patch_rejects_bad_artifacts_and_excessive_size(workspace):
    client, db, patch_dir, *_ = workspace
    add_item(db)
    artifact = patch_dir / "item-1.json"
    artifact.write_text("invalid json")
    assert client.get("/api/findings/1/patch").status_code == 422
    artifact.write_text(" " * (server.MAX_ARTIFACT_BYTES + 1))
    assert client.get("/api/findings/1/patch").status_code == 413


def test_source_symlink_cannot_escape_the_fork(workspace, tmp_path):
    client, db, patch_dir, fork_dir = workspace
    add_item(db)
    outside = tmp_path / "outside.py"
    outside.write_text("private = True\n")
    (fork_dir / "app.py").symlink_to(outside)
    write_patch(patch_dir)
    assert client.get("/api/findings/1/patch").status_code == 400


def test_sse_replays_events_and_serializes_live_records(workspace, monkeypatch):
    client, *_ = workspace
    store.emit("detected", msg="Recorded finding")
    monkeypatch.setattr(store, "iter_live", lambda: iter([{"kind": "reviewing", "ts": "123", "msg": "Live decision"}]))
    response = client.get("/api/stream")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-accel-buffering"] == "no"
    events = [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines() if line.startswith("data: ")]
    assert [event["kind"] for event in events] == ["detected", "reviewing"]
