# TriNetra operator workspace

The application workspace replaces the original single-screen dashboard. It lives in the existing FastAPI service on port 3000 and uses the same Redis state as the gateway and orchestrator. The landing source stays under `frontend/`. The same service serves the landing page at `/` and the console at `/workspace/`.

## Implemented workflow

1. **Overview.** Open findings, held approvals, retained shadow sessions, deployment records, an hourly signal chart, attention items, pipeline distribution, and the latest worker observations.
2. **Findings.** Search, stage and severity filters, priority/date ordering, pagination, shareable finding links, and an inspector for evidence, recommendations, feedback, patch artifacts, and event history.
3. **Patch reviews.** Pending and queued approvals, actual unified diffs, proposed file contents, recorded source baselines, and an explicit confirmation before queuing an operator decision.
4. **Deployments.** Delivery notes distinguish hot-reload handoffs from required operator rebuilds. Recovery requests record intent and show the existing command; they do not execute it or claim to restore files.
5. **Shadow sessions.** Retained routing membership, threat scores, last recorded reasons, and per-session event inspection. Expired score records remain distinct from routing decisions.
6. **Activity.** Searchable event history with event/time filters and pagination. Snapshot and SSE replay records are deduplicated in the browser.
7. **Configuration.** Connection guidance, actual operating boundaries, light/dark appearance, table density, and live-update preferences. Browser preferences persist locally; infrastructure policy is read only.

Global search supports Cmd/Ctrl K and keyboard navigation. Views support JSON export. The interface uses local assets and system fonts with no production JavaScript dependencies or build step.

## Run the application

Follow the repository's root setup guide to prepare the fork and credentials, then start the selected stack with `./start.sh` or `./start-crapi.sh`. Open the landing page at <http://localhost:3000> and choose **Open workspace**, or go directly to <http://localhost:3000/workspace/>.

Both Compose definitions mount the proposal artifacts and source fork read only into the dashboard. They do not grant the dashboard write access to application files or the Docker socket.

For a standalone dashboard from the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r dashboard/requirements.txt
REDIS_URL=redis://127.0.0.1:6379/0 \
PATCH_DIR="$PWD/patches" FORK_DIR="$PWD/fork" \
.venv/bin/python -m uvicorn dashboard.server:app --host 127.0.0.1 --port 3000
```

Use `crapi/fork` for the crAPI target. A missing state store produces an explicit disconnected view with connection guidance.

### Review without Redis or model credentials

Start the standalone dashboard and open <http://localhost:3000/workspace/?preview=1>. Sample mode is opt-in, visibly labeled, and browser-local. Example approvals and recovery requests never call the live mutation endpoints. Reloading resets the sample records. “Connect live workspace” leaves sample mode and queries the application API.

To review the complete landing-to-workspace navigation with Python's standard library, no installation is needed:

```sh
python3 frontend/tools/build-workspace.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory frontend/dist
```

Open <http://localhost:4173> and choose **Open workspace**. For an explicit sample, use <http://localhost:4173/workspace/?preview=1>. Live connections and operator actions require the FastAPI dashboard, rather than this static preview server. The build helper copies the canonical UI from `dashboard/static/`; run it after workspace edits, and use `--check` to detect a stale static bundle.

## Data contracts

- `GET /api/workspace` returns observed pipeline items, shadow membership and score metadata, recent events, and queue depths. It returns HTTP 503 with `connected: false` when Redis is unavailable.
- `GET /api/findings/{id}/patch` reads only the named artifact inside `PATCH_DIR`. Source paths and symlinks must stay within `FORK_DIR`. Recorded baselines survive deployment; older proposals can use the current fork before deployment, or show the full proposed file when a baseline is unavailable.
- `POST /api/approve/{id}` accepts only a held review item. Validation, the item update, the queue insertion, and the emitted event are one Redis transaction. Duplicate or invalid approvals return HTTP 409 without setting approval flags.
- `POST /api/rollback/{id}` accepts only a deployment record and records `rollback_requested`. It preserves the deployment stage. Duplicate requests return HTTP 409.
- Existing pipeline, sessions, events, and SSE routes remain available. API reference: `/api/docs`.

The chart counts retained scoring/honeypot and diversion events; it is not total request volume. Activity and timelines cover at most the latest 200 events, not an immutable audit archive. Worker counts are timestamped observations, not health probes. Delivery records do not independently verify a running deployment.

This service inherits the repository's existing operator access model. It does not add accounts, organization tenancy, or authentication. Put it behind the deployment's authenticated access proxy before exposing operator actions. Model assignments, approval policy, thresholds, and deployment configuration remain in the service environment and repository files.

## Checks

From the repository root:

```sh
python3 -m pip install -r tests/requirements.txt
python3 -m pytest tests/ -q
npm ci --prefix dashboard
npm test --prefix dashboard
python3 -m py_compile dashboard/server.py common/store.py orchestrator/agents/fixer.py

docker compose config -q
docker compose -f docker-compose.defender.yml config -q
```

Python checks exercise API contracts and transactional state changes against an isolated Redis-compatible test store (`fakeredis`), including concurrent approvals, invalid transitions, artifact boundaries, and event delivery. DOM checks exercise operator workflows, navigation, filtering, search, preferences, connection errors, and escaped untrusted content. Development-only npm packages are not installed in the production Docker image.

### Implementation verification

- 34 Python tests and 16 DOM/interface checks passed, including the original demo tests.
- Both Compose definitions validate; changed Python files compile and browser scripts pass syntax checks.
- The desktop overview, review queue, and patch inspector were visually inspected in Chrome. The console showed zero runtime messages during that review.
- Responsive layouts and mobile navigation behavior are implemented. A complete phone-size visual pass remains unverified because the native browser controller did not provide a reliable device capture.
- Docker was not running during implementation. The complete gateway → model agents → deployment flow was not run; Redis state transitions were checked against the isolated test store.
