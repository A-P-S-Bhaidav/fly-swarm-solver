"""
verify_dataset.py
=================
Scans the harvested dataset directory and reports per-type counts,
flags malformed images, missing ground-truth files, and generator skip rates.

Usage
-----
    python harvest/verify_dataset.py --dir d:/fly swarm/data
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def verify(data_root: Path) -> None:
    """Walk the data directory and report integrity stats."""
    captcha_types = [d for d in data_root.iterdir() if d.is_dir()]
    if not captcha_types:
        logger.warning("No type directories found under %s", data_root)
        return

    print(f"\n{'Type':<20} {'Difficulty':<12} {'Challenges':>12} {'Renders':>10} {'Bad images':>12}")
    print("-" * 70)

    for type_dir in sorted(captcha_types):
        for diff_dir in sorted(type_dir.iterdir()):
            if not diff_dir.is_dir():
                continue
            challenge_dirs = [d for d in diff_dir.iterdir() if d.is_dir()]
            n_challenges = len(challenge_dirs)
            n_renders = 0
            n_bad_images = 0
            n_missing_gt = 0

            for ch_dir in challenge_dirs:
                gt_file = ch_dir / "ground_truth.json"
                if not gt_file.exists():
                    n_missing_gt += 1
                    logger.warning("Missing ground_truth.json: %s", ch_dir)
                    continue

                render_files = sorted(ch_dir.glob("render_*.png"))
                n_renders += len(render_files)

                for rf in render_files:
                    try:
                        with Image.open(rf) as img:
                            img.verify()
                    except (UnidentifiedImageError, Exception):
                        n_bad_images += 1
                        logger.warning("Bad image file: %s", rf)

            print(f"{type_dir.name:<20} {diff_dir.name:<12} "
                  f"{n_challenges:>12} {n_renders:>10} {n_bad_images:>12}")

            if n_missing_gt > 0:
                logger.error("%d challenge(s) in %s/%s have no ground_truth.json",
                             n_missing_gt, type_dir.name, diff_dir.name)

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify harvested CAPTCHA dataset integrity.")
    parser.add_argument("--dir", default="d:/fly swarm/data",
                        help="Root data directory.")
    args = parser.parse_args()
    verify(Path(args.dir))


if __name__ == "__main__":
    main()
