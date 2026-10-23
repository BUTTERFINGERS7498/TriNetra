# Webapp Defender

An AI-driven defensive system for web applications, with the whole post-code
lifecycle automated on GitLab.

It sits in front of your app, recognises hostile traffic, quietly diverts
attackers to a decoy copy, works out which weakness they are going after, and
then drives a **hands-off** remediation loop — finding issue → patch merge
request → review → green pipeline → deploy — with no human approval in the
middle. All of it is watchable live on a dashboard and in GitLab.

Licensed under the [MIT License](LICENSE). Third-party components keep their
own licences, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## How it works

```
          ┌───────────────┐
 traffic ─▶│    gateway    │ nginx + Lua. Scores each session (brute force,
          │  (port 8080)  │ injection, enumeration, scanning) and trips
          └──────┬────────┘ honeypots. Real users pass straight through.
       low score │ high score / honeypot hit
          ┌───────▼──────┐    ┌──────────────┐
          │  app-prod    │    │  app-shadow  │  decoy; attackers land here
          └──────────────┘    └──────┬───────┘
                                     │ gateway logs every shadowed request
                              ┌──────▼─────────────────────────────┐
                              │         orchestrator                │
                              │  detector → fixer → reviewer         │
                              │  (job queue, crash recovery, scaling)│
                              └──────┬─────────────────────────────┘
                                     │ events + pipeline state (Redis)
                     ┌───────────────┴───────────────┐
              ┌──────▼───────┐              ┌────────▼─────────┐
              │  dashboard   │              │  GitLab Duo flow │
              │  (port 3000) │              │  issue → MR →    │
              └──────────────┘              │  review → deploy │
                                            └──────────────────┘
```

### Components

| Component | What it does |
|-----------|--------------|
| **gateway** | OpenResty (nginx + Lua) reverse proxy, the only public entry point. Scores every request, trips honeypot tripwires, and transparently routes flagged sessions to the shadow decoy. Logs shadowed traffic for the detector. |
| **demo_app** | The app the defender protects and patches — a small shop-style API with nothing malicious baked in. One image runs as both `app-prod` and `app-shadow`. |
| **detector** | Reads the shadow traffic log, de-duplicates it, and classifies which requests represent a real weakness. Each finding opens a pipeline item (and a GitLab issue). |
| **fixer** | Reads the source in its sandboxed fork and proposes a minimal patch. Sandboxed to `FORK_DIR`; may only modify files that already exist. |
| **reviewer** | A second, independent model reviews correctness, scope, and safety. A static backdoor scan runs on every patch regardless of the verdict. |
| **orchestrator** | Runs the detector on a schedule plus self-healing worker pools, with crash recovery and queue-depth scaling. |
| **dashboard** | Live log, pipeline board (Detected → Fixing → Reviewing → Deployed), patch explanations, rollback. |
| **GitLab Duo flow** | The same three jobs as a public custom flow, so the loop is visible as GitLab activity. See [`.gitlab/duo/flows/defender.yaml`](.gitlab/duo/flows/defender.yaml). |
| **MCP server** | [`mcp/defender_server.py`](mcp/defender_server.py) exposes findings, pipeline state, and the shadow log to Duo. Registered in [`.gitlab/duo/mcp.json`](.gitlab/duo/mcp.json). |

## Requirements

- Docker and Docker Compose
- An LLM endpoint for the agents. The default is an OpenAI-compatible
  (Azure) deployment: set `TARGET_URI` and `AZURE_OPENAI_API_KEY` (or
  `TARGET_KEY`). Per-agent models live in [`config/llm.yaml`](config/llm.yaml).
- Python 3.12+ on the host if you want to run `simulate.py` or the tests
- For the GitLab automation: a project on GitLab with Duo Agent Platform
  available, and the **Developer + AI** role

## Quick start

```bash
cp .env.example .env     # then fill in TARGET_URI and your key
./start.sh               # macOS/Linux/Git Bash
.\start.ps1              # Windows PowerShell
```

Then:

1. Open the dashboard: <http://localhost:3000>
2. Drive traffic through the gateway and watch it work:
   ```bash
   python simulate.py
   ```

Normal sessions stay on production. The hostile session crosses the scoring
threshold (or trips a honeypot), is moved to the shadow decoy, and its activity
flows through detect → fix → review → deploy on the dashboard.

`start.sh` resets the fork from the pristine app, rebuilds, and starts the
stack. The demo app is Python, so an approved patch is **hot-reloaded** into
the running app with no restart.

## Running the tests

```bash
pip install -r tests/requirements.txt
python -m pytest tests/ -q
```

This is the same suite the CI Verify stage runs, and it is what proves an
agent's patch did not break the app before release.

## GitLab automation

The post-code loop is not only local; it runs on GitLab so it is auditable.

### Duo custom flow

[`.gitlab/duo/flows/defender.yaml`](.gitlab/duo/flows/defender.yaml) defines
three agents — detector, fixer, reviewer — chained
`detector → fixer → reviewer → end`, written to the flow registry v1 schema
(`environment: ambient`, `coding_environment: full`).

To enable it:

1. In the project, turn on **custom flows** (Settings > GitLab Duo), and allow
   external MCP tools if the flow should call the defender over MCP.
