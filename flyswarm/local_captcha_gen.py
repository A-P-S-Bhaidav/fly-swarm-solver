"""
local_captcha_gen.py
====================
Pure-Python CAPTCHA generator — no PHP, no Docker required.
Generates text, math, rotate, broken-circle, and scatter CAPTCHAs
locally using Pillow.

Each call to generate() with the same `answer` but a different call produces
an independently-distorted render — satisfying the N-renders-per-ground-truth
requirement from the spec.
"""

from __future__ import annotations

import math
import random
import string
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CaptchaType = Literal["text", "math", "rotate", "broken_circle", "scatter"]

# ---------------------------------------------------------------------------
# Low-level distortion helpers
# ---------------------------------------------------------------------------

def _add_noise(img: Image.Image, amount: float = 0.08) -> Image.Image:
    arr = np.asarray(img, dtype=np.float32).copy()
    mask = np.random.rand(arr.shape[0], arr.shape[1]) < amount
    vals = np.random.choice([0.0, 255.0], size=int(mask.sum()))
    if arr.ndim == 3:
        arr[mask] = vals[:, None]
    else:
        arr[mask] = vals
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


def _warp(img: Image.Image, strength: float = 8.0) -> Image.Image:
    arr = np.asarray(img, dtype=np.float32).copy()
    h, w = arr.shape[:2]
    warped = np.zeros_like(arr)
    phase = random.uniform(0, 2 * math.pi)
    for y in range(h):
        offset = int(strength * math.sin(2 * math.pi * y / h + phase))
        for x in range(w):
            src_x = (x + offset) % w
            warped[y, x] = arr[y, src_x]
    return Image.fromarray(warped.astype(np.uint8))


def _distort(img: Image.Image, difficulty: str) -> Image.Image:
    if difficulty == "easy":
        img = _add_noise(img, 0.03)
    elif difficulty == "medium":
        img = _add_noise(img, 0.06)
        img = _warp(img, 5.0)
        img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    else:  # hard
        img = _add_noise(img, 0.12)
        img = _warp(img, 10.0)
        img = img.filter(ImageFilter.GaussianBlur(radius=1.0))
        angle = random.uniform(-10, 10)
        img = img.rotate(angle, fillcolor=(255, 255, 255))
    return img


def _try_font(size: int = 36) -> ImageFont.ImageFont:
    for name in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "FreeSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _random_str(n: int = 5) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


# ---------------------------------------------------------------------------
# Per-type generators
# Each returns (PIL.Image, ground_truth_dict)
# The `answer` param accepts the stored GT so the same challenge can be re-rendered
# ---------------------------------------------------------------------------

TEXT_POOL = ["SWARM", "BRAIN", "FLY24", "PULSE", "OPTIC", "NERVE", "AXON", "WING"]
SCATTER_POOL = ["FLY", "BUG", "BEE", "ANT", "WASP", "MOTH"]

