"""
trainer.py
==========
Genuine flybrain training pipeline.

Nothing is hardcoded — every readout weight is learned from spike traces
produced by running the real MaleCNS v1.0 connectome on generated CAPTCHAs.

Flow
----
1.  Generate `n_train` CAPTCHAs (random answers each time).
2.  For each CAPTCHA image, drive the fly's visual neurons with the 1-D
    luminance strip derived from the image.
3.  Step FlyBrain for PRESENTATION_STEPS steps; collect Trace.features().
4.  Stack all feature vectors → X  (n_train, n_features).
5.  Encode labels → y.
6.  Call flybrain.Readout.fit(X, y, kind=...) — PCA + cross-validated
    ridge (continuous) or logistic (classification).
7.  Persist the Readout object + metadata to d:/fly swarm/models/.
"""

from __future__ import annotations

import asyncio
import logging
import pickle
import sys
import time
from pathlib import Path
from typing import AsyncIterator, Callable

import numpy as np
from PIL import Image

import flybrain
from flybrain import FlyBrain, Trace, Readout

# Project root on path
sys.path.insert(0, str(Path(__file__).parent.parent))
from flyswarm.local_captcha_gen import generate, gt_label, GENERATORS

logger = logging.getLogger(__name__)

MODELS_DIR = Path("d:/fly swarm/models")
MODELS_DIR.mkdir(parents=True, exist_ok=True)

PRESENTATION_STEPS = 8    # 160 ms (8 steps x 20ms) - full biological transmission window
IMAGE_WIDTH = 64          # pixels; mapped to n_visual photoreceptors

# ──────────────────────────────────────────────────────────────────────────────
# Image → 1-D eye_drive & Biological Feature Injection
# ──────────────────────────────────────────────────────────────────────────────

def image_to_eye_drive(
    img: Image.Image, n_visual: int, captcha_type: str | None = None
) -> np.ndarray:
    """
    Collapse image to 1-D luminance strip, interpolated to n_visual neurons.
    Values in [0, 1].
    For scatter CAPTCHA: applies color/contrast pre-filter per Spec §5.1.
    """
    if captcha_type == "scatter" and img.mode in ("RGB", "RGBA"):
        arr = np.asarray(img.convert("RGB"), dtype=np.float32)
        r_diff = arr[:, :, 0] - 0.5 * (arr[:, :, 1] + arr[:, :, 2])
        mask = (r_diff > 35).astype(np.float32)
        img_processed = Image.fromarray((mask * 255).astype(np.uint8))
        grey = img_processed.resize((IMAGE_WIDTH, 1), Image.LANCZOS)
    else:
        grey = img.convert("L").resize((IMAGE_WIDTH, 1), Image.LANCZOS)

    strip = np.asarray(grey, dtype=np.float32).ravel() / 255.0
    if len(strip) == n_visual:
        return strip
    x_src = np.linspace(0, 1, len(strip))
    x_dst = np.linspace(0, 1, n_visual)
    return np.interp(x_dst, x_src, strip).astype(np.float32)


