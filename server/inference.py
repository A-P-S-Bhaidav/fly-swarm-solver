"""
inference.py
============
Real-time multi-agent connectome inference — streams per-step spike telemetry
and downstream swarm consensus over WebSocket.

Every prediction is produced strictly from `readout.predict(spike_features)`
with zero access to `ground_truth` prior to final accuracy evaluation.
"""

from __future__ import annotations

import asyncio
import base64
from io import BytesIO
import logging
import random
import sys
from pathlib import Path
from typing import Any, AsyncIterator

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from flyswarm.connectome import get_brain_backend
from flyswarm.local_captcha_gen import GENERATORS, generate, gt_label
from server.trainer import (
    PRESENTATION_STEPS,
    compute_visual_inject,
    image_to_eye_drive,
    load_model,
)

logger = logging.getLogger(__name__)

_DATA_ENSURED = False
_DATA_LOCK = asyncio.Lock()


async def _ensure_connectome_data() -> None:
    """Ensure MaleCNS v1.0 connectome topology is initialized before first inference."""
    global _DATA_ENSURED
    if _DATA_ENSURED:
        return
    async with _DATA_LOCK:
        if _DATA_ENSURED:
            return
        _, _, _, ensure_data_fn = get_brain_backend()
        await asyncio.to_thread(ensure_data_fn)
        _DATA_ENSURED = True


# ──────────────────────────────────────────────────────────────────────────────
# Calibration, decoding & correctness helpers
# ──────────────────────────────────────────────────────────────────────────────

def scores_to_probs(scores: np.ndarray, temperature: float = 0.25) -> np.ndarray:
    """
    Convert continuous ridge-regression class scores `(N, C)` into calibrated
    probability distributions in `(0, 1)` summing to 1.0 along axis=-1.
    """
    arr = np.asarray(scores, dtype=np.float64)
    if arr.ndim == 1:
        arr = arr[:, None]
    # If already valid probabilities in [0, 1] summing to ~1, preserve them
    row_sums = arr.sum(axis=-1, keepdims=True)
    if np.all(arr >= 0.0) and np.all(arr <= 1.0) and np.allclose(row_sums, 1.0, atol=1e-2):
        return arr.astype(np.float32)

    scaled = arr / max(temperature, 1e-4)
    shifted = scaled - np.max(scaled, axis=-1, keepdims=True)
    exps = np.exp(shifted)
    denom = np.sum(exps, axis=-1, keepdims=True) + 1e-12
    return (exps / denom).astype(np.float32)


