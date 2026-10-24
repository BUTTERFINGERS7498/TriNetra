# WORKFLOW.md — how TriNetra actually runs

TriNetra has **two loops**. They are independent: either runs without the
other, and they meet at the finding.

| | Loop | Where it runs | What it produces |
|---|---|---|---|
| **A** | Runtime defence | Your Docker host | A diverted attacker and a deployed patch |
| **B** | GitLab remediation | GitLab Duo + CI | A triaged issue, a patch MR, a green pipeline |

Status legend used throughout: ✅ verified working · ⚠️ partial · ❌ blocked.

---

## Loop A — runtime defence (local)

```
 attacker ─┐
 real user ─┴──▶ ① GATEWAY :8080 ─── score < 15 ──▶ ② PRODUCTION app
                     (nginx + Lua)
                         │ score ≥ 15, or honeypot hit
                         ▼
                   ③ SHADOW DECOY ──▶ ④ logs/shadow.log
                                            │
                                            ▼
                                     ⑤ DETECTOR (LLM)
                                            │ finding
                                            ▼
                                      ⑥ FIXER (LLM, sandboxed)
                                            │ patch
                                            ▼
                                     ⑦ REVIEWER (LLM) + static scan
                                            │ approved
                                            ▼
                                   ⑧ DEPLOY (hot reload) ──▶ ⑨ DASHBOARD :3000
```

### Step by step

| # | Step | What happens | Status |
|---|---|---|---|
| ① | **Score** | Every request is scored per session *and* per IP: injection patterns, scanner UAs, failed-login bursts, object enumeration, 404 sweeps, request rate. Honeypot paths/tokens/credentials score 50 and divert instantly. | ✅ |
| ② | **Pass through** | Anything below the threshold reaches production untouched. A normal user never notices TriNetra exists. | ✅ |
| ③ | **Divert** | At score ≥ 15 the session *and its IP* are flagged. All further traffic silently goes to the decoy. Sticky: rotating cookies does not escape it. | ✅ |
| ④ | **Log** | The gateway writes every shadowed request to `logs/shadow.log`. Logging at the gateway is what makes the rest app-agnostic. | ✅ |
| ⑤ | **Detect** | Every `DETECTOR_INTERVAL` (20s) the detector reads new lines, normalises and de-duplicates them, and classifies real weaknesses. Log content is fenced as untrusted data. | ✅ |
| ⑥ | **Fix** | The fixer reads source inside `FORK_DIR` only, and may modify existing files only. Output goes to `patches/`, never straight to production. | ✅ |
| ⑦ | **Review** | A *different* model reviews adversarially. Independently, a static scan blocks bypass headers, hardcoded secrets, dynamic execution, disabled TLS and unconditional privilege grants — regardless of the model's verdict. | ✅ |
| ⑧ | **Deploy** | `hotreload`: patched file is copied into the live directory and picked up without restart. `rebuild`: written to the fork, with the rebuild command recorded for a human. | ✅ |
| ⑨ | **Observe** | Dashboard streams events over SSE: live log, pipeline board, patch explanations, rollback. | ✅ |

### Verified run

A real end-to-end execution on the demo app:

```
attack     sqlmap UA + /.env probe + 6 failed logins + 14-ID enumeration
           → threat score 162 (threshold 15)
divert     session routed to decoy; a normal user scored 0 and stayed on prod
detect     "SQL injection on /products/{id}" (high)
           "Sensitive data exposure on /.env" (medium)
review     one patch REJECTED and sent back to the fixer
deploy     approved patch hot-reloaded into the running app
verify     /.env and /.git/config explicitly denied; /products and /health
           still 200; test suite still 10/10
```

### Run it

```bash
cp .env.example .env     # TARGET_URI + key
./start.sh               # or .\start.ps1
python simulate.py       # drives normal + hostile traffic
```

Dashboard: <http://localhost:3000> · Gateway: <http://localhost:8080>

---

## Loop B — GitLab remediation

```
 ① finding issue created
        │  (trigger: Work item → Created)
        ▼
 ② DUO FLOW "TriNetra Defender"  (flow 1019503, public, enabled)
        │
        ├── Step 1  ASSESS  ──▶ ③ note on the issue            ✅
        ├── Step 2  PATCH   ──▶ ④ branch + commit              ❌ blocked
        └── Step 3  REVIEW  ──▶ ⑤ merge request                ❌ blocked
                                      │
                                      ▼
                            ⑥ CI PIPELINE (9 stages)           ✅
                                      │ green
                                      ▼
                            ⑦ AUTO-MERGE (govern gate)         ✅ configured
```