def compute_visual_inject(
    img: Image.Image, brain: FlyBrain, captcha_type: str | None = None
) -> list:
    """
    Biological visual feature encoder past the lamina (matching flybrain.eyes FeatureDetectors).
    Maps directional gradients, spatial quadrant mass, and edge contrast directly
    into Drosophila visual projection neurons (LC10a tracking, LC4 looming/expansion, LPLC1 motion).
    """
    if captcha_type == "scatter" and img.mode in ("RGB", "RGBA"):
        arr_rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
        r_diff = arr_rgb[:, :, 0] - 0.5 * (arr_rgb[:, :, 1] + arr_rgb[:, :, 2])
        mask = (r_diff > 35).astype(np.float32)
        processed = Image.fromarray((mask * 255).astype(np.uint8))
    else:
        processed = img

    arr = 1.0 - (np.asarray(processed.convert("L").resize((64, 64)), dtype=np.float32) / 255.0)
    h, w = arr.shape
    top = float(arr[: h // 2, :].mean())
    bottom = float(arr[h // 2 :, :].mean())
    left = float(arr[:, : w // 2].mean())
    right = float(arr[:, w // 2 :].mean())

    v_grad = (bottom - top) * 4.0
    h_grad = (right - left) * 4.0

    lc10_L = brain.cells(["LC10a", "LC10b"], side="L")
    lc10_R = brain.cells(["LC10a", "LC10b"], side="R")
    lc4_L = brain.cells(["LC4"], side="L")
    lc4_R = brain.cells(["LC4"], side="R")
    lplc1_L = brain.cells(["LPLC1"], side="L")
    lplc1_R = brain.cells(["LPLC1"], side="R")

    return [
        (lc10_L, max(0.0, -h_grad)),
        (lc10_R, max(0.0, h_grad)),
        (lc4_L, max(0.0, -v_grad)),
        (lc4_R, max(0.0, v_grad)),
        (lplc1_L, max(0.0, left * 2.0)),
        (lplc1_R, max(0.0, right * 2.0)),
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Run one image through brain → feature vector
# ──────────────────────────────────────────────────────────────────────────────

def collect_single_feature(
    img: Image.Image, brain: FlyBrain, trace: Trace, captcha_type: str | None = None
) -> np.ndarray:
    """Present one image for PRESENTATION_STEPS steps, return trace features."""
    eye = image_to_eye_drive(img, len(brain.visual), captcha_type=captcha_type)
    inject = compute_visual_inject(img, brain, captcha_type=captcha_type)
    brain.reset()
    trace.reset()
    for _ in range(PRESENTATION_STEPS):
        fired = brain.step(eye_drive=eye, inject=inject)
        trace.observe(fired)
    feats = trace.features()
    return np.asarray(feats, dtype=np.float32)


# ──────────────────────────────────────────────────────────────────────────────
# Label encoding
# ──────────────────────────────────────────────────────────────────────────────

def encode_labels(
    raw_labels: list, captcha_type: str
) -> tuple[np.ndarray, dict, dict]:
    """
    Convert raw labels to numeric y array.
    Returns (y, label_to_idx, idx_to_label).
    For broken_circle (ridge), y is float32 and dicts are empty.
    """
    if captcha_type == "broken_circle":
        y = np.array([float(l) for l in raw_labels], dtype=np.float32)
        return y, {}, {}

    unique = sorted(set(str(l) for l in raw_labels))
    l2i = {l: i for i, l in enumerate(unique)}
    i2l = {i: l for l, i in l2i.items()}
    y_idx = np.array([l2i[str(l)] for l in raw_labels], dtype=np.int32)

    n_classes = len(unique)
    if n_classes > 1:
        y = np.zeros((len(raw_labels), n_classes), dtype=np.float32)
        for row, idx in enumerate(y_idx):
            y[row, idx] = 1.0
    else:
        y = y_idx.astype(np.float32)
    return y, l2i, i2l


# ──────────────────────────────────────────────────────────────────────────────
# Main training function (async so it can yield progress)
# ──────────────────────────────────────────────────────────────────────────────

async def train(
    captcha_type: str,
    difficulty: str = "medium",
    n_train: int = 80,
    progress_cb: Callable | None = None,
) -> dict:
    assert captcha_type in GENERATORS, f"Unknown type: {captcha_type}"

    async def _progress(frac: float, msg: str) -> None:
        if progress_cb:
            await progress_cb(frac, msg)
        logger.info("[%.0f%%] %s", frac * 100, msg)

    # ── 1. Download brain weights if needed ─────────────────────────────────
    await _progress(0.0, "Ensuring brain data is downloaded…")
    await asyncio.get_event_loop().run_in_executor(None, flybrain.ensure_data)

    # ── 2. Build brain (batch=1, we loop over samples) ──────────────────────
    await _progress(0.02, "Loading FlyBrain…")
    brain = FlyBrain(batch=1, seed=42, sensory_input=False)
    trace = Trace(brain, types=["descending_neuron", "cb_intrinsic"], aggregate="mean")
    n_visual = len(brain.visual)

    # ── 3. Generate CAPTCHAs and collect features ────────────────────────────
    X_list: list[np.ndarray] = []
    y_raw: list = []

    for i in range(n_train):
        renders = generate(captcha_type, n_renders=1, difficulty=difficulty)
        img, gt = renders[0]
        label = gt_label(gt)

        # Run brain in thread pool (CPU-bound)
        feats = await asyncio.get_event_loop().run_in_executor(
            None, collect_single_feature, img, brain, trace, captcha_type
        )
        X_list.append(feats)
        y_raw.append(label)

        frac = 0.02 + 0.75 * (i + 1) / n_train
        await _progress(frac, f"Collecting features: {i + 1}/{n_train}")

    X = np.stack(X_list, axis=0)   # (n_train, n_features)

    # ── 4. Encode labels ─────────────────────────────────────────────────────
    await _progress(0.77, "Encoding labels…")
    y, l2i, i2l = encode_labels(y_raw, captcha_type)

    # ── 5. Fit Readout ───────────────────────────────────────────────────────
    await _progress(0.78, "Fitting biological readout (PCA + cross-validation)…")

    max_k = max(2, min(n_train // 2, 40))
    components = tuple(sorted(set([k for k in (5, 10, 20, max_k) if k < n_train - 2 and k >= 2])))
    if not components:
        components = (min(5, max(2, n_train - 2)),)

    readout = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: Readout.fit(X, y, kind="ridge", components=components, verbose=False),
    )

    await _progress(0.95, f"CV score: {readout.cv_score:.3f}")

    # ── 6. Save model ────────────────────────────────────────────────────────
    model_path = MODELS_DIR / f"{captcha_type}_{difficulty}.pkl"
    payload = {
        "readout": readout,
        "label_to_idx": l2i,
        "idx_to_label": i2l,
        "captcha_type": captcha_type,
        "difficulty": difficulty,
        "n_train": n_train,
        "cv_score": float(readout.cv_score),
        "n_visual": n_visual,
    }
    with open(model_path, "wb") as f:
        pickle.dump(payload, f)

    await _progress(1.0, f"Model saved → {model_path.name}")

    return {
        "type": captcha_type,
        "difficulty": difficulty,
        "n_train": n_train,
        "cv_score": float(readout.cv_score),
        "model_path": str(model_path),
        "label_map": i2l,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Load a saved model
# ──────────────────────────────────────────────────────────────────────────────

def load_model(captcha_type: str, difficulty: str) -> dict:
    path = MODELS_DIR / f"{captcha_type}_{difficulty}.pkl"
    if not path.exists():
        raise FileNotFoundError(f"No trained model at {path}. Train first.")
    with open(path, "rb") as f:
        return pickle.load(f)


def list_models() -> list[dict]:
    out = []
    for p in sorted(MODELS_DIR.glob("*.pkl")):
        try:
            with open(p, "rb") as f:
                m = pickle.load(f)
            out.append({
                "type": m["captcha_type"],
                "difficulty": m["difficulty"],
                "n_train": m["n_train"],
                "cv_score": m["cv_score"],
                "filename": p.name,
            })
        except Exception:
            pass
    return out


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train biological FlyBrain readout for CAPTCHAs")
    parser.add_argument("--type", choices=list(GENERATORS.keys()), default="rotate", help="CAPTCHA type")
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard"], default="medium")
    parser.add_argument("--n_train", type=int, default=40, help="Number of training samples")
    parser.add_argument("--train-all", action="store_true", help="Train all supported types sequentially")
    args = parser.parse_args()

    async def main():
        types_to_train = list(GENERATORS.keys()) if args.train_all else [args.type]
        for ctype in types_to_train:
            print(f"\n==========================================")
            print(f"Training FlyBrain for '{ctype}' ({args.difficulty}, N={args.n_train})...")
            print(f"==========================================")
            result = await train(
                captcha_type=ctype,
                difficulty=args.difficulty,
                n_train=args.n_train,
            )
            print(f"Done! CV score: {result['cv_score']:.4f} -> {result['model_path']}")

    asyncio.run(main())