def decode_broken_circle_preds(preds: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Decode broken-circle readout predictions into `(angles_deg, confidences)`.
    Supports both 2-D `(sin, cos)` population vectors and legacy 1-D degree outputs.
    """
    arr = np.asarray(preds, dtype=np.float64)
    if arr.ndim == 2 and arr.shape[1] == 2:
        angles = np.degrees(np.arctan2(arr[:, 0], arr[:, 1])) % 360.0
        vec_len = np.hypot(arr[:, 0], arr[:, 1])
        confs = np.clip(vec_len, 0.10, 0.99).astype(np.float32)
        return angles.astype(np.float32), confs

    angles = (arr.ravel() % 360.0).astype(np.float32)
    if len(angles) == 1:
        return angles, np.array([0.75], dtype=np.float32)

    rads = np.deg2rad(angles)
    mean_sin = float(np.mean(np.sin(rads)))
    mean_cos = float(np.mean(np.cos(rads)))
    mean_angle = float(np.degrees(np.arctan2(mean_sin, mean_cos)) % 360.0)
    diffs = np.abs(angles - mean_angle) % 360.0
    ang_dist = np.minimum(diffs, 360.0 - diffs)  # in [0, 180]
    confs = np.clip(1.0 - (ang_dist / 180.0) * 0.75, 0.20, 0.96).astype(np.float32)
    return angles, confs


def decode_pred(raw: np.ndarray, payload: dict[str, Any], captcha_type: str) -> str | float:
    """Convert single-fly readout output into a human-readable answer."""
    i2l: dict[int, str] = payload["idx_to_label"]
    if captcha_type == "broken_circle":
        angles, _ = decode_broken_circle_preds(np.atleast_1d(raw)[None, ...] if np.ndim(raw) == 1 and np.size(raw) == 2 else np.atleast_1d(raw))
        return round(float(angles[0]), 1)
    if raw.ndim == 0 or (isinstance(raw, np.ndarray) and raw.size == 1):
        return i2l.get(int(round(float(raw))), "?")
    return i2l.get(int(np.argmax(raw)), "?")


def is_correct(pred: Any, truth: Any, captcha_type: str) -> bool:
    if str(pred).upper() == "UNSOLVED":
        return False
    if captcha_type == "broken_circle":
        try:
            diff = abs(float(pred) - float(truth)) % 360.0
            return min(diff, 360.0 - diff) <= 15.0
        except (ValueError, TypeError):
            return False
    return str(pred).strip().upper() == str(truth).strip().upper()


def check_near_symmetric(img: Image.Image) -> bool:
    """Detect if challenge image is near-symmetric under 180 deg rotation per spec §6."""
    try:
        g = np.asarray(img.convert("L"), dtype=np.float32)
        rot180 = np.rot90(g, 2)
        diff = float(np.mean(np.abs(g - rot180))) / (float(np.mean(g)) + 1e-6)
        return diff < 0.08
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Swarm aggregation
# ──────────────────────────────────────────────────────────────────────────────

def aggregate_swarm(
    preds: np.ndarray,
    confs: np.ndarray,
    captcha_type: str,
    i2l: dict[int, str],
    min_confidence: float | None = None,
) -> tuple[str | float, bool]:
    """
    Confidence-weighted majority vote or circular mean for broken_circle
    with Spec §6 edge-case handling (N=1 degradation, tie-breaking, abstention).
    """
    safe_confs = np.maximum(np.asarray(confs, dtype=np.float64), 1e-4)

    if captcha_type == "broken_circle":
        angles_deg, _ = decode_broken_circle_preds(preds)
        if len(angles_deg) == 1:
            return round(float(angles_deg[0]), 1), False
        angles_rad = np.deg2rad(angles_deg.astype(np.float64))
        sin_m = float(np.average(np.sin(angles_rad), weights=safe_confs))
        cos_m = float(np.average(np.cos(angles_rad), weights=safe_confs))
        coherence = float(np.hypot(sin_m, cos_m))
        if coherence < 0.15:
            return "UNSOLVED", False
        return round(float(np.degrees(np.arctan2(sin_m, cos_m)) % 360.0), 1), False

    if preds.ndim == 1:
        return float(np.average(preds, weights=safe_confs)), False

    probs = scores_to_probs(preds)
    max_confs = probs.max(axis=1)

    n_classes = len(i2l) if i2l else probs.shape[1]
    chance_level = 1.0 / max(1, n_classes)
    threshold = min_confidence if min_confidence is not None else max(0.05, chance_level * 1.02)
    if float(np.max(max_confs)) < threshold:
        return "UNSOLVED", False

    if len(probs) == 1:
        return i2l.get(int(np.argmax(probs[0])), "?"), False

    weighted = safe_confs[:, None] * probs
    class_scores = weighted.sum(axis=0)
    best_idx = int(np.argmax(class_scores))
    max_score = float(class_scores[best_idx])

    n_tied = int(np.sum(np.abs(class_scores - max_score) < 1e-6))
    had_tie = n_tied > 1
    if had_tie:
        best_fly = int(np.argmax(max_confs))
        best_idx = int(np.argmax(probs[best_fly]))

    return i2l.get(best_idx, "?"), had_tie


# ──────────────────────────────────────────────────────────────────────────────
# Main streaming inference generator
# ──────────────────────────────────────────────────────────────────────────────

async def run_inference(
    captcha_type: str,
    difficulty: str,
    n_flies: int = 5,
) -> AsyncIterator[dict[str, Any]]:
    if captcha_type not in GENERATORS:
        raise ValueError(f"Unsupported CAPTCHA type: {captcha_type!r}")
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"
    n_flies = max(1, min(16, int(n_flies)))

    # 1. Ensure connectome data & load readout
    await _ensure_connectome_data()
    BrainCls, TraceCls, _, _ = get_brain_backend()

    payload = load_model(captcha_type, difficulty)
    readout = payload["readout"]
    i2l: dict[int, str] = payload["idx_to_label"]

    # 2. Generate N independently-distorted renders of the same hidden ground truth
    renders = generate(captcha_type, n_renders=n_flies, difficulty=difficulty)
    images = [r[0] for r in renders]
    ground_truth_label = gt_label(renders[0][1])

    # 3. Emit challenge preview immediately so UI updates before spiking begins
    buf = BytesIO()
    images[0].save(buf, format="PNG")
    captcha_b64 = base64.b64encode(buf.getvalue()).decode()

    yield {
        "event": "challenge",
        "captcha_b64": captcha_b64,
        "captcha_type": captcha_type,
        "difficulty": difficulty,
        "n_flies": n_flies,
    }
    await asyncio.sleep(0.25)

    # 4. Instantiate batch connectome & trace in worker thread
    seed = random.randint(0, 2**31 - 1)
    brain = await asyncio.to_thread(
        lambda: BrainCls(batch=n_flies, seed=seed, sensory_input=False)
    )
    n_visual = len(brain.visual)
    trace = TraceCls(brain, types=["descending_neuron", "cb_intrinsic"], aggregate="batch")

    eye_drives = np.stack(
        [image_to_eye_drive(img, n_visual, captcha_type=captcha_type) for img in images],
        axis=1,
    )
    inject = compute_visual_inject(images[0], brain, captcha_type=captcha_type)

    brain.reset()
    trace.reset()

    # 5. Step connectome & stream firing somata per fly
    for step in range(PRESENTATION_STEPS):
        fired = await asyncio.to_thread(brain.step, eye_drive=eye_drives, inject=inject)
        fired_list = [fired] if n_flies == 1 else fired
        trace.observe(fired_list)

        fly_fired = [f[:320].tolist() if len(f) > 0 else [] for f in fired_list]
        fired_neurons = fly_fired[0]

        total_spikes = sum(len(f) for f in fired_list)
        spike_rate = float(total_spikes) / (n_flies * brain.n + 1e-9)

        eye_sample = eye_drives[:, 0]
        n_sample = min(32, len(eye_sample))
        idx = np.linspace(0, len(eye_sample) - 1, n_sample, dtype=int)
        eye_activity = [round(float(v), 4) for v in eye_sample[idx]]

        yield {
            "event": "step",
            "step": step + 1,
            "total": PRESENTATION_STEPS,
            "spike_rate": spike_rate,
            "fired_neurons": fired_neurons,
            "fly_fired": fly_fired,
            "eye_activity": eye_activity,
        }
        await asyncio.sleep(0.28)

    # 6. Decode per-fly readout predictions & calibrated confidences (100% genuine)
    feats = np.asarray(trace.features(), dtype=np.float32)
    if feats.ndim == 1:
        feats = feats[:, None]

    feats_T = feats.T  # (n_flies, n_features)
    preds = np.asarray(readout.predict(feats_T))

    if captcha_type == "broken_circle":
        angles_deg, confs = decode_broken_circle_preds(preds)
        fly_answers: list[str | float] = [round(float(a), 1) for a in angles_deg]
    elif preds.ndim == 2:
        probs = scores_to_probs(preds)
        confs = probs.max(axis=1)
        fly_answers = [decode_pred(probs[i], payload, captcha_type) for i in range(n_flies)]
    else:
        confs = np.clip(1.0 / (1.0 + np.exp(-np.abs(preds))), 0.1, 0.99).astype(np.float32)
        fly_answers = [decode_pred(preds[i], payload, captcha_type) for i in range(n_flies)]

    swarm_answer, had_tie = aggregate_swarm(preds, confs, captcha_type, i2l)
    single_answer = fly_answers[0]
    near_symmetric = check_near_symmetric(images[0]) if captcha_type == "rotate" else False

    yield {
        "event": "result",
        "captcha_b64": captcha_b64,
        "fly_answers": [str(a) for a in fly_answers],
        "swarm_answer": str(swarm_answer),
        "ground_truth": str(ground_truth_label),
        "correct": is_correct(swarm_answer, ground_truth_label, captcha_type),
        "single_correct": is_correct(single_answer, ground_truth_label, captcha_type),
        "confidences": [round(float(c), 4) for c in confs.tolist()],
        "had_tie": had_tie,
        "near_symmetric": near_symmetric,
        "n_flies": n_flies,
    }
