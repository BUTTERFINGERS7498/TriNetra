<div align="center">

# 🔱 TriNetra

### *The third eye for your web application*

**Sees the attacker. Moves them somewhere harmless. Closes the hole they came for.**

[![License: MIT](https://img.shields.io/badge/License-MIT-00B894.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![OpenResty](https://img.shields.io/badge/Gateway-nginx%20%2B%20Lua-009639.svg?logo=nginx&logoColor=white)](https://openresty.org/)
[![GitLab Duo](https://img.shields.io/badge/GitLab-Duo%20Agent%20Platform-FC6D26.svg?logo=gitlab&logoColor=white)](https://docs.gitlab.com/user/duo_agent_platform/)
[![Defensive Security](https://img.shields.io/badge/Security-Defensive-8E44AD.svg?logo=shieldsdotio&logoColor=white)](#-safety-model)

</div>

---

## The idea

Most defences **block** an attacker. Blocking tells them they were caught, so
they adapt — and every false positive hits a real customer.

TriNetra does something quieter. It watches every session, and the moment one
starts behaving like an attack it is **silently moved to a decoy** — a perfect
copy of your app. The attacker keeps probing a system that looks real and
isn't. Meanwhile TriNetra studies exactly what they were reaching for, writes
the patch, has a second model tear that patch apart, and ships the fix.

Three agents. One eye that never blinks.

| | Agent | What it does |
|:--:|---|---|
| 👁️ | **Detector** | Reads the decoy's traffic and names the real weakness |
| 🔨 | **Fixer** | Writes a minimal patch, sandboxed to the app's source |
| ⚖️ | **Reviewer** | A *different* model that hunts the patch for backdoors |

---

## It actually works — here's a verified run

A real end-to-end run on the bundled demo app, start to finish:

```
① ATTACK      sqlmap UA + /.env probe + 6 failed logins + 14-ID enumeration
                                    ↓  threat score 162 — threshold is 15
② DIVERTED    session silently routed to the decoy;  a normal user scored 0
                                    ↓  43 requests logged for analysis
③ DETECTED    "SQL injection on /products/{id}"        (high)
              "Sensitive data exposure on /.env"       (medium)
                                    ↓
④ REVIEWED    one patch REJECTED and sent back to the fixer ⚖️
                                    ↓
⑤ DEPLOYED    approved patch hot-reloaded into the running app
```

The patch the agent actually wrote:

```python
def _is_sensitive_path(path: str) -> bool:
    """Block dotfiles (/.env, /.git, ...) and traversal so secrets are never served."""
    decoded = unquote(unquote(path))        # defeats double-encoding
    if "\x00" in decoded: return True       # null-byte check
    # ... rejects any segment that is ".." or begins with "."
```

Verified on the live container afterwards:

| Request | Before | After |
|---|---|---|
| `/.env` | incidental 404 | **explicit deny** |
| `/.git/config` | incidental 404 | **explicit deny** |
| `/products`, `/health` | 200 | **200 — still fine** |
| Test suite | 10 passed | **10 passed, no regression** |

> That rejection in step ④ is the point. The reviewer is a separate model with
> an adversarial brief, and it sent a patch back rather than rubber-stamping it.

---

## How it fits together

```
           ┌──────────────────┐
  traffic ─▶│  👁️  GATEWAY     │  nginx + Lua. Scores every session:
           │    :8080         │  brute force, injection, enumeration,
           └────────┬─────────┘  scanning — plus honeypot tripwires.
                    │
      looks normal  │  looks hostile  (or trips a honeypot → instant)
         ┌──────────┴──────────┐
         ▼                     ▼
  ┌─────────────┐      ┌──────────────┐
  │  PRODUCTION │      │  🕸️  DECOY   │   attacker lands here,
  │  real users │      │   (shadow)   │   and never knows
  └─────────────┘      └──────┬───────┘
                              │ every shadowed request logged
                    ┌─────────▼──────────────────────┐
                    │        ORCHESTRATOR            │
                    │  👁️ detect → 🔨 fix → ⚖️ review │
                    │  queues · crash recovery · scaling
                    └─────────┬──────────────────────┘
                              │ Redis: findings, scores, events
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌───────────────┐             ┌────────────────────┐
      │  📊 DASHBOARD │             │  🦊 GITLAB DUO     │
      │     :3000     │             │  issue → MR →      │
      │  live board   │             │  review → deploy   │
      └───────────────┘             └────────────────────┘
```

<details>
<summary><b>Component breakdown</b></summary>

| Component | What it does |
|---|---|
| **Gateway** | OpenResty (nginx + Lua), the only public entry point. Scores each session, trips honeypot tripwires, routes flagged sessions to the decoy, and logs their traffic. Identity is the cookie *it* issues plus the real peer IP — client headers are never trusted. |
| **Demo app** | The protected app: a small shop-style API with nothing malicious baked in. One image serves as both production and decoy. |
| **Detector** | Reads the decoy traffic log, de-duplicates it, classifies the real weakness. Treats all log content as untrusted data. |
| **Fixer** | Reads source in its sandboxed fork and proposes a minimal patch. May only modify files that already exist. |
| **Reviewer** | A second, independent model. Adversarial brief: assume the author was manipulated and hunt for the backdoor. |
| **Orchestrator** | Schedules the detector; runs self-healing worker pools with crash recovery and queue-depth scaling. |
| **Dashboard** | Live event stream, pipeline board, patch explanations, one-click rollback. |
| **GitLab Duo flow** | The same three agents as a public custom flow — [`.gitlab/duo/flows/defender.yaml`](.gitlab/duo/flows/defender.yaml). |
| **MCP server** | [`mcp/defender_server.py`](mcp/defender_server.py) exposes findings, pipeline state and the decoy log to Duo. |

</details>

---

## 🚀 Quick start

```bash
cp .env.example .env     # add TARGET_URI + your key
./start.sh               # macOS / Linux / Git Bash   (.\start.ps1 on Windows)
```

Open the dashboard at **<http://localhost:3000>**, then make some noise:

```bash
python simulate.py
```

Watch a normal user sail through to production while the hostile session is
scored, diverted, analysed, patched and deployed — live on the board.

```bash
pip install -r tests/requirements.txt && python -m pytest tests/ -q
```

Those tests are the Verify gate: they are what proves an agent's patch didn't
break the app before it ships.

> **Requirements** — Docker + Compose, an OpenAI-compatible or Anthropic LLM
> endpoint, and Python 3.12+ for the helper scripts.

---

## 🦊 GitLab automation

The loop doesn't just run locally — it runs as GitLab activity, so every fix is
auditable: **finding issue → merge request → green pipeline → merge → deploy**,
with no human approval in the middle.

| Stage | Job | Evidence |
|---|---|---|
| Plan | `plan:finding-issue` | Opens an issue for the finding |
| Create | `create:patch-mr-check` | MR traceable to that finding |
| Verify | `verify:tests`, `verify:gateway-lua` | Test suite + gateway syntax |
| Package | `package:image` | Builds and pushes the image |
| Secure | `secure:dependencies`, `secure:secrets` | Dep audit, secret scan (+ GitLab SAST) |
| Release | `release:deploy` | Deploys, records it on the issue |
| Configure | `configure:compose` | Applies repo-stored config |
| Monitor | `monitor:health` | Health check posted back |
| Govern | `govern:policy-gate` | Automated gate — no manual approval exists |

👉 Full walkthrough in **[GITLAB_SETUP.md](GITLAB_SETUP.md)**.

---

## 🛡️ Safety model

TriNetra is **defensive**. It recognises attack-shaped traffic and patches
weaknesses; it never generates or carries out attacks.

Because agents write code that reaches production, the guardrails are layered:

- 🔒 **Sandboxed fixer** — confined to `FORK_DIR`, path-escape attempts rejected
- 📄 **Existing files only** — blocks a planted new-file backdoor
- 🔍 **Static backdoor scan** — runs in the fixer *and* the reviewer, independent
  of the model's verdict: bypass headers, hardcoded secrets, dynamic execution,
  disabled TLS, unconditional privilege grants
- ⚖️ **Independent review** — a different model, adversarially briefed
- 🧪 **Untrusted-data fencing** — decoy traffic is quoted as data, never
  instructions, so planted text can't steer an agent
- ↩️ **Reversible** — every deploy backs up the original and records a rollback
- 🚫 **No ambient privilege** — the orchestrator never gets the host Docker socket

See **[PATCH.md](PATCH.md)** for the hardening pass and the residual risks it
doesn't close.

> Treat TriNetra as a strong starting point, not a turnkey production control.
> Review agent-proposed patches before trusting them in a real environment.

---

## ⚙️ Configuration

| Knob | Where | Default |
|---|---|---|
| Per-agent models | `config/llm.yaml` | — |
| Diversion threshold | `SHADOW_THRESHOLD` | `15` |
| Honeypot tripwires | `nginx/lua/honeypots.lua` | paths, tokens, bait creds |
| Rate ceiling | `RATE_CAP` | `40` req/IP/10s |
| Worker scaling | `MIN_WORKERS` / `MAX_WORKERS` | `1` / `4` |
| Detector cadence | `DETECTOR_INTERVAL` | `20s` |
| Spend caps | `MAX_OPEN_ITEMS`, `JOB_BUDGET_PER_HOUR` | `20`, `40` |
| Human approval | `REQUIRE_HUMAN_APPROVAL` | `false` (hands-off) |

---

## 🧪 Optional: OWASP crAPI as the target

Prefer a realistic victim? Point TriNetra at
[OWASP crAPI](https://github.com/OWASP/crAPI), run as production + decoy stacks:

```bash
bash crapi/fetch.sh     # pulls crAPI's compose from upstream
./start-crapi.sh        # shared network + both stacks + TriNetra
```

Resource-heavy (crAPI runs twice — budget 8 GB+). crAPI is Apache-2.0 and is
**fetched at setup, never vendored**. Its services are compiled, so TriNetra
runs in `rebuild` deploy mode and records the exact rebuild command instead of
hot-reloading.

---

## 📁 Layout

```
nginx/                   👁️  OpenResty gateway — scoring, honeypots, routing
orchestrator/agents/     🔨  detector · fixer · reviewer
demo_app/                🎯  the protected app (production + decoy)
dashboard/               📊  live board on :3000
mcp/defender_server.py   🔌  MCP server for GitLab Duo
common/store.py          🧠  shared Redis state
.gitlab/duo/flows/       🦊  Duo custom flow YAML
.gitlab-ci.yml           ⚙️  nine-stage pipeline
tests/                   🧪  demo app suite (Verify gate)
simulate.py              💥  traffic generator for demos
```

---

## 📚 Docs

| | |
|---|---|
| **[GITLAB_SETUP.md](GITLAB_SETUP.md)** | Step-by-step GitLab automation setup |
| **[PATCH.md](PATCH.md)** | Security hardening pass and residual risks |
| **[AGENT.md](AGENT.md)** | Rules for anyone (human or AI) changing this code |
| **[CONTEXT.md](CONTEXT.md)** | Domain model and data flow |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | MIT + DCO sign-off |
| **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** | Third-party licences |

---

<div align="center">

**TriNetra** · MIT licensed · Built to watch, not to attack

</div>
