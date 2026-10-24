# AGENT.md — TriNetra

Guidance for anyone — human or AI — working on this repository. Read this
before making changes.

## What this project is

**TriNetra** ("third eye") is an AI-driven **defensive** security system for
web applications. A gateway scores incoming traffic, transparently diverts
attackers to a shadow decoy, and an autonomous detect → fix → review → deploy
pipeline patches the weaknesses attackers probe.

It is original, from-scratch code. It was inspired by the *feature set* of the
Mahoraga Webapp Defender project, but shares none of that project's code.

## Golden rules

1. **Defensive only.** Every component recognizes, logs, isolates, or
   patches hostile activity. Do not add anything that generates, launches,
   or assists attacks. The scoring rules describe attack *shapes* so the
   gateway can spot them — they are detection signatures, not exploits.
2. **The fixer is sandboxed.** It may only read/write inside `FORK_DIR`.
   Never widen that path to production. The path guard in
   `orchestrator/agents/fixer.py` (`_safe_path`) and
   `reviewer.py` (`relative_to` check) must stay.
3. **No auto-privilege.** The orchestrator must not be given the host
   Docker socket. Compiled-service deploys are surfaced as a recorded
   rebuild command for a human to run, never executed by an agent.
4. **Two models, genuinely independent.** The fixer and reviewer run on
   different models on purpose (see `config/llm.yaml`). Don't collapse
   them onto one — the review is the safety check on the fix.
5. **Credentials come from the environment.** `ANTHROPIC_API_KEY` is read
   from env only. Never read keys from a config file or commit them.

## Repository map

```
config/llm.yaml              per-agent model, effort, token caps, pricing
common/store.py              shared Redis state (scores, pipeline, events, queues)
gateway/
  proxy.py                   reverse proxy; scoring; shadow routing; shadow log
  scoring/rules.py           rule-based threat signatures
demo_app/app.py              lightweight target app (prod + shadow via APP_ROLE)
orchestrator/
  llm.py                     shared Claude client (reads config/llm.yaml)
  main.py                    scheduler + self-healing worker pools
  agents/detector.py         reads shadow log → findings → pipeline + fix jobs
  agents/fixer.py            reads fork source → proposes patch (sandboxed)
  agents/reviewer.py         approves/rejects; deploys (hotreload | rebuild)
dashboard/                   FastAPI + single-page UI (port 3000), SSE live log
simulate.py                  app-agnostic traffic generator for demos
docker-compose.yml           demo-app target
docker-compose.defender.yml  defender services for the crAPI target
crapi/                       crAPI integration (fetch + network overlays)
```

See `CONTEXT.md` for the domain model and data flow.

## How to run

- **Demo target (light):** `./start.sh` (or `.\start.ps1`), then
  `python simulate.py`.
- **crAPI target (heavy):** `bash crapi/fetch.sh`, then `./start-crapi.sh`
  (or the `.ps1` equivalents). Needs ~8 GB for Docker.
- Dashboard: <http://localhost:3000>. Public entry (send traffic here):
  <http://localhost:8080>.

## Conventions

- **Python 3.12**, standard library + FastAPI/uvicorn/httpx/redis/anthropic.
  Keep dependencies minimal and pinned in each service's
  `requirements.txt`.
- **Imports across services:** each container puts `/app` on `sys.path` and
  imports `common.store`. Keep `common/` dependency-light (only `redis`).
- **State lives in Redis**, reached only through `common/store.py`. Add new
  shared state by adding a helper there, not by scattering raw Redis calls.
- **Events** drive the dashboard. Emit one with `store.emit(kind, **fields)`;
  include a human-readable `msg`. The dashboard refreshes the board on the
  `detected|fixing|reviewing|deployed|rejected|rollback` kinds.
- **Structured LLM output:** agents pass a JSON schema to
  `llm.run_agent(...)` and `json.loads` the result. Always handle
  `result.stop_reason == "refusal"` and empty text before parsing.
- **Pipeline stages** are the single source of truth in
  `common/store.PIPELINE_STAGES`; the dashboard mirrors them.

## Before you commit

- `python -m py_compile` every file you touched (CI-equivalent minimum).
- `docker compose config -q` and
  `docker compose -f docker-compose.defender.yml config -q` must pass.
- Don't commit `.env`, `logs/*.log`, `fork/`, `deployed/`, or `patches/*`
  (see `.gitignore`).
- Keep the two targets working: a change to shared code (gateway,
  orchestrator, common, dashboard) must not break either compose file.

## Extending

- **Protect a different app:** point `PROD_UPSTREAM` / `SHADOW_UPSTREAM` at
  it and set `FORK_DIR` to its source. The gateway/orchestrator/dashboard
  are app-agnostic.
- **New scoring signal:** add a rule in `gateway/scoring/rules.py` returning
  `Hit(points, reason)`; keep it a detector, not an attack.
- **New source language for the fixer:** add its glob to `SOURCE_GLOBS` and,
  if it is compiled, run in `DEPLOY_MODE=rebuild` with a suitable
  `REBUILD_CMD`.
