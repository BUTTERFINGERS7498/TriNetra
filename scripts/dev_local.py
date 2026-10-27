"""Run the whole defender stack on one machine, without Docker or model keys.

Starts an in-process Redis-compatible server (fakeredis), the demo app as
production and shadow, the real gateway, the real dashboard and a worker that
runs the real reviewer for human-approved patches. The detector and fixer need
a model, so their output is seeded instead: findings and patch artifacts are
written in the same shape the agents produce.

    .venv\\Scripts\\python.exe scripts\\dev_local.py [--no-seed]

Gateway http://127.0.0.1:8080   Dashboard http://127.0.0.1:3000
Runtime files live in .dev/ (ignored by git). Ctrl+C stops everything.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / ".dev"
PY = sys.executable
REDIS_PORT = 6390
PORTS = {"prod": 8001, "shadow": 8002, "gateway": 8080, "dashboard": 3000}


def prepare() -> dict[str, str]:
    for sub in ("fork", "deployed", "logs", "patches/backups"):
        (DEV / sub).mkdir(parents=True, exist_ok=True)
    for sub in ("fork", "deployed"):
        shutil.copy2(ROOT / "demo_app" / "app.py", DEV / sub / "app.py")
    for log in ("prod.log", "shadow.log"):
        (DEV / "logs" / log).write_text("", encoding="utf-8")
    env = dict(os.environ)
    env.update(
        REDIS_URL=f"redis://127.0.0.1:{REDIS_PORT}/0",
        PYTHONPATH=os.pathsep.join([str(ROOT), str(ROOT / "gateway")]),
        PYTHONUTF8="1",
        FORK_DIR=str(DEV / "fork"),
        DEPLOY_DIR=str(DEV / "deployed"),
        PATCH_DIR=str(DEV / "patches"),
        BACKUP_DIR=str(DEV / "patches" / "backups"),
        APP_LOG_DIR=str(DEV / "logs"),
        SHADOW_REQUEST_LOG=str(DEV / "logs" / "shadow.log"),
        PROD_UPSTREAM=f"http://127.0.0.1:{PORTS['prod']}",
        SHADOW_UPSTREAM=f"http://127.0.0.1:{PORTS['shadow']}",
        REQUIRE_HUMAN_APPROVAL="true",
    )
    return env


def start_redis() -> None:
    from fakeredis import TcpFakeServer

    server = TcpFakeServer(("127.0.0.1", REDIS_PORT), server_type="redis")
    threading.Thread(target=server.serve_forever, daemon=True).start()


def spawn(module: str, port: int, env: dict[str, str], app_dir: Path | None = None, **extra: str) -> subprocess.Popen:
    cmd = [PY, "-m", "uvicorn", module, "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"]
    if app_dir:
        cmd += ["--app-dir", str(app_dir)]
    return subprocess.Popen(
        cmd,
        cwd=ROOT, env={**env, **extra},
    )


def seed() -> None:
    from common import store

    now = time.time()
    app_src = (ROOT / "demo_app" / "app.py").read_text(encoding="utf-8")
    patched = app_src.replace("def ", "# reviewed by TriNetra\ndef ", 1)

    def item(i: int, stage: str, title: str, vuln: str, endpoint: str, severity: str, age: int, **extra) -> None:
        store.add_pipeline_item({
            "id": str(i), "stage": stage, "title": title, "vuln_class": vuln, "endpoint": endpoint,
            "severity": severity, "created": f"{now - age:.3f}", "updated": f"{now - age + 30:.3f}",
            "evidence": f"Shadow session probed {endpoint} with attacker-controlled input.",
            "recommendation": f"Validate input on {endpoint} and reject malformed values.", **extra})

    item(101, "detected", "SQL injection probing on /products", "sql_injection", "/products/{id}", "high", 900)
    item(102, "fixing", "Credential stuffing against /login", "broken_auth", "/login", "medium", 800,
         fix_attempts=1, review_feedback="Patch changed unrelated login messages; keep the fix minimal.")
    item(103, "reviewing", "Object enumeration on /orders", "idor", "/orders/{id}", "high", 700,
         pending_deploy=True, awaiting_human=True, review_reasoning="Minimal, in-scope ownership check.",
         explanation="Adds an input guard on the affected handler.", changed_paths=["app.py"],
         patch_file=str(DEV / "patches" / "item-103.json"))
    item(104, "deployed", "Verbose error leaks stack trace", "info_disclosure", "/products", "low", 600,
         review_reasoning="Generic error body, no behaviour change.",
         explanation="Adds an input guard on the affected handler.", changed_paths=["app.py"], deploy_note="hot-reloaded into the running app",
         rollback_cmd="git checkout -- app.py", deployed_at=f"{now - 500:.0f}",
         patch_file=str(DEV / "patches" / "item-104.json"))
    item(105, "rejected", "Debug header accepted on /admin", "backdoor", "/admin", "critical", 500,
         review_reasoning="Patch introduced a hard-coded bypass.", fix_attempts=3)
    for i in (103, 104):
        (DEV / "patches" / f"item-{i}.json").write_text(json.dumps({
            "explanation": "Adds an input guard on the affected handler.",
            "files": [{"path": "app.py", "new_contents": patched, "original_contents": app_src}]}),
            encoding="utf-8")

    for n, (sid, score, why) in enumerate([("sid-attacker-1", 34.0, "sql injection pattern in /products"),
                                           ("sid-attacker-2", 21.5, "login brute force (6 failures/min)")]):
        store.bump_score(sid, score, why)
        store.route_to_shadow(sid)
    for kind, msg, item_id in [("detected", "finding opened: SQL injection probing", "101"),
                               ("fixing", "fixer working on: credential stuffing", "102"),
                               ("reviewing", "patch approved by model: awaiting human approval", "103"),
                               ("deployed", "patch approved & deployed: verbose error", "104"),
                               ("rejected", "patch rejected after 3 attempts", "105")]:
        store.emit(kind, item_id=item_id, msg=msg)
    store.emit("worker", msg="review worker review-1 up")


def review_worker() -> None:
    """Drain queue:review with the real reviewer (human-approved path needs no model)."""
    stub = types.ModuleType("orchestrator.llm")
    stub.run_agent = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no model in the local stack"))
    sys.modules.setdefault("orchestrator.llm", stub)
    from common import store
    from orchestrator.agents import reviewer

    store.emit("worker", msg="review worker review-1 up")
    while True:
        try:
            job = store.dequeue("review", timeout=1)
            if job:
                reviewer.handle(str(job["item_id"]))
        except Exception as exc:  # noqa: BLE001
            store.emit("error", component="review-worker", detail=str(exc)[:200])
            time.sleep(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-seed", action="store_true")
    args = parser.parse_args()
    env = prepare()
    os.environ.update(env)
    sys.path[:0] = [str(ROOT), str(ROOT / "gateway")]
    start_redis()
    time.sleep(0.5)
    procs = [
        spawn("app:app", PORTS["prod"], env, DEV / "deployed", APP_ROLE="prod"),
        spawn("app:app", PORTS["shadow"], env, DEV / "deployed", APP_ROLE="shadow"),
        spawn("proxy:app", PORTS["gateway"], env, ROOT / "gateway"),
        spawn("dashboard.server:app", PORTS["dashboard"], env),
    ]
    if not args.no_seed:
        seed()
    threading.Thread(target=review_worker, daemon=True).start()
    print(f"gateway   http://127.0.0.1:{PORTS['gateway']}\ndashboard http://127.0.0.1:{PORTS['dashboard']}", flush=True)
    try:
        while all(p.poll() is None for p in procs):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            p.terminate()


if __name__ == "__main__":
    main()