def gen_text(answer: str | None = None, difficulty: str = "medium") -> tuple[Image.Image, dict]:
    if answer is None:
        answer = random.choice(TEXT_POOL)
    img = Image.new("RGB", (200, 80), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = _try_font(36)
    x = 8
    for ch in answer:
        color = (random.randint(20, 120), random.randint(20, 120), random.randint(20, 120))
        draw.text((x, random.randint(8, 22)), ch, fill=color, font=font)
        x += random.randint(28, 38)
    img = _distort(img, difficulty)
    return img, {"type": "text", "answer": answer, "difficulty": difficulty}


def gen_math(answer: dict | None = None, difficulty: str = "medium") -> tuple[Image.Image, dict]:
    """answer is a dict {"expression": "3+5=", "result": "8"} so re-renders work."""
    if answer is None:
        a, b = random.randint(1, 9), random.randint(1, 9)
        op = random.choice(["+", "-"])
        expression = f"{a}{op}{b}="
        result = str(a + b if op == "+" else a - b)
        answer = {"expression": expression, "result": result}
    img = Image.new("RGB", (240, 80), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = _try_font(36)
    draw.text((10, 12), answer["expression"], fill=(40, 40, 160), font=font)
    img = _distort(img, difficulty)
    return img, {"type": "math", "answer": answer, "difficulty": difficulty}


def gen_rotate(answer: int | None = None, difficulty: str = "medium") -> tuple[Image.Image, dict]:
    angles = [0, 90, 180, 270]
    true_angle = answer if answer is not None else random.choice(angles)
    base = Image.new("RGB", (100, 100), (255, 255, 255))
    draw = ImageDraw.Draw(base)
    # Asymmetric arrow so all 4 orientations are distinct
    draw.polygon([(50, 10), (80, 60), (55, 50), (55, 90), (45, 90), (45, 50), (20, 60)],
                 fill=(60, 60, 200))
    rotated = base.rotate(-true_angle, fillcolor=(255, 255, 255))
    rotated = _distort(rotated, difficulty)
    return rotated, {"type": "rotate", "answer": true_angle, "difficulty": difficulty}


def gen_broken_circle(answer: float | None = None, difficulty: str = "medium") -> tuple[Image.Image, dict]:
    gap_angle = answer if answer is not None else float(random.randint(0, 359))
    img = Image.new("RGB", (120, 120), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    gap_size = 22.0
    cx, cy, r = 60, 60, 45
    step = 2
    a = 0.0
    while a < 360.0:
        gap_start = (gap_angle - gap_size / 2) % 360
        gap_end = (gap_angle + gap_size / 2) % 360
        in_gap = (gap_start <= a <= gap_end) if gap_start < gap_end else (a >= gap_start or a <= gap_end)
        if not in_gap:
            x0 = cx + r * math.cos(math.radians(a))
            y0 = cy + r * math.sin(math.radians(a))
            x1 = cx + r * math.cos(math.radians(a + step))
            y1 = cy + r * math.sin(math.radians(a + step))
            draw.line([(x0, y0), (x1, y1)], fill=(30, 30, 30), width=4)
        a += step
    img = _distort(img, difficulty)
    return img, {"type": "broken_circle", "answer": gap_angle, "difficulty": difficulty}


def gen_scatter(answer: str | None = None, difficulty: str = "medium") -> tuple[Image.Image, dict]:
    if answer is None:
        answer = random.choice(SCATTER_POOL)
    img = Image.new("RGB", (280, 80), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = _try_font(30)
    small = _try_font(20)
    for _ in range(20):
        ch = random.choice(string.ascii_uppercase)
        pos = (random.randint(0, 250), random.randint(0, 45))
        grey = random.randint(160, 210)
        draw.text(pos, ch, fill=(grey, grey, grey), font=small)
    x = 15
    for ch in answer:
        draw.text((x, random.randint(10, 35)), ch, fill=(200, 30, 30), font=font)
        x += random.randint(55, 70)
    img = _distort(img, difficulty)
    return img, {"type": "scatter", "answer": answer, "difficulty": difficulty}


# ---------------------------------------------------------------------------
# Unified interface
# ---------------------------------------------------------------------------

GENERATORS: dict[str, callable] = {
    "text": gen_text,
    "math": gen_math,
    "rotate": gen_rotate,
    "broken_circle": gen_broken_circle,
    "scatter": gen_scatter,
}


def generate(
    captcha_type: CaptchaType,
    answer=None,
    difficulty: str = "medium",
    n_renders: int = 1,
) -> list[tuple[Image.Image, dict]]:
    """
    Generate `n_renders` independently-distorted images for the same answer.
    If answer is None, a fresh random one is created on the first render and
    reused for all subsequent renders.
    """
    fn = GENERATORS[captcha_type]
    results: list[tuple[Image.Image, dict]] = []
    stored_answer = answer

    for i in range(n_renders):
        img, gt = fn(answer=stored_answer, difficulty=difficulty)
        if i == 0 and stored_answer is None:
            # Store the full answer object (dict for math, scalar for others)
            stored_answer = gt["answer"]
        results.append((img, gt))
    return results


def gt_label(gt: dict) -> str | float | int:
    """Extract a human-readable scalar label from a ground-truth dict."""
    ans = gt["answer"]
    if isinstance(ans, dict):          # math
        return ans["result"]
    return ans


if __name__ == "__main__":
    out = Path("d:/fly swarm/data/samples")
    out.mkdir(parents=True, exist_ok=True)
    for ctype in GENERATORS:
        renders = generate(ctype, n_renders=3, difficulty="medium")
        for i, (img, gt) in enumerate(renders):
            fname = out / f"{ctype}_render{i}.png"
            img.save(fname)
            print(f"Saved {fname}  label={gt_label(gt)!r}")
    print("\nSample images saved to d:/fly swarm/data/samples/")
