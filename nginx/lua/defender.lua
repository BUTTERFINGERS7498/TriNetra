-- Defender logic for the nginx + Lua gateway.
--
-- access():  runs before proxying. Identifies the session, checks honeypots,
--            decides prod vs shadow upstream, and records the choice.
-- log():     runs after the response; defers the scoring + Redis work to a
--            timer (cosockets are disabled in log_by_lua).
--
-- Hardening notes:
--   * Identity is the cookie WE issue plus the real connecting IP. Inbound
--     X-Session-Id / X-Forwarded-For are NOT trusted (they are attacker-
--     controlled and were a free way to mint fresh identities).
--   * Score and shadow-stickiness are tracked per session AND per IP. Once an
--     IP is flagged, every session from it — including brand-new cookies —
--     is routed to shadow, which defeats the "rotate identity and re-check
--     from a clean session" oracle for detecting diversion.
--   * A rate signal catches low-and-slow / spread-across-cookies abuse that
--     no single signature would.
--
-- Shared state lives in the same Redis keys the orchestrator and dashboard
-- use, so they see exactly what this gateway decides.

local cjson = require "cjson.safe"
local redis = require "resty.redis"
local honeypots = require "honeypots"

local M = {}

local PROD = os.getenv("PROD_UPSTREAM") or "crapi-web-prod:80"
local SHADOW = os.getenv("SHADOW_UPSTREAM") or "crapi-web-shadow:80"
local THRESHOLD = tonumber(os.getenv("SHADOW_THRESHOLD") or "15")
local REDIS_HOST = os.getenv("REDIS_HOST") or "redis"
local REDIS_PORT = tonumber(os.getenv("REDIS_PORT") or "6379")
local REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or ""
local SHADOW_LOG = os.getenv("SHADOW_REQUEST_LOG") or "/var/log/defender/shadow.log"
-- Requests per IP per 10s above which traffic is treated as abusive.
local RATE_CAP = tonumber(os.getenv("RATE_CAP") or "40")

