"""Include the canonical operator UI in the standalone static site.

Run after workspace source changes. The application server serves dashboard/
static directly; this copy lets the existing static landing preview and static
hosting navigate to the same workspace without a separate port.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "dashboard" / "static"
DESTINATION = ROOT / "frontend" / "dist" / "workspace"
FILES = ("index.html", "workspace.css", "workspace.js", "sample-data.js", "favicon.svg")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the static workspace bundle is stale")
    args = parser.parse_args()
    if args.check:
        stale = [name for name in FILES if not (DESTINATION / name).is_file()
                 or (SOURCE / name).read_bytes() != (DESTINATION / name).read_bytes()]
        if stale:
            print("Workspace bundle is stale: " + ", ".join(stale))
            print("Run python3 frontend/tools/build-workspace.py")
            return 1
        print("Static workspace bundle is current.")
        return 0
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(SOURCE / name, DESTINATION / name)
    print(f"Bundled {len(FILES)} workspace files at {DESTINATION.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
