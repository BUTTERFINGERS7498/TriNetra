# CONTEXT.md

The domain model and data flow behind TriNetra. Read this with
`AGENT.md` (which covers rules and conventions) before changing behavior.

## The problem

A web app faces hostile traffic mixed in with real users. We want to:

1. keep real users on a healthy production app, untouched;
2. recognize attackers and quietly send them somewhere harmless;
3. learn what weakness they are going after; and
4. close that weakness automatically, with a human-style review gate and a
   way to undo it.

## The core idea

Instead of blocking suspicious traffic (which tips off the attacker and
risks false positives on real users), the defender **diverts** it. A
session that looks hostile is transparently moved to a **shadow** copy of
the app — a decoy. The attacker keeps probing a system that looks real but
is isolated. Meanwhile the defender studies that activity and patches the
real weakness.

## Key concepts (vocabulary)

- **Session** — a client, identified by a `sid` cookie (or `x-session-id`
  header). Scoring and routing are per session.
- **Threat score** — a running number per session, increased by scoring
  rules. Stored in Redis; decays by key expiry (1 hour).
- **Shadow routing** — once a session's score crosses
  `SHADOW_THRESHOLD`, it is added to the `shadow_sessions` set and all its
  future requests go to the shadow upstream. The move is sticky and
  invisible to the client.
- **Production vs shadow** — two instances of the same app. Production
  serves everyone below the threshold; shadow is the decoy for everyone
  above it.
- **Finding** — a weakness the detector identifies from shadow traffic
  (vuln class, endpoint, severity, evidence, recommendation).
- **Pipeline item** — a finding as it moves across stages:
  `detected → fixing → reviewing → deployed` (or `rejected`).
- **Fork** — an isolated working copy of the app's source (`FORK_DIR`)
  that the fixer edits. Never production.
- **Patch** — the fixer's proposed new file contents, stored under
  `patches/` until the reviewer rules on it.
- **Deploy mode** — how an approved patch reaches the running app:
  `hotreload` (copy into the live dir; uvicorn `--reload` picks it up) or
  `rebuild` (write to the fork; a human runs the recorded rebuild command,
  used for crAPI's compiled services).

## Data flow

```
client ──HTTP──▶ gateway ──▶ prod upstream        (score below threshold)
                    │
                    ├─ scores the request (scoring/rules.py)
                    ├─ bumps the session score in Redis
                    └─ at/over threshold ──▶ shadow upstream  (sticky)
                                             │
                          gateway writes each shadowed request
                          to logs/shadow.log (app-agnostic)
                                             │
 orchestrator (every DETECTOR_INTERVAL s):   ▼
   detector reads logs/shadow.log, de-dups, asks Claude to classify
     → opens pipeline items (stage=detected), enqueues "fix" jobs
   fixer worker: reads FORK_DIR source, proposes a patch
     → writes patches/item-<id>.json, stage=reviewing, enqueues "review"
   reviewer worker: second model approves or rejects
     → approve: apply to fork, deploy per mode, stage=deployed (+rollback)
     → reject:  stage=fixing with feedback (re-queued up to MAX_FIX_ATTEMPTS)
                or stage=rejected when attempts are exhausted
                                             │
 everything emits events to Redis ───────────▼
   dashboard (port 3000) streams the live log via SSE and renders the
   pipeline board, patch explanations, and a rollback button.
```

## Where state lives

All shared state is in Redis, behind `common/store.py`:

| State | Redis structure | Written by | Read by |
|---|---|---|---|
| Session score | hash `session:<id>` | gateway | gateway, dashboard |
| Shadowed sessions | set `shadow_sessions` | gateway | gateway, dashboard |
| Pipeline items | hash `pipeline:items` | orchestrator, dashboard | dashboard |
| Work queues | lists `queue:fix`, `queue:review` | detector/reviewer | orchestrator workers |
| Event log | stream `events` + pub/sub `events:live` | everyone | dashboard |
| Detector dedup | set `detector:seen` | detector | detector |

Nothing durable lives in the app containers; restarting them is safe. The
fork, deployed copy, patches, and logs live on mounted host directories.

## Trust boundaries

- The **only public entry point** is the gateway (port 8080). Upstreams and
  Redis are not published to the host in the crAPI setup.
- The **fixer** is confined to `FORK_DIR`; path-escape attempts are
  rejected before any write.
- **Agents never touch production directly.** A patch reaches production
  only after the reviewer approves it, and in `rebuild` mode only when a
  human runs the recorded command.
- **LLM output is untrusted input.** It is parsed as JSON against a schema
  and, for file writes, constrained to the sandbox. Treat anything a model
  returns as data, not instructions.

## The two targets

- **demo_app** — a tiny FastAPI shop (login, products, orders). One image,
  `APP_ROLE=prod|shadow`. Nothing malicious is baked in. Python, so it uses
  `hotreload` deploy. Good for seeing the whole loop quickly.
- **OWASP crAPI** — a realistic, deliberately-vulnerable training API run as
  two stacks (prod + shadow) on a shared Docker network. Compiled services,
  so it uses `rebuild` deploy. Heavier, more realistic. Detection is
  app-agnostic; patching needs crAPI source mounted at `FORK_DIR`.

## Design decisions worth knowing

- **Scoring is rule-based, not ML.** It is transparent, cheap, and easy to
  reason about. The LLM is used for the hard judgment calls (what the
  weakness is, how to fix it, whether the fix is sound), not for per-request
  triage.
- **The gateway logs shadow traffic, not the app.** This keeps the pipeline
  independent of what the protected app is, which is why the same defender
  works for both the demo app and crAPI.
- **Review is a separate model.** A single model grading its own fix is a
  weak check; an independent reviewer is the safety gate.
- **Deploys are reversible.** Every approved patch backs up the prior file
  and records a rollback command shown on the dashboard.
