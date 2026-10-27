# Deploy TriNetra (Vercel + Render)

## What goes where

| Surface | Host | Why |
|---------|------|-----|
| Landing + sample workspace (`frontend/dist`) | **Vercel** | Static, fast, free HTTPS |
| Live workspace API (`dashboard` + Redis) | **Render** | Docker + Key Value Redis |
| Gateway / prod+shadow / orchestrator | **Local Docker Compose** | OpenResty + volumes + LLM keys |

Public demo URLs (live, linked):

- Front door (Vercel): https://trinetra-bay.vercel.app — static UI; `/api/*` proxies to Render
- API + Redis (Render): https://trinetra-workspace.onrender.com
- Workspace: https://trinetra-bay.vercel.app/workspace (live API via rewrite)

`ALLOWED_ORIGINS` on Render includes the Vercel production host so approve/rollback POSTs work.

## 1. Vercel (static)

```powershell
cd frontend\dist
vercel login          # once
vercel --prod --yes
```

Or from repo after linking:

```powershell
vercel link --yes
vercel --prod --yes --cwd frontend/dist
```

Config: `frontend/dist/vercel.json` (clean URLs + `/workspace` rewrite).

## 2. Render (workspace + Redis)

1. Push this repo (includes `render.yaml` + `dashboard/Dockerfile.render`).
2. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → select the GitHub/GitLab repo.
3. Apply Blueprint → creates `trinetra-redis` + `trinetra-workspace`.
4. Wait for first deploy; open the service URL (health check `/`).

Manual alternative without Blueprint: **New Web Service** → Docker → root dir `.` → Dockerfile `dashboard/Dockerfile.render`, add Redis and set `REDIS_URL`.

## 3. Env (Render only)

| Var | Source |
|-----|--------|
| `REDIS_URL` | From `trinetra-redis` connection string (Blueprint wires this) |
| `PATCH_DIR` / `FORK_DIR` | `/tmp/...` on free tier (ephemeral) |

LLM / gateway keys stay on the local Compose stack (`.env`), not on Vercel.

## 4. Re-deploy

```powershell
# Static
cd frontend\dist; vercel --prod --yes

# Render rebuilds on git push to the linked branch, or Dashboard → Manual Deploy
```
