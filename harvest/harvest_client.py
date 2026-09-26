"""
harvest_client.py
=================
HTTP client that calls the local self-hosted CAPTCHA generator services
and saves images + ground-truth JSON to disk.

Both generator endpoints must already be running (via docker compose up).
This is *not* a web scraper — it only targets our own Docker containers.

Usage
-----
    python harvest/harvest_client.py --type text --difficulty medium --count 50

Directory layout
----------------
    d:/fly swarm/data/<type>/<difficulty>/<ground_truth_id>/
        render_0.png
        render_1.png
        ...
        ground_truth.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import time
from pathlib import Path

import requests
from PIL import Image
import io

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Generator endpoints (local Docker containers, never third-party)
# ---------------------------------------------------------------------------

GENERATOR_A_URL = "http://localhost:8001/generate"  # joshuavanderpoll
GENERATOR_B_URL = "http://localhost:8002/generate"  # dev-3bdulrahman

# Types served by each generator
GENERATOR_A_TYPES = {"broken_circle", "scatter", "rotate", "slider", "grid", "tiles"}
GENERATOR_B_TYPES = {"image", "math", "text", "slider"}

DATA_ROOT = Path("d:/fly swarm/data")

MAX_RETRIES: int = 1    # retry once on failure (§6)
TIMEOUT_SEC: int = 10


def _endpoint_for_type(captcha_type: str) -> str:
    if captcha_type in GENERATOR_A_TYPES:
        return GENERATOR_A_URL
    if captcha_type in GENERATOR_B_TYPES:
        return GENERATOR_B_URL
    raise ValueError(f"Unknown CAPTCHA type: {captcha_type!r}")


def _fetch_one(
    captcha_type: str,
    difficulty: str,
) -> tuple[Image.Image, dict] | None:
    """
    Fetch a single CAPTCHA challenge from the appropriate local generator.

    Returns (PIL image, ground_truth dict) or None on unrecoverable failure.
    """
    url = _endpoint_for_type(captcha_type)
    params = {"type": captcha_type, "difficulty": difficulty}

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT_SEC)
            resp.raise_for_status()
            data = resp.json()
            img_bytes = bytes.fromhex(data["image_hex"])
            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            ground_truth = data["ground_truth"]
            return image, ground_truth
        except Exception as exc:
            if attempt < MAX_RETRIES:
                logger.warning("Attempt %d failed (%s), retrying…", attempt + 1, exc)
                time.sleep(1)
            else:
                logger.error("Skipping sample after %d attempts: %s", MAX_RETRIES + 1, exc)
                return None


def harvest(
    captcha_type: str,
    difficulty: str,
    count: int,
    n_renders: int = 5,
) -> None:
    """
    Harvest `count` unique ground-truth challenges, each with `n_renders`
    independently-varied renders.

    All output goes under: d:/fly swarm/data/<type>/<difficulty>/
    """
    out_root = DATA_ROOT / captcha_type / difficulty
    out_root.mkdir(parents=True, exist_ok=True)

    skip_count = 0
    saved = 0

    while saved < count:
        renders: list[Image.Image] = []
        ground_truth: dict | None = None

        for render_idx in range(n_renders):
            result = _fetch_one(captcha_type, difficulty)
            if result is None:
                skip_count += 1
                break
            img, gt = result
            if ground_truth is None:
                ground_truth = gt
            renders.append(img)

        if len(renders) < n_renders:
            continue   # skip this challenge — partial renders

        # Derive a stable ID from the ground truth content
        gt_id = hashlib.md5(
            json.dumps(ground_truth, sort_keys=True).encode()
        ).hexdigest()[:12]

        challenge_dir = out_root / gt_id
        challenge_dir.mkdir(exist_ok=True)

        for i, img in enumerate(renders):
            img.save(challenge_dir / f"render_{i}.png")

        with open(challenge_dir / "ground_truth.json", "w") as f:
            json.dump(ground_truth, f, indent=2)

        saved += 1
        if saved % 10 == 0:
            logger.info("Saved %d/%d challenges for type=%s difficulty=%s",
                        saved, count, captcha_type, difficulty)

    logger.info(
        "Harvest complete. Saved=%d, Skipped=%d (skip_rate=%.1f%%)",
        saved, skip_count,
        100 * skip_count / max(skip_count + saved, 1),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Harvest CAPTCHA samples from local generators.")
    parser.add_argument("--type", required=True,
                        choices=sorted(GENERATOR_A_TYPES | GENERATOR_B_TYPES))
    parser.add_argument("--difficulty", default="medium",
                        choices=["easy", "medium", "hard"])
    parser.add_argument("--count", type=int, default=300,
                        help="Number of unique ground-truth challenges to harvest.")
    parser.add_argument("--renders", type=int, default=5,
                        help="Number of independent renders per challenge.")
    args = parser.parse_args()
    harvest(args.type, args.difficulty, args.count, args.renders)


if __name__ == "__main__":
    main()
