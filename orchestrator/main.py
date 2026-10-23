"""Orchestrator: schedules the detector and runs the agent worker pools.

Responsibilities:
  * run the detector on a fixed interval,
  * run a pool of fixer workers draining the "fix" queue,
  * run a pool of reviewer workers draining the "review" queue,
  * recover crashed workers by restarting their threads,
  * scale the fixer/reviewer pools up or down based on queue depth.

Each worker pulls one job at a time and marks it done; if a worker raises,
the supervisor logs it and spawns a replacement so a single bad job never
takes the whole pipeline down.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import traceback

sys.path.append("/app")
from common import store  # noqa: E402
from orchestrator.agents import detector, fixer, reviewer  # noqa: E402

DETECTOR_INTERVAL = float(os.environ.get("DETECTOR_INTERVAL", "20"))
MIN_WORKERS = int(os.environ.get("MIN_WORKERS", "1"))
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "4"))
SCALE_EVERY = float(os.environ.get("SCALE_EVERY", "10"))

_stop = threading.Event()


def _detector_loop() -> None:
    while not _stop.is_set():
        try:
            detector.run_once()
        except Exception:
            store.emit("error", component="detector", msg=traceback.format_exc()[-500:])
        _stop.wait(DETECTOR_INTERVAL)


def _worker(queue: str, handler, worker_id: str) -> None:
    store.emit("worker", msg=f"{queue} worker {worker_id} up")
    while not _stop.is_set():
        try:
            job = store.dequeue(queue, timeout=3)
            if job is None:
                continue
            handler(job["item_id"])
        except Exception:
            store.emit("error", component=f"{queue}-worker", worker=worker_id,
                       msg=traceback.format_exc()[-500:])
            time.sleep(1)  # avoid a tight crash loop on a poisoned job


class Pool:
    """A self-healing, scalable pool of workers for one queue."""

    def __init__(self, queue: str, handler):
        self.queue = queue
        self.handler = handler
        self.threads: dict[str, threading.Thread] = {}
        self._seq = 0

    def _spawn(self) -> None:
        self._seq += 1
        wid = f"{self.queue}-{self._seq}"
        t = threading.Thread(target=_worker, args=(self.queue, self.handler, wid), daemon=True)
        self.threads[wid] = t
        t.start()

    def ensure(self, target: int) -> None:
        target = max(MIN_WORKERS, min(MAX_WORKERS, target))
        # Replace any dead threads (crash recovery).
        for wid, t in list(self.threads.items()):
            if not t.is_alive():
                store.emit("worker", msg=f"{wid} died; restarting")
                del self.threads[wid]
        while len(self.threads) < target:
            self._spawn()
        while len(self.threads) > target:
            # Let the extra worker finish naturally; just stop tracking it.
            wid, _ = self.threads.popitem()


def main() -> None:
    store.emit("orchestrator", msg="orchestrator starting")
    threading.Thread(target=_detector_loop, daemon=True).start()

    fix_pool = Pool("fix", fixer.handle)
    review_pool = Pool("review", reviewer.handle)
    fix_pool.ensure(MIN_WORKERS)
    review_pool.ensure(MIN_WORKERS)

    while not _stop.is_set():
        fix_depth = store.queue_depth("fix")
        review_depth = store.queue_depth("review")
        # One worker per ~2 queued jobs, within [MIN, MAX].
        fix_pool.ensure(MIN_WORKERS + fix_depth // 2)
        review_pool.ensure(MIN_WORKERS + review_depth // 2)
        store.emit("scale", fix_workers=len(fix_pool.threads), review_workers=len(review_pool.threads),
                   fix_queue=fix_depth, review_queue=review_depth)
        _stop.wait(SCALE_EVERY)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        _stop.set()
