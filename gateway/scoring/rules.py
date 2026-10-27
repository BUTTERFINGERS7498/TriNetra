"""Rule-based threat scoring for incoming requests.

Each rule looks at one request (and a little per-session memory) and
returns a list of (points, reason) hits. The gateway adds the points to
the session's running score; when the total crosses a threshold the
session is transparently moved to the shadow environment.

These are detection heuristics only — they recognize the shape of common
hostile traffic (credential stuffing, injection attempts, resource
enumeration, scanning). They do not generate or carry out any attack.
"""

from __future__ import annotations

import re
import time
from urllib.parse import unquote
from dataclasses import dataclass, field

# Substrings that strongly suggest an injection attempt in user input.
_INJECTION_PATTERNS = [
    r"(?i)\bunion\s+select\b",
    r"(?i)\bor\s+1\s*=\s*1\b",
    r"(?i)';?\s*drop\s+table\b",
    r"(?i)<script\b",
    r"(?i)javascript:",
    r"(?i)\.\./\.\./",          # path traversal
    r"(?i)\$\{.*\}",            # template / expression injection
    r"(?i)\bsleep\s*\(",        # time-based probing
]
_INJECTION_RE = [re.compile(p) for p in _INJECTION_PATTERNS]

# Paths a scanner typically pokes at but a normal client never requests.
_SCANNER_PATHS = {
    "/.env", "/.git/config", "/admin", "/wp-login.php",
    "/phpmyadmin", "/config.json", "/backup.zip", "/server-status",
}

# Clients that announce themselves as scanning tools.
_SCANNER_UA_RE = re.compile(r"(?i)(sqlmap|nikto|nmap|dirbuster|gobuster|masscan|hydra|wpscan)")


@dataclass
class Hit:
    points: float
    reason: str


@dataclass
class SessionMemory:
    """Small sliding-window memory kept per session in the gateway."""

    login_failures: list[float] = field(default_factory=list)
    seen_product_ids: dict[int, float] = field(default_factory=dict)
    not_found_times: list[float] = field(default_factory=list)

    def prune(self, now: float, window: float = 60.0) -> None:
        self.login_failures = [t for t in self.login_failures if now - t < window]
        self.not_found_times = [t for t in self.not_found_times if now - t < window]
        self.seen_product_ids = {k: v for k, v in self.seen_product_ids.items() if now - v < window}


def score_request(
    *,
    method: str,
    path: str,
    query: str,
    body: str,
    user_agent: str,
    status: int,
    mem: SessionMemory,
) -> list[Hit]:
    now = time.time()
    mem.prune(now)
    hits: list[Hit] = []
    blob = unquote(unquote(f"{path}?{query} {body}"))

    # 1. Injection attempts in the URL or body.
    for rx in _INJECTION_RE:
        if rx.search(blob):
            hits.append(Hit(8.0, f"injection pattern: {rx.pattern}"))
            break

    # 2. Scanner fingerprints.
    if _SCANNER_UA_RE.search(user_agent):
        hits.append(Hit(10.0, f"scanner user-agent: {user_agent[:40]}"))
    if path in _SCANNER_PATHS:
        hits.append(Hit(6.0, f"probe of sensitive path: {path}"))

    # 3. Credential brute force: several failed logins in the window.
    if path == "/login" and status == 401:
        mem.login_failures.append(now)
        if len(mem.login_failures) >= 5:
            hits.append(Hit(7.0, f"{len(mem.login_failures)} failed logins in 60s"))

    # 4. Object enumeration: sweeping many distinct product ids quickly.
    m = re.match(r"/products/(\d+)", path)
    if m:
        mem.seen_product_ids[int(m.group(1))] = now
        if len(mem.seen_product_ids) >= 12:
            hits.append(Hit(5.0, f"enumerated {len(mem.seen_product_ids)} product ids"))

    # 5. 404 sweeping: lots of misses in a short window.
    if status == 404:
        mem.not_found_times.append(now)
        if len(mem.not_found_times) >= 8:
            hits.append(Hit(5.0, f"{len(mem.not_found_times)} 404s in 60s"))

    return hits