local INJECTION = {
  [[(?i)\bunion\s+select\b]],
  [[(?i)\bor\s+1\s*=\s*1\b]],
  [[(?i)';?\s*drop\s+table\b]],
  [[(?i)<script\b]],
  [[(?i)javascript:]],
  [[\.\./\.\./]],
  [[(?i)\$\{.*\}]],
  [[(?i)\bsleep\s*\(]],
}
local SCANNER_UA = [[(?i)(sqlmap|nikto|nmap|dirbuster|gobuster|masscan|hydra|wpscan)]]

local function connect_redis()
  local red = redis:new()
  red:set_timeout(1000)
  local ok, err = red:connect(REDIS_HOST, REDIS_PORT)
  if not ok then
    ngx.log(ngx.ERR, "redis connect failed: ", err)
    return nil
  end
  if REDIS_PASSWORD ~= "" then
    local ok2, aerr = red:auth(REDIS_PASSWORD)
    if not ok2 then
      ngx.log(ngx.ERR, "redis auth failed: ", aerr)
      return nil
    end
  end
  return red
end

local function release(red)
  if red then red:set_keepalive(10000, 100) end
end

local function emit(red, kind, fields)
  fields = fields or {}
  fields.kind = kind
  fields.ts = string.format("%.3f", ngx.now())
  local args = { "events", "MAXLEN", "~", 5000, "*" }
  for k, v in pairs(fields) do
    args[#args + 1] = k
    args[#args + 1] = tostring(v)
  end
  red:xadd(unpack(args))
  red:publish("events:live", cjson.encode(fields))
end

-- Session identity: only the cookie we issued. A brand-new client (no cookie)
-- gets a fresh id and a Set-Cookie. Client-supplied X-Session-Id is ignored.
local function session_id()
  local sid = ngx.var.cookie_sid
  if sid and sid ~= "" and sid:match("^[%x]+$") then return sid, false end
  return string.format("%08x%08x", ngx.now() * 1000 % 0xffffffff, math.random(0, 0xffffffff)), true
end

local function window_incr(key, ttl)
  local mem = ngx.shared.mem
  local n = mem:get(key) or 0
  n = n + 1
  mem:set(key, n, ttl)
  return n
end

local function body_blob()
  ngx.req.read_body()
  local data = ngx.req.get_body_data() or ""
  return data:sub(1, 2000)
end

-- Flag both the session and the IP as shadowed, so neither a new cookie nor a
-- re-used cookie from the same IP escapes the decoy.
local function flag_shadow(red, sid, ip, total, why)
  red:sadd("shadow_sessions", sid)
  if ip and ip ~= "-" then red:sadd("shadow_ips", ip) end
  emit(red, "shadow_route", { session = sid, ip = ip or "-", total = total or 0,
                              msg = "session " .. sid .. " / ip " .. (ip or "-") .. " diverted to shadow (" .. why .. ")" })
end

-- ---- access phase -------------------------------------------------------

function M.access()
  local sid, is_new = session_id()
  local ip = ngx.var.remote_addr or "-"
  ngx.ctx.sid = sid
  ngx.ctx.ip = ip
  ngx.ctx.is_new = is_new

  local red = connect_redis()
  local shadowed = false
  if red then
    shadowed = (red:sismember("shadow_sessions", sid) == 1)
                 or (red:sismember("shadow_ips", ip) == 1)
  end

  local path = ngx.var.uri or "/"
  local args = ngx.var.args or ""
  local body = body_blob()
  local blob = path .. "?" .. args .. " " .. body
  local hp_hit, hp_reason = false, nil

  for _, hp in ipairs(honeypots.paths) do
    if path == hp then hp_hit, hp_reason = true, "honeypot path " .. hp; break end
  end
  if not hp_hit then
    for _, tok in ipairs(honeypots.tokens) do
      if blob:find(tok, 1, true) then hp_hit, hp_reason = true, "honeypot token replayed"; break end
    end
  end
  if not hp_hit and path:find("login", 1, true) then
    for _, u in ipairs(honeypots.usernames) do
      if body:find(u, 1, true) then hp_hit, hp_reason = true, "honeypot credential used: " .. u; break end
    end
  end

  if hp_hit and red then
    local total = tonumber(red:hincrbyfloat("session:" .. sid, "score", honeypots.points)) or 0
    red:expire("session:" .. sid, 3600)
    red:hincrbyfloat("ipscore:" .. ip, "score", honeypots.points)
    red:expire("ipscore:" .. ip, 3600)
    emit(red, "honeypot", { session = sid, ip = ip, reason = hp_reason, points = honeypots.points,
                            total = total, msg = "TRIPWIRE: " .. hp_reason .. " (session " .. sid .. ", ip " .. ip .. ")" })
    if not shadowed then
      flag_shadow(red, sid, ip, total, "honeypot")
      shadowed = true
    end
    ngx.ctx.honeypot = hp_reason
  end

  ngx.ctx.shadowed = shadowed
  ngx.var.backend = shadowed and SHADOW or PROD
  ngx.var.sid_hdr = sid
  release(red)
end

-- ---- log phase ----------------------------------------------------------

function M.log()
  local sid = ngx.ctx.sid
  if not sid then return end
  local data = {
    sid = sid,
    ip = ngx.ctx.ip or (ngx.var.remote_addr or "-"),
    status = tonumber(ngx.var.status) or 0,
    path = ngx.var.uri or "/",
    args = ngx.var.args or "",
    ua = ngx.var.http_user_agent or "-",
    method = ngx.req.get_method(),
    shadowed = ngx.ctx.shadowed and true or false,
    honeypot = ngx.ctx.honeypot,
  }
  local ok, err = ngx.timer.at(0, M.process, data)
  if not ok then ngx.log(ngx.ERR, "defender timer failed: ", err) end
end

function M.process(premature, d)
  if premature then return end
  local sid, ip, status = d.sid, d.ip, d.status
  local path, args, ua = d.path, d.args, d.ua
  local blob = path .. "?" .. args

  local red = connect_redis()
  if not red then return end

  local hits = {}  -- {points, reason}

  for _, pat in ipairs(INJECTION) do
    if ngx.re.find(blob, pat, "jo") then hits[#hits + 1] = { 8, "injection pattern" }; break end
  end
  if ngx.re.find(ua, SCANNER_UA, "jo") then hits[#hits + 1] = { 10, "scanner user-agent" } end
  if status == 401 and path:find("login", 1, true) then
    local n = window_incr("lf:" .. ip, 60)   -- per IP, so cookie rotation doesn't reset it
    if n >= 5 then hits[#hits + 1] = { 7, n .. " failed logins in 60s (ip)" } end
  end
  if ngx.re.find(path, [[/\d+$]], "jo") then
    local n = window_incr("enum:" .. ip, 60)
    if n >= 12 then hits[#hits + 1] = { 5, "object enumeration (" .. n .. ", ip)" } end
  end
  if status == 404 then
    local n = window_incr("nf:" .. ip, 60)
    if n >= 8 then hits[#hits + 1] = { 5, n .. " 404s in 60s (ip)" } end
  end
  -- Rate signal: catches low-and-slow spread across many cookies from one IP.
  local rate = window_incr("rate:" .. ip, 10)
  if rate > RATE_CAP then hits[#hits + 1] = { 6, "request rate " .. rate .. "/10s (ip)" } end

  local shadowed = d.shadowed
  if #hits > 0 then
    local stotal, itotal = 0, 0
    for _, h in ipairs(hits) do
      stotal = tonumber(red:hincrbyfloat("session:" .. sid, "score", h[1])) or 0
      itotal = tonumber(red:hincrbyfloat("ipscore:" .. ip, "score", h[1])) or 0
      red:hset("session:" .. sid, "last_reason", h[2])
      red:expire("session:" .. sid, 3600)
      red:expire("ipscore:" .. ip, 3600)
      emit(red, "score", { session = sid, ip = ip, points = h[1], reason = h[2], total = stotal })
    end
    -- Divert if EITHER the session or the IP crosses the threshold.
    if not shadowed and (stotal >= THRESHOLD or itotal >= THRESHOLD) then
      flag_shadow(red, sid, ip, math.max(stotal, itotal), "score")
      shadowed = true
    end
  end

  if shadowed then
    local score = red:hget("session:" .. sid, "score")
    local line = cjson.encode({
      ts = ngx.now(), session = sid, ip = ip,
      method = d.method, path = path, query = args,
      status = status, ua = ua, score = tonumber(score) or 0,
      honeypot = d.honeypot or nil,
    })
    local f = io.open(SHADOW_LOG, "a")
    if f then f:write(line .. "\n"); f:close() end
  end
  release(red)
end

return M