2. Go to **AI > Flows** and add the flow, with **Configuration path** set to
   `.gitlab/duo/flows/defender.yaml`. Make it public so judges/reviewers can
   open it. You need Maintainer or Owner.
3. Go to **AI > Triggers** > **New flow trigger** and add a **Work item**
   trigger on *Created* (optionally filtered to the `defender::finding`
   label), pointing at the flow. Issue creation is the only event needed.

> Note: Duo triggers fire on work item, merge request, pipeline, mention, and
> assign events. There is **no push trigger**, so the issue-created event is
> the way to start this flow.

### CI/CD pipeline

[`.gitlab-ci.yml`](.gitlab-ci.yml) has one job per DevSecOps stage:

| Stage | Job | Evidence |
|---|---|---|
| Plan | `plan:finding-issue` | Opens a GitLab issue for a finding |
| Create | `create:patch-mr-check` | Checks the flow's MR is traceable to a finding |
| Verify | `verify:tests`, `verify:gateway-lua` | Test suite + gateway Lua syntax check |
| Package | `package:image` | Builds and pushes the demo app image |
| Secure | `secure:dependencies`, `secure:secrets` + GitLab SAST/Secret Detection | Dependency audit, secret check |
| Release | `release:deploy` | Deploys the patch and records it on the issue |
| Configure | `configure:compose` | Applies the repo-stored compose configuration |
| Monitor | `monitor:health` | Health-checks the deploy, posts state to the issue |
| Govern | `govern:policy-gate` | Automated gate: Verify + Secure must pass to merge |

Optional project CI/CD variables: `GITLAB_API_TOKEN` (scope `api`, for posting
issue notes — jobs still pass without it), and `FINDING_TITLE` / `FINDING_BODY`
to open a finding issue from the Plan stage.

**Hands-off:** there is no `when: manual` job anywhere in the merge path.
Configure the project with *Pipelines must succeed* so the Govern gate is what
allows a merge. `REQUIRE_HUMAN_APPROVAL` is `false` for this reason; the
automated guards (sandbox path check, existing-files-only rule, static backdoor
scan in both the fixer and the reviewer) remain in force.

## Configuration

- **Models** — per-agent model, effort, and token caps in `config/llm.yaml`.
  All three agents currently run on the same deployment.
- **Shadow threshold** — `SHADOW_THRESHOLD` on the gateway (default 15).
- **Honeypots** — tripwire paths, canary tokens, and bait credentials in
  `nginx/lua/honeypots.lua`. Any hit diverts the session immediately.
- **Rate cap** — `RATE_CAP`, requests per IP per 10s before rate scoring.
- **Scaling** — `MIN_WORKERS` / `MAX_WORKERS`; **cadence** — `DETECTOR_INTERVAL`.
- **Spend caps** — `MAX_OPEN_ITEMS`, `JOB_BUDGET_PER_HOUR`.

See [PATCH.md](PATCH.md) for the security hardening pass and its rationale,
[AGENT.md](AGENT.md) for contributor rules, and [CONTEXT.md](CONTEXT.md) for the
domain model.

## Optional: OWASP crAPI as the target

Instead of the demo app you can protect [OWASP crAPI](https://github.com/OWASP/crAPI),
a deliberately-vulnerable training API, run as two stacks (production and
shadow decoy):

```bash
bash crapi/fetch.sh        # pulls crAPI's compose from upstream
./start-crapi.sh           # network + both crAPI stacks + defender
```

This is resource-heavy (crAPI runs twice — budget 8 GB+ for Docker). crAPI is
Apache-2.0 and is **fetched at setup, never vendored here**; its source is not
copied into this repository. Because its services are compiled, the defender
runs in `rebuild` deploy mode: an approved patch is written to the fork and the
exact rebuild command is recorded on the dashboard.

## Safety notes

- The system is defensive. The gateway only *recognises* attack-shaped traffic
  and honeypot hits; the agents read logs, read source, and propose patches.
  Nothing here generates or carries out attacks.
- The fixer is sandboxed to the fork directory and may only modify existing
  files. Every patch is reviewed by a separate model **and** scanned for
  backdoor patterns before deploy, and every deploy records a rollback command.
- Treat this as a strong starting point, not a turnkey production control.
  Review agent-proposed patches before trusting them in a real environment.

## Layout

```
config/llm.yaml              per-agent model configuration
common/store.py              shared Redis state (scores, pipeline, events, queues)
nginx/                       OpenResty gateway: nginx.conf, lua/defender.lua, lua/honeypots.lua
demo_app/                    the protected app (prod + shadow)
orchestrator/
  llm.py                     shared model client
  main.py                    scheduler + worker pools
  agents/                    detector, fixer, reviewer
dashboard/                   web UI on port 3000
mcp/defender_server.py       MCP server exposing findings to Duo
tests/                       demo app test suite (CI Verify stage)
.gitlab/duo/flows/           Duo custom flow YAML
.gitlab/duo/mcp.json         MCP client registration
.gitlab-ci.yml               nine-stage pipeline
simulate.py                  traffic generator for a live demo
docker-compose.yml           demo target (default)
docker-compose.defender.yml  defender services for the crAPI target
start.sh / start.ps1         demo launcher
start-crapi.sh / .ps1        crAPI launcher
```