### Step by step

| # | Step | What happens | Status |
|---|---|---|---|
| ① | **Trigger** | Creating a work item fires the flow. This is the *only* human action in the loop. | ✅ |
| ② | **Flow starts** | A session spawns under service account `@ai-trinetra-defender-gitlab-ai-hackathon`. | ✅ |
| ③ | **Assess** | The agent reads the issue and posts vulnerability class, endpoint, severity and evidence as a note. It explicitly reports whether the issue text contained embedded instructions. | ✅ |
| ④ | **Patch** | *Blocked.* The agent has no repository tools in a trigger-started ambient session. | ❌ |
| ⑤ | **Merge request** | *Blocked* — needs ④. | ❌ |
| ⑥ | **Pipeline** | Nine stages, 11/11 green. See the stage table below. | ✅ |
| ⑦ | **Merge gate** | "Pipelines must succeed" on, required approvals **0**, no `when: manual` anywhere. Fully automated. | ✅ |

### The blocker, in the agent's own words

From session `10002374`:

> I finished Step 1 and couldn't do Steps 2 and 3. I didn't open a merge request.
>
> **Step 2 (blocked).** I have no tool that reads repository files, edits them,
> or creates a branch or commit. My only tools here are get issue, add issue
> note, and create merge request.

`coding_environment: full` does not appear to attach a workspace to a
trigger-started ambient session. This is a platform capability question, not a
YAML problem — no flow configuration can work around it. Asked on issue #1.

> **Note on flow shape.** The flow was first written as three chained agents
> (detector → fixer → reviewer). GitLab stored that correctly but executed only
> the entry point. It was folded into one agent performing the three roles as
> ordered steps. That restructure is *not* what blocks the MR — the three-agent
> version would hit the same missing-tools wall at the fixer.

### CI stages

| Stage | Job | Evidence |
|---|---|---|
| Plan | `plan:finding-issue` | Opens an issue from a finding (needs `FINDING_TITLE`) |
| Create | `create:patch-mr-check` | MR traceable to a finding (MR pipelines only) |
| Verify | `verify:tests`, `verify:gateway-lua` | 10/10 tests + gateway Lua syntax |
| Package | `package:image` | Builds and pushes the demo app image |
| Secure | `secure:dependencies`, `secure:secrets` + SAST, secret detection | Dependency audit, secret scan |
| Release | `release:deploy` | Deploys, records result on the issue |
| Configure | `configure:compose` | Applies repo-stored compose config |
| Monitor | `monitor:health` | Health check posted back to the issue |
| Govern | `govern:policy-gate` | Needs Verify + Secure; asserts MIT licence and flow YAML present |

---

## Where the loops meet

Loop A produces findings from real traffic. Loop B acts on findings inside
GitLab. The handoff is the **finding issue**:

- **Manually** — paste a detector finding into a new issue.
- **From CI** — run a pipeline with `FINDING_TITLE` / `FINDING_BODY` set and
  `plan:finding-issue` opens it via the API.
- **From the orchestrator** — the detector's output is already in the shape the
  issue wants (class, endpoint, severity, evidence, recommendation).

---

## Honest summary

**Working end to end:** the whole runtime defence loop, including a real agent
patch deployed into a running app and verified by tests; the nine-stage
pipeline green at 11/11; the Duo flow triggering automatically and producing a
correct, well-reasoned security assessment with its prompt-injection guardrails
demonstrably holding.

**Not working:** the patch/MR half of Loop B, because trigger-started flow
agents currently get no repository tools.

**What that means in practice:** TriNetra demonstrates a complete autonomous
remediation loop locally, and the GitLab half demonstrates autonomous triage.
The two are joined by the finding issue, and will join fully once flow agents
can reach the repository.

---

## Reference

| Thing | Value |
|---|---|
| Project | `gitlab-ai-hackathon/transcend-october-2026/43660752/showcase` |
| Flow | `TriNetra Defender`, id `1019503`, public, enabled |
| Service account | `@ai-trinetra-defender-gitlab-ai-hackathon` |
| Trigger | Work item → Created (plus Mention / Assign for manual runs) |
| Green pipeline | `#2984477090` — 11/11 |
| Blocked session | `10002374` |

See also: [README](README.md) · [CONTEXT](CONTEXT.md) · [AGENT](AGENT.md) ·
[PATCH](PATCH.md) · [GITLAB_SETUP](GITLAB_SETUP.md)
