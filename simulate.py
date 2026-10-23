"""Traffic generator for exercising the defender end to end.

Sends a mix of normal and clearly hostile-looking requests through the
gateway so you can watch sessions get scored, cross the threshold, get
routed to the shadow decoy, and then flow through the detect -> fix ->
review -> deploy pipeline on the dashboard.

This is a test harness: it only drives the demo app through the public
gateway, the same way any HTTP client would. Run it from the host:

    python simulate.py            # against http://localhost:8080
    python simulate.py http://host:8080
"""

from __future__ import annotations

import sys
import time
import urllib.request
import urllib.error

GATEWAY = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"


def call(method: str, path: str, *, session: str, body: bytes | None = None, ua: str = "demo-client/1.0"):
    url = f"{GATEWAY}{path}"
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("x-session-id", session)
    req.add_header("user-agent", ua)
    if body:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:  # noqa: BLE001
        return f"err:{e}"


def normal_user(session: str) -> None:
    call("GET", "/products", session=session)
    call("GET", "/products/1", session=session)
    call("POST", "/login", session=session, body=b'{"username":"alice","password":"password123"}')
    call("POST", "/orders", session=session, body=b'{"product_id":1,"qty":2}')


def suspicious_user(session: str) -> None:
    # Looks like credential stuffing + injection probing + scanning: the
    # kind of traffic the scoring rules are built to recognize.
    for _ in range(6):
        call("POST", "/login", session=session, body=b'{"username":"admin","password":"x"}')
    call("GET", "/products/1%27%20OR%201=1", session=session, ua="sqlmap/1.7")
    for i in range(15):
        call("GET", f"/products/{100 + i}", session=session)
    call("GET", "/.env", session=session, ua="nikto/2.5")


if __name__ == "__main__":
    print(f"Driving traffic through {GATEWAY}")
    normal_user("user-normal-1")
    normal_user("user-normal-2")
    print("  sent normal traffic (stays on production)")
    suspicious_user("attacker-1")
    print("  sent hostile-looking traffic (should be routed to shadow)")
    print("Watch the dashboard at http://localhost:3000")
    time.sleep(0.2)
