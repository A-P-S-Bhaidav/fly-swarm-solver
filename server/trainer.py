"""
trainer.py
==========
Genuine FlyBrain MaleCNS v1.0 connectome readout training pipeline.

Every readout weight is learned from downstream spike traces produced by
running the MaleCNS v1.0 connectome on generated CAPTCHA stimuli.

Flow
----
1.  Generate `n_train` CAPTCHAs with randomized ground-truth labels.
2.  Drive the fly's visual neurons with the 1-D luminance strip + lobula
    projection feature detectors derived from each image.
3.  Step FlyBrain for PRESENTATION_STEPS steps; collect Trace.features().
4.  Stack all feature vectors -> X (n_train, n_features).
5.  Encode labels -> y (one-hot for classification, 2-D sin/cos population
    vector for continuous broken_circle angles).
6.  Fit `flybrain.Readout.fit(X, y, kind="ridge")` via PCA + cross-validation.
7.  Persist the Readout object + metadata to `<repo_root>/models/`.
"""

from __future__ import annotations

import asyncio
import logging
import math
import pickle
import sys
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from flyswarm.local_captcha_gen import GENERATORS, generate, gt_label

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

PRESENTATION_STEPS = 8    # 160 ms (8 steps x 20 ms) biological integration window
IMAGE_WIDTH = 64          # pixels; mapped to n_visual photoreceptors


