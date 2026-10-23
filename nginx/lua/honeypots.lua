-- Honeypot (canary) registry: defensive tripwires.
--
-- None of these are real. No legitimate client ever requests a honeypot
-- path, sends a honeypot token, or logs in with a honeypot credential, so
-- ANY interaction with one is a high-confidence signal of malicious probing.
-- A hit adds a large amount to the session's threat score and immediately
-- diverts the session to the shadow decoy.
--
-- Edit freely to match the app you are protecting; keep them plausible so a
-- scanner takes the bait, but never point them at anything real.

return {
  -- Fake-sensitive paths a scanner pokes at but a real user never visits.
  paths = {
    "/.env",
    "/.git/config",
    "/admin/backup",
    "/api/internal/debug",
    "/actuator/env",
    "/config/secrets.json",
    "/api/v2/admin/export",
    "/backup.zip",
  },

  -- Canary tokens: fake secrets seeded in comments/JS/docs as bait. If one of
  -- these strings ever appears in a request, someone found and replayed it.
  tokens = {
    "canary-ak-7f3c91de20b4",
    "sk_live_0000canary0000trap0000",
  },

  -- Fake credentials seeded as bait (e.g. in a decoy config). A login attempt
  -- with one of these usernames means the attacker is using planted creds.
  usernames = {
    "svc_backup_admin",
    "deploy-root",
  },

  -- Points added on any honeypot hit. Well above the routing threshold so a
  -- single hit is enough to divert the session.
  points = 50,
}
