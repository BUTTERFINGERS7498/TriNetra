# TriNetra deploy (clean split)

| Role | Host | URL |
|------|------|-----|
| **Frontend** (landing + workspace UI) | **Vercel** | https://trinetra-bay.vercel.app |
| **Backend** (FastAPI + Redis) | **Render** | https://trinetra-workspace.onrender.com |

## How they connect

- Browser only opens **Vercel**.
- Vercel `vercel.json` rewrites `/api/*` → Render.
- Workspace calls `/api/workspace` same-origin; Vercel proxies that to Render.
- Render has `SERVE_STATIC=0` so it is **API-only** (UI redirects to Vercel).

## Demo URLs

- App: https://trinetra-bay.vercel.app  
- Workspace (sample): https://trinetra-bay.vercel.app/workspace?preview=1  
- API health: https://trinetra-workspace.onrender.com/api/health  

## Redeploy

```powershell
# Frontend
cd frontend\dist
vercel --prod --yes

# Backend: git push to GitHub (Render Blueprint auto-syncs) or Manual Deploy in dashboard
```

Gateway / orchestrator / OpenResty stay on local Docker Compose — not on Vercel/Render.