class _ReadoutStub:
    """Fallback stub allowing metadata inspection when flybrain is not installed."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass


class _MetadataUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:
        if module.startswith("flybrain"):
            return type(name, (_ReadoutStub,), {})
        return super().find_class(module, name)


# ──────────────────────────────────────────────────────────────────────────────
# Image -> 1-D eye_drive & Biological Feature Injection
# ──────────────────────────────────────────────────────────────────────────────

def image_to_eye_drive(
    img: Image.Image, n_visual: int, captcha_type: str | None = None
) -> np.ndarray:
    """
    Collapse image to 1-D luminance strip, interpolated to `n_visual` neurons
    with values in [0, 1].
    For scatter CAPTCHA: applies chromatic contrast pre-filter per Spec §5.1.
    """
    resample = Image.Resampling.LANCZOS
    if captcha_type == "scatter" and img.mode in ("RGB", "RGBA"):
        arr = np.asarray(img.convert("RGB"), dtype=np.float32)
        r_diff = arr[:, :, 0] - 0.5 * (arr[:, :, 1] + arr[:, :, 2])
        mask = (r_diff > 35).astype(np.float32)
        img_processed = Image.fromarray((mask * 255).astype(np.uint8))
        grey = img_processed.resize((IMAGE_WIDTH, 1), resample)
    else:
        grey = img.convert("L").resize((IMAGE_WIDTH, 1), resample)

    strip = np.asarray(grey, dtype=np.float32).ravel() / 255.0
    if len(strip) == n_visual:
        return strip
    x_src = np.linspace(0.0, 1.0, len(strip))
    x_dst = np.linspace(0.0, 1.0, n_visual)
    return np.interp(x_dst, x_src, strip).astype(np.float32)


def compute_visual_inject(
    img: Image.Image, brain: Any, captcha_type: str | None = None
) -> list[tuple[Any, float]]:
    """
    Biological visual feature encoder past the lamina.
    Maps directional gradients, spatial quadrant mass, and edge contrast
    into Drosophila visual projection neurons (LC10a/b, LC4, LPLC1).
    """
    if captcha_type == "scatter" and img.mode in ("RGB", "RGBA"):
        arr_rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
        r_diff = arr_rgb[:, :, 0] - 0.5 * (arr_rgb[:, :, 1] + arr_rgb[:, :, 2])
        mask = (r_diff > 35).astype(np.float32)
        processed = Image.fromarray((mask * 255).astype(np.uint8))
    else:
        processed = img

    resized = processed.convert("L").resize((64, 64), Image.Resampling.BILINEAR)
    arr = 1.0 - (np.asarray(resized, dtype=np.float32) / 255.0)
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
# Run one image through brain -> feature vector
# ──────────────────────────────────────────────────────────────────────────────

def collect_single_feature(
    img: Image.Image, brain: Any, trace: Any, captcha_type: str | None = None
) -> np.ndarray:
    """Present one image for PRESENTATION_STEPS steps and return trace features."""
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
    raw_labels: list[Any], captcha_type: str
) -> tuple[np.ndarray, dict[str, int], dict[int, str]]:
    """
    Convert raw labels to numeric target array `y`.
    For `broken_circle`, encodes a 2-D `(sin(theta), cos(theta))` population
    vector so continuous angles wrap smoothly across the 0/360 boundary.
    """
    if captcha_type == "broken_circle":
        rads = [math.radians(float(label)) for label in raw_labels]
        y = np.array([[math.sin(r), math.cos(r)] for r in rads], dtype=np.float32)
        return y, {}, {}

    unique = sorted(set(str(label) for label in raw_labels))
    l2i = {label: i for i, label in enumerate(unique)}
    i2l = {i: label for label, i in l2i.items()}
    y_idx = np.array([l2i[str(label)] for label in raw_labels], dtype=np.int32)

    n_classes = len(unique)
    if n_classes > 1:
        y = np.zeros((len(raw_labels), n_classes), dtype=np.float32)
        for row, idx in enumerate(y_idx):
            y[row, idx] = 1.0
    else:
        y = y_idx.astype(np.float32)
    return y, l2i, i2l


# ──────────────────────────────────────────────────────────────────────────────
# Main training function
# ──────────────────────────────────────────────────────────────────────────────

async def train(
    captcha_type: str,
    difficulty: str = "medium",
    n_train: int = 80,
    progress_cb: Callable[[float, str], Any] | None = None,
) -> dict[str, Any]:
    if captcha_type not in GENERATORS:
        raise ValueError(f"Unknown CAPTCHA type: {captcha_type!r}")
    if difficulty not in {"easy", "medium", "hard"}:
        raise ValueError(f"Invalid difficulty: {difficulty!r}")
    n_train = max(10, min(500, int(n_train)))

    import flybrain  # noqa: PLC0415
    from flybrain import FlyBrain, Readout, Trace  # noqa: PLC0415

    async def _progress(frac: float, msg: str) -> None:
        if progress_cb:
            await progress_cb(frac, msg)
        logger.info("[%.0f%%] %s", frac * 100, msg)

    await _progress(0.0, "Ensuring MaleCNS v1.0 connectome weights are available...")
    await asyncio.to_thread(flybrain.ensure_data)

    await _progress(0.02, "Initializing FlyBrain connectome...")
    brain = await asyncio.to_thread(lambda: FlyBrain(batch=1, seed=42, sensory_input=False))
    trace = Trace(brain, types=["descending_neuron", "cb_intrinsic"], aggregate="mean")
    n_visual = len(brain.visual)

    X_list: list[np.ndarray] = []
    y_raw: list[Any] = []

    for i in range(n_train):
        renders = generate(captcha_type, n_renders=1, difficulty=difficulty)
        img, gt = renders[0]
        label = gt_label(gt)

        feats = await asyncio.to_thread(
            collect_single_feature, img, brain, trace, captcha_type
        )
        X_list.append(feats)
        y_raw.append(label)

        frac = 0.02 + 0.75 * (i + 1) / n_train
        await _progress(frac, f"Collecting spike traces: {i + 1}/{n_train}")

    X = np.stack(X_list, axis=0)

    await _progress(0.77, "Encoding target labels...")
    y, l2i, i2l = encode_labels(y_raw, captcha_type)

    await _progress(0.78, "Fitting PCA + Ridge readout with cross-validation...")
    max_k = max(2, min(n_train // 2, 40))
    components = tuple(sorted({k for k in (5, 10, 20, max_k) if 2 <= k < n_train - 2}))
    if not components:
        components = (min(5, max(2, n_train - 2)),)

    readout = await asyncio.to_thread(
        lambda: Readout.fit(X, y, kind="ridge", components=components, verbose=False)
    )

    await _progress(0.95, f"Cross-validation score: {readout.cv_score:.3f}")

    model_path = MODELS_DIR / f"{captcha_type}_{difficulty}.pkl"
    payload = {
        "readout": readout,
        "label_to_idx": l2i,
        "idx_to_label": i2l,
        "captcha_type": captcha_type,
        "difficulty": difficulty,
        "encoding": "sincos_v2" if captcha_type == "broken_circle" else "onehot",
        "n_train": n_train,
        "cv_score": float(readout.cv_score),
        "n_visual": n_visual,
    }
    with open(model_path, "wb") as f:
        pickle.dump(payload, f)

    await _progress(1.0, f"Saved readout model -> {model_path.name}")

    return {
        "type": captcha_type,
        "difficulty": difficulty,
        "n_train": n_train,
        "cv_score": float(readout.cv_score),
        "model_path": str(model_path),
        "label_map": i2l,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Model persistence & discovery
# ──────────────────────────────────────────────────────────────────────────────

def load_model(captcha_type: str, difficulty: str) -> dict[str, Any]:
    """
    Load the trained readout payload for `(captcha_type, difficulty)`.
    If no exact difficulty-specific model exists yet (e.g., `easy` or `hard`
    when only `medium` has been pre-trained), gracefully fall back to `medium`
    or any available model for `captcha_type` so distortion-severity evaluation
    works immediately out of the box.
    """
    candidates = [
        MODELS_DIR / f"{captcha_type}_{difficulty}.pkl",
        MODELS_DIR / f"{captcha_type}_medium.pkl",
        *sorted(MODELS_DIR.glob(f"{captcha_type}_*.pkl")),
    ]
    for path in candidates:
        if path.exists():
            if path.stem != f"{captcha_type}_{difficulty}":
                logger.info(
                    "Model %s_%s.pkl not found; using compatible readout %s",
                    captcha_type,
                    difficulty,
                    path.name,
                )
            with open(path, "rb") as f:
                data = pickle.load(f)
            data["loaded_model_file"] = path.name
            return data

    raise FileNotFoundError(
        f"No trained readout found for '{captcha_type}'. Open Readout Lab to train one."
    )


def list_models() -> list[dict[str, Any]]:
    """List metadata for all serialized readout models on disk."""
    out: list[dict[str, Any]] = []
    for p in sorted(MODELS_DIR.glob("*.pkl")):
        try:
            with open(p, "rb") as f:
                try:
                    m = pickle.load(f)
                except ModuleNotFoundError:
                    f.seek(0)
                    m = _MetadataUnpickler(f).load()
            out.append({
                "type": m["captcha_type"],
                "difficulty": m["difficulty"],
                "n_train": int(m["n_train"]),
                "cv_score": float(m["cv_score"]),
                "filename": p.name,
            })
        except Exception as exc:
            logger.warning("Skipping unreadable model file %s: %s", p.name, exc)
    return out


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Train biological FlyBrain MaleCNS readout for CAPTCHAs"
    )
    parser.add_argument(
        "--type",
        choices=list(GENERATORS.keys()),
        default="rotate",
        help="CAPTCHA category",
    )
    parser.add_argument(
        "--difficulty",
        choices=["easy", "medium", "hard"],
        default="medium",
        help="Distortion severity",
    )
    parser.add_argument(
        "--n_train",
        "--n-train",
        dest="n_train",
        type=int,
        default=60,
        help="Number of training challenges",
    )
    parser.add_argument(
        "--train-all",
        action="store_true",
        help="Train all supported CAPTCHA categories sequentially",
    )
    args = parser.parse_args()

    async def _cli_main() -> None:
        types_to_train = list(GENERATORS.keys()) if args.train_all else [args.type]
        for ctype in types_to_train:
            print(f"\n=== Training FlyBrain readout: {ctype} ({args.difficulty}, N={args.n_train}) ===")
            result = await train(
                captcha_type=ctype,
                difficulty=args.difficulty,
                n_train=args.n_train,
            )
            print(f"Completed: cv_score={result['cv_score']:.4f} -> {result['model_path']}")

    asyncio.run(_cli_main())
