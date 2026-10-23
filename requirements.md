# Life After Code submission requirements

Changes required so Webapp Defender can be submitted to the GitLab Transcend hackathon, Life After Code.

Sources: [hackathon overview](https://gitlab-transcend.devpost.com/), [official rules](https://gitlab-transcend.devpost.com/rules), [resources](https://gitlab-transcend.devpost.com/resources). Deadline is **27 October 2026, 13:00 UTC** (18:30 IST). Winners are announced on or around 16 November 2026.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Path | **A — Start Fresh** | This tree was created on 23 October 2026, inside the submission window (on or after 5 October). Path A forbids a pre-existing project. Deployment is optional on this path. |
| Autonomy | **Hands-off** | Prize target is Best Hands-off Agent ($5,000). A push or a new issue must run the loop through to a deployed fix with no human approval in the middle. |
| Required platform | **GitLab Duo Agent Platform** | Every project must use Duo agents, flows, or MCP clients. Calling Grok from `orchestrator/llm.py` does not meet this by itself. |
| License | **MIT** for everything this project owns, including agent and flow YAML | Required, and the `LICENSE` file must show in the GitLab About section. |
| Stages | Touch all nine DevSecOps stages | Most Stages Covered is a separate $5,000 prize. Touching a stage counts. |

crAPI stays an optional demo target. Its upstream compose is Apache-2.0, so it is not the Path B original project and it must not be relicensed as MIT. Prefer the in-repo `demo_app` as the app the pipeline patches.

## What is already true

- Detector, fixer, and reviewer exist in `orchestrator/agents/`.
- The demo app can hot-reload an approved patch (`DEPLOY_MODE=hotreload`).
- `REQUIRE_HUMAN_APPROVAL` defaults to false, which matches a hands-off deploy.
- The fixer is sandboxed to `FORK_DIR`. That guard stays.

## What is missing

- No Git repository, no public GitLab project, no Devpost submission.
- No root `LICENSE`.
- No `.gitlab-ci.yml`, so there is no visible pipeline history.
- No Duo agent, flow, trigger, or `.gitlab/duo/mcp.json`.
- The post-code loop runs inside the Python orchestrator against Azure OpenAI. It does not run as a GitLab flow from an issue or a push.
- README still describes Claude and `ANTHROPIC_API_KEY`.

## 1. Account and access

1. Register on [the Devpost page](https://gitlab-transcend.devpost.com/).
2. Complete [Transcend contributor onboarding](https://contributors.gitlab.com/transcend-hackathon). Approval takes about 24 business hours and creates the hackathon group, subgroup, project, and onboarding issue.
3. Use the **Developer + AI** role. It is the role that unlocks Duo Agent Platform. Each participant gets 500 GitLab Credits per month. Usage stops when the credits run out.
4. The entrant must be at least the age of majority where they live. One person submits for a team. India is not on the exclusion list.
5. Turn on custom agents and custom flows for the project, and allow external MCP tools if the flow calls an MCP server. Creating an agent or flow requires Maintainer or Owner on that project.

## 2. Public GitLab project

1. Put this project in the provisioned public GitLab project. The repository must contain source, assets, and instructions to run it.
2. Add a root `LICENSE` file with the MIT text so GitLab shows it in the About section.
3. Commits of project-owned code, including agent and flow YAML, are under MIT and [GitLab DCO 1.1](https://docs.gitlab.com/ee/legal/developer_certificate_of_origin.html).
4. Third-party code stays under its own OSI license. Leave the Apache-2.0 notice on anything fetched from crAPI. Do not copy crAPI application source into this repo.
5. Keep `.env` out of the repo. `.env.example` keeps placeholders only.
6. README run instructions must match the submitted stack: Docker Compose, the public GitLab project, and Duo onboarding. Drop the Anthropic-only setup as the primary path.
7. All submission text, the video, and test instructions are in English.

## 3. Duo Agent Platform

The hands-off loop has to be visible on GitLab, not only inside the local orchestrator.

1. Add a **public custom flow** under **AI > Flows**, configured with the [custom flow YAML schema](https://docs.gitlab.com/user/duo_agent_platform/flows/custom_flows_schema/). A custom flow defines its own agents in that YAML. It cannot call a separate catalog agent.
2. The flow covers the same jobs the Python agents already have:
   - **Detector** reads shadowed attack evidence and opens a finding.
   - **Fixer** writes a minimal patch as a merge request, limited to the application source.
   - **Reviewer** checks correctness, scope, and safety, then merges when the pipeline is green.
3. Add a [trigger](https://docs.gitlab.com/user/duo_agent_platform/triggers/) so the flow starts from an issue or a push. Hands-off means that event is the only human action. The next check-in shows a merged fix and a deploy.
4. Enable the flow on the project. Public visibility, so judges can open it.
5. Add `.gitlab/duo/mcp.json` so Duo can call the defender (findings, pipeline state, or the gateway log) through an MCP server. MCP client setup is [documented here](https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_clients/).
6. Keep the Python orchestrator as the runtime behind that flow. `orchestrator/llm.py` may keep calling the configured Azure endpoint, and every agent stays on `grok-4.7` until the models are split again. The Duo flow is what the submission has to demonstrate.
7. Export or commit the flow YAML in the repository. The rules treat agent configuration YAML as part of the submission.

Foundational flows (Code Review, Fix CI/CD Pipeline, Software Development, Developer) and the CI Expert agent may be enabled as extra stages. They do not replace the custom flow.

## 4. CI/CD and the nine stages

Add `.gitlab-ci.yml` and run it until the project has **visible pipeline history of this automation**. A file that has never run does not meet the rule.

Each stage below needs one real job or one real Duo action. The pipeline history and the demo must show it.

| Stage | Required evidence in this project |
|---|---|
| Plan | The flow opens a GitLab issue for each finding (vulnerability class, endpoint, severity, evidence). |
| Create | The flow opens a merge request whose diff is the patch. |
| Verify | A CI job runs the demo app tests, or a smoke check, on that merge request. |
| Package | A CI job builds the demo app image. |
| Secure | A CI job runs SAST, dependency scanning, or secret detection, and the pipeline must be green before merge. |
| Release | A CI job deploys the approved patch (hot-reload or image publish) and records the result on the issue. |
| Configure | The deploy job applies the compose or cloud config that is stored in the repo. |
| Monitor | After deploy, a job or the flow posts a health or pipeline-state note back to the issue. |
| Govern | A non-human policy gate: merge only when the secure and verify jobs pass. No manual approval job, because this entry is hands-off. |

`REQUIRE_HUMAN_APPROVAL` stays `false` for the submitted demo. The fixer path guard stays in place. The flow must not widen writes to the production tree except through the existing deploy step.

## 5. Submission package

On Devpost, before the deadline:

1. The project built on Duo Agent Platform, as above.
2. A text description of the problem, what the defender does, and how GitLab automates the post-code lifecycle. Name the flow, the trigger, and which stages it touches.
3. The public GitLab URL, MIT license visible in About, and pipeline history showing a run.
4. A YouTube video, **under three minutes**, Public or Unlisted. Show the automation running end to end: trigger, issue, merge request, green pipeline, deploy. No third-party trademarks and no copyrighted music. Judges do not have to watch past three minutes.
5. After the deadline, leave the submitted form, repository, video, and linked deploy alone. More work happens on a fork.

## 6. Optional prizes

These are not required to enter.

- **Google Cloud bonus (up to 0.2 points, max final score 5.2).** Deploy the demo on Google Cloud. Commit the deployment code in the public repo and put a public live URL on the form. New Google Cloud accounts can get $300 in free credit. The deploy should stay up until winners are announced around 16 November. If it goes down, the entry stays eligible and judges use the video and the repo.
- **Most Environmentally Impactful ($5,000, opt in on the form).** Explain the sustainability choices and quantify the gain with a public method and the Software Carbon Intensity framework.
- **Most Creative ($4,000).** Highest Innovation score. No separate artifact.
- **Most Stages Covered ($5,000, one winner per path).** Covered by section 4.

A project can win one path prize and one special prize.

## Acceptance checklist

- [ ] Devpost registration and GitLab contributor approval are done.
- [ ] Public GitLab project shows an MIT license in About.
- [ ] A public Duo flow, with its YAML in the repo, runs from an issue or a push through detect, patch, review, merge, and deploy with no human approval.
- [ ] `.gitlab/duo/mcp.json` is present if the flow calls the defender over MCP.
- [ ] `.gitlab-ci.yml` has at least one successful pipeline on the submitted project, covering verify, package, secure, release, configure, monitor, and govern as in the table above.
- [ ] Plan and create are visible as a GitLab issue and a merge request produced by the flow.
- [ ] README run steps match this stack and contain no secrets.
- [ ] YouTube demo is public or unlisted and under three minutes.
- [ ] Devpost description is in English and names the post-code automation.
- [ ] Submitted repo, video, and form are frozen at the deadline.
