# GitLab automation — setup procedure

How to get the hands-off loop running on GitLab: issue in → patch merge
request → review → green pipeline → deploy, with no human approval in the
middle.

Everything in the repository is already prepared. This document is the part
that has to be done in GitLab itself.

**Order matters.** Step 1 has a ~24 business-hour wait, so start it first.

---

## 1. Access (do this first — it blocks everything else)

1. Register on the [Devpost page](https://gitlab-transcend.devpost.com/).
2. Complete [Transcend contributor onboarding](https://contributors.gitlab.com/transcend-hackathon).
   Approval takes about **24 business hours** and provisions your group,
   subgroup, project, and an onboarding issue.
3. Choose the **Developer + AI** role — this is the role that unlocks the Duo
   Agent Platform. It comes with 500 GitLab Credits per month; the agents stop
   working when the credits run out.
4. You need **Maintainer or Owner** on the project to create flows and
   triggers.

## 2. Push the repository

The local repo is already initialised on `main` with everything staged.

```bash
git remote add origin <your-provisioned-project-url>
git commit -s -m "Webapp Defender: AI-driven defensive pipeline"
git push -u origin main
```

`-s` adds the `Signed-off-by` trailer that the
[GitLab DCO 1.1](https://docs.gitlab.com/ee/legal/developer_certificate_of_origin.html)
requires. See [CONTRIBUTING.md](CONTRIBUTING.md).

Then confirm:

- **Settings > General > Visibility** is **Public**.
- The project overview's **About** panel shows **MIT** (it reads the root
  `LICENSE`).
- `.env` is **not** in the repository (it is git-ignored; only `.env.example`
  with placeholders is tracked).

## 3. Turn on Duo features

1. **Group Settings > GitLab Duo** → ensure **Allow custom flows** is checked
   (on by default). An instance-level switch overrides group settings, so on
   self-managed check **Admin > GitLab Duo** too.
2. If the flow should call the defender's MCP server, allow **external MCP
   tools** for the project.

## 4. Add CI/CD variables

**Settings > CI/CD > Variables**:

| Variable | Value | Notes |
|---|---|---|
| `GITLAB_API_TOKEN` | a token with `api` scope | Lets jobs open the finding issue and post Release/Monitor notes. Mark **Masked**. Jobs still pass without it, but Plan can't open issues. |

Optional, used only when triggering a finding from CI:

| Variable | Purpose |
|---|---|
| `FINDING_TITLE` | Title of the finding issue to open |
| `FINDING_BODY` | Body (vulnerability class, endpoint, severity, evidence) |

## 5. Run the pipeline once

The rules require **visible pipeline history** — a config file that has never
run does not count.

1. Push any commit, or run **Build > Pipelines > New pipeline** on `main`.
2. Confirm every stage appears: `plan`, `create`, `verify`, `package`,
   `secure`, `release`, `configure`, `monitor`, `govern`.
3. `plan:finding-issue` only runs when `FINDING_TITLE` is set, and
   `create:patch-mr-check` only on merge request pipelines — that is expected.
   The rest run on `main`.

If `package`, `release`, `configure` or `monitor` fail, the runner probably
lacks Docker-in-Docker. Use a `docker+machine`/privileged runner, or GitLab's
shared SaaS runners which support it.

## 6. Register the Duo flow

**AI > Flows** → add a flow:

- **Configuration source**: *Configuration path*
- **Path**: `.gitlab/duo/flows/defender.yaml`
- **Visibility**: public, so reviewers can open it

The flow defines three agents chained `detector → fixer → reviewer → end`,
written to the flow registry v1 schema.

> **Verify the tool names.** The `toolset` entries in the flow
> (`get_issue`, `create_issue_note`, `create_merge_request`,
> `get_merge_request`, `create_merge_request_note`) are the documented ones,
> but the authoritative list varies by GitLab version. If the flow fails to
> validate, check the names available on your instance and edit
> `.gitlab/duo/flows/defender.yaml` accordingly.

## 7. Create the trigger

**AI > Triggers** → **New flow trigger**:

| Field | Value |
|---|---|
| Description | `Defender: remediate a finding` |
| Conditions | **On an event** → Event: **Work item** → Run when: **Created** |
| Filter (optional) | limit to the `defender::finding` label |
| Service account | the account the flow acts as |
| Configuration source | the flow from step 6 |

> **There is no push trigger.** Duo triggers fire on *work item*, *merge
> request*, *pipeline*, *mention*, and *assign* events only. The
> issue-created event is how this flow starts — which is also what makes it
> hands-off: opening the finding issue is the single human-visible event, and
> everything after it is automated.

## 8. Make the gate automated, not human

For the loop to be genuinely hands-off, the merge must be gated by the
pipeline rather than by a person:

1. **Settings > Merge requests**:
   - Enable **Pipelines must succeed**.
   - Set **Required approvals** to **0** (Settings > Merge requests >
     Merge request approvals).
   - Optionally enable **Auto-merge** so an MR merges as soon as the pipeline
     goes green.
2. The `govern:policy-gate` job is the policy check. It `needs` the Verify and
   Secure jobs, so it cannot pass unless they did, and it also asserts the MIT
   licence and flow YAML are present.
3. There is no `when: manual` job anywhere in the merge path — by design.

The defender's own runtime guards remain in force regardless:
`REQUIRE_HUMAN_APPROVAL=false`, but the fixer is still sandboxed to
`FORK_DIR`, may only modify files that already exist, and every patch is run
through the static backdoor scan in both the fixer and the reviewer.

## 9. Register the MCP server (optional but prepared)

`.gitlab/duo/mcp.json` registers `mcp/defender_server.py`, which exposes three
tools to Duo: `list_findings`, `get_pipeline_state`, and `tail_shadow_log`.
This lets the flow ask the running defender what it has seen rather than
relying only on the issue text.

The server must be reachable from wherever the flow executes, and the env vars
in `mcp.json` (`REDIS_URL`, `SHADOW_LOG`) must point at the running defender.
Everything it returns is wrapped with an explicit untrusted-data warning.

## 10. End-to-end demo run

1. Start the defender locally: `./start.sh` (see [README](README.md)).
2. Generate attack traffic: `python simulate.py`.
3. The detector opens a finding. Create the corresponding GitLab issue — either
   let the orchestrator do it, or run a pipeline with `FINDING_TITLE` /
   `FINDING_BODY` set so `plan:finding-issue` opens it.
4. The trigger fires the flow. Watch: issue → merge request → pipeline →
   reviewer note → auto-merge → deploy.
5. Record the video from this run (see below).

## 11. Submission

- **Video**: YouTube, Public or Unlisted, **under three minutes**. Show the
  trigger, the issue, the merge request, the green pipeline, and the deploy.
  No third-party trademarks, no copyrighted music.
- **Devpost form**: the public GitLab URL, a description in English naming the
  flow, the trigger, and which stages it covers.
- **Freeze at the deadline** (27 October 2026, 13:00 UTC / 18:30 IST). After
  submitting, leave the repository, video and form alone; do further work on a
  fork.

---

## Checklist

- [ ] Devpost registered; contributor onboarding approved (Developer + AI)
- [ ] Repo pushed, public, DCO-signed commits
- [ ] MIT licence visible in the project About panel
- [ ] `GITLAB_API_TOKEN` set (masked)
- [ ] At least one successful pipeline covering all nine stages
- [ ] Flow registered from `.gitlab/duo/flows/defender.yaml`, public
- [ ] Work-item trigger created and pointed at the flow
- [ ] Pipelines-must-succeed on, required approvals 0, no manual gate
- [ ] `.gitlab/duo/mcp.json` present (and reachable if the flow uses it)
- [ ] One end-to-end run: issue → MR → green pipeline → merge → deploy
- [ ] Video under three minutes, public/unlisted
- [ ] Devpost description in English, naming flow/trigger/stages
