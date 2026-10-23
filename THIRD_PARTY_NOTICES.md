# Third-party notices

Everything this project owns — including the Duo flow YAML, CI configuration,
gateway Lua, orchestrator, and dashboard — is licensed under the MIT License
in [`LICENSE`](LICENSE).

The components below are **not** owned by this project. They keep their own
licenses, and nothing here relicenses them.

## OWASP crAPI (optional demo target)

- Project: OWASP crAPI — <https://github.com/OWASP/crAPI>
- License: Apache License 2.0
- How it is used: crAPI is an **optional** target the defender can protect.
  Its compose file is fetched from upstream at setup time by
  `crapi/fetch.sh` / `crapi/fetch.ps1` into `crapi/upstream/`, which is
  git-ignored. **No crAPI application source is copied into this
  repository.** The files under `crapi/` that this project owns are only the
  network overlays (`override.prod.yml`, `override.shadow.yml`) and the fetch
  scripts, which are MIT.
- If you redistribute crAPI or a build of it, retain its Apache-2.0 license
  and NOTICE as that project requires.

The default demo target for this project is the in-repo `demo_app/`, which is
original MIT-licensed code.

## Container base images

Pulled at build time, each under its own license: `python:3.12-slim`,
`openresty/openresty:alpine`, `redis:7-alpine`.

## Python dependencies

Declared in the per-service `requirements.txt` files and installed from PyPI
at build time, each under its own license (FastAPI, uvicorn, httpx, redis,
PyYAML, openai, anthropic).
