# PATCH.md — Defender hardening pass

This records a round of security hardening applied to TriNetra
after a red-team review of its own architecture. Each section states the
problem, then the solution shipped. All changes are defensive.

## Context

The defender scores traffic per session and transparently diverts
attack-shaped sessions to a shadow decoy, then runs an LLM pipeline
(detect → fix → review → deploy) to patch what attackers probe. A review
found several ways to evade or abuse that design. This pass closes them.

---

## 1. Identity spoofing & cheap session minting

**Problem.** Session identity came from a client-supplied cookie *and* an
`X-Session-Id` header, and the proxy sat behind `X-Forwarded-For`. An
attacker could set those headers freely to mint unlimited fresh identities,
resetting their threat score at will and keeping each identity under the
diversion threshold.

**Solution.**
- Identity is now the `sid` cookie the gateway itself issues, plus the real
  TCP peer IP. Inbound `X-Session-Id`, `X-Forwarded-For`, `X-Real-IP`,
  `X-Forwarded-Host`, and `Forwarded` are no longer trusted and are
  overwritten at the proxy before reaching the app.
- Threat score now accumulates **per IP** as well as per session, so
  spreading abuse across many cookies no longer resets progress.
- Added a **rate signal** (requests per IP per 10s over `RATE_CAP`) that
  catches low-and-slow / spread-across-cookies abuse no single signature
  would.

Files: `nginx/lua/defender.lua`, `nginx/nginx.conf`.

## 2. Detecting diversion (the rotate-and-recheck oracle)

**Problem.** Because diversion is transparent and the decoy is a copy,
an attacker could do a write on one session, open a *clean* session, and
check whether the write persisted — a reliable oracle for "am I on the
decoy?", then rotate identity and continue.

**Solution.** **Per-IP shadow stickiness.** Once any session from an IP is
flagged (by score or by a honeypot), the IP is added to a `shadow_ips` set,
and every session from that IP — including brand-new cookies — is routed to
the shadow decoy. The "clean session" used for the oracle is therefore also
on shadow, so the check no longer distinguishes prod from decoy.

Verified: after a honeypot hit from one cookie, a fresh benign cookie from
the same IP was routed to shadow.

Files: `nginx/lua/defender.lua`.

## 3. Prompt injection & backdoor patches through the pipeline

**Problem.** An attacker on the decoy writes request content that the
detector LLM later reads. Crafted content could (a) inject instructions into
the detector, or (b) steer the fixer into writing a subtle backdoor that a
single reviewer might wave through — the defender then deploying the
attacker's code to production.

**Solution (defense in depth).**
- **Detector:** the shadow log is parsed and re-serialized to known fields
  only, control characters stripped, values truncated, and wrapped in an
  explicit untrusted-data fence. The system prompt instructs the model to
  treat all log content as data and never act on instructions inside it.
- **Fixer:** may only **modify files that already exist** in the fork
  (`ALLOW_NEW_FILES=false`) — blocking a planted new-file backdoor — and its
  prompt forbids bypasses, hardcoded secrets, and dynamic execution.
- **Static safety scan** (`_scan_patch`) runs on every proposed patch in the
  fixer *and* again in the reviewer, independent of the LLM verdict. It
  blocks bypass/backdoor headers, dynamic code/shell execution, hardcoded
  credentials, disabled TLS verification, unconditional privilege grants, and
  oversized diffs.
- **Reviewer:** adversarial prompt that assumes the author may have been
  manipulated and hunts for hidden backdoors and scope creep.
- **Human approval gate** (`REQUIRE_HUMAN_APPROVAL=true`): an AI-approved
  patch is held on the dashboard for a person to approve before it deploys.

Verified: a sample bypass-header/admin patch was blocked by the static scan;
a clean fix passed.

Files: `orchestrator/agents/detector.py`, `orchestrator/agents/fixer.py`,
`orchestrator/agents/reviewer.py`, `dashboard/server.py`,
`dashboard/static/index.html`.

## 4. Cost / resource exhaustion (DoS on the LLM budget)

**Problem.** Sustained, unique-looking attack traffic on the decoy keeps the
detector finding "new" issues, opening pipeline items and burning LLM tokens
— cheap bytes in, expensive inference out.

**Solution.**
- **Normalize-dedup:** volatile parts (numbers, long tokens) are replaced
  before hashing, so randomized payloads collapse to a few signatures.
- **`MAX_OPEN_ITEMS`:** back-pressure — stop opening new items past a cap.
- **`JOB_BUDGET_PER_HOUR`:** hard hourly ceiling on fix jobs.
- **Per-run finding cap** on each detector pass.

Files: `orchestrator/agents/detector.py`.

## 5. Proxy & Redis exposure

**Problem.** Forwarding headers could influence routing/identity (see §1),
and shared state sat in an unauthenticated Redis reachable by any container
on the shared network.

**Solution.**
- Forwarding/identity headers overwritten at the proxy (see §1).
- Redis is not published to the host and sits only on the internal
  `defender-net`. Optional `REDIS_PASSWORD` is wired through the gateway and
  all services; set it and uncomment the Redis `--requirepass` line to
  require auth.

Files: `nginx/nginx.conf`, `common/store.py`, `docker-compose.defender.yml`.

---

## New / changed configuration knobs

| Env var | Default | Effect |
|---|---|---|
| `RATE_CAP` | 40 | Requests/IP/10s before rate scoring applies |
| `ALLOW_NEW_FILES` | false | If true, fixer may create files (not recommended) |
| `REQUIRE_HUMAN_APPROVAL` | true | Hold AI-approved patches for human sign-off |
| `MAX_OPEN_ITEMS` | 20 | Pipeline back-pressure cap |
| `JOB_BUDGET_PER_HOUR` | 40 | Hourly fix-job ceiling |
| `REDIS_PASSWORD` | (unset) | Require Redis auth when set |

## Known residual risks

- **Shared egress IP coarseness.** When many clients share one source IP
  (NAT, or all traffic via localhost in a demo), per-IP scoring and
  stickiness are blunt — they treat that IP as one actor. The per-session
  layer still applies underneath. Real clients with distinct IPs are scored
  independently.
- **TOCTOU at the diversion boundary.** Rules that depend on the response
  status are evaluated after the response, so the first threshold-crossing
  request can still be served by production before the session flips to
  shadow. Honeypots and injection patterns are caught *before* proxying and
  divert immediately; status-based rules cannot be. Closing this fully needs
  pre-proxy, request-only scoring.
- **LLM judgment is not infallible.** The static scan, existing-files-only
  rule, and human-approval gate exist precisely because the reviewer model
  can be wrong; keep human approval on for any real environment.
