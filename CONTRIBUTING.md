# Contributing

## Licence and sign-off

Everything this project owns — including the Duo flow YAML, CI configuration,
gateway Lua, orchestrator, dashboard, and the MCP server — is contributed under
the [MIT License](LICENSE) and the
[GitLab Developer Certificate of Origin 1.1](https://docs.gitlab.com/ee/legal/developer_certificate_of_origin.html).

Sign off every commit:

```bash
git commit -s -m "Describe the change"
```

That appends the `Signed-off-by:` trailer the DCO requires. To sign off a
commit you already made:

```bash
git commit --amend -s --no-edit
```

## What not to break

Read [AGENT.md](AGENT.md) before changing anything. Its golden rules exist
because they are load-bearing for security, and [PATCH.md](PATCH.md) records
why. In particular, do not:

- re-trust `X-Forwarded-For` / `X-Session-Id` from clients in the gateway,
- widen the fixer's sandbox beyond `FORK_DIR`, or let it create new files,
- remove the static backdoor scan from the fixer or the reviewer,
- give the orchestrator the host Docker socket,
- put real credentials anywhere but an untracked `.env`.

## Third-party code

Keep third-party components under their own licences and record them in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). crAPI (Apache-2.0) is fetched
at setup time into the git-ignored `crapi/upstream/`; never vendor its source
into this repository.

## Before you push

```bash
python -m pytest tests/ -q                                  # Verify stage
docker compose config -q                                    # demo stack
docker compose -f docker-compose.defender.yml config -q      # defender stack
```
