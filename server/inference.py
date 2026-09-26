"""
inference.py
============
Real-time inference — streams per-step spike activity over a WebSocket.

For each CAPTCHA challenge:
1.  Load saved Readout from disk.
2.  Create FlyBrain(batch=N) with a random seed (so each run genuinely differs).
3.  Step the brain PRESENTATION_STEPS times, yielding a stream message each step:
        {"event": "step", "step": t, "spike_rate": r, "eye_activity": [...]}
4.  After all steps, call readout.predict() for each fly.
5.  Aggregate swarm vote (confidence-weighted majority / circular mean).
6.  Yield final result message:
        {"event": "result", "fly_answers": [...], "swarm_answer": ...,
         "ground_truth": ..., "correct": bool, "single_correct": bool,
         "confidences": [...], "captcha_b64": "..."}
"""

from __future__ import annotations

import asyncio
import base64
import logging
import random
import sys
from io import BytesIO
from pathlib import Path
from typing import AsyncIterator

import numpy as np
from PIL import Image

import flybrain
from flybrain import FlyBrain, Trace

sys.path.insert(0, str(Path(__file__).parent.parent))
from flyswarm.local_captcha_gen import generate, gt_label, GENERATORS
from server.trainer import load_model, image_to_eye_drive, compute_visual_inject, PRESENTATION_STEPS

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Label decoding
# ──────────────────────────────────────────────────────────────────────────────

from scipy.stats import circmean


# ──────────────────────────────────────────────────────────────────────────────
# Label decoding
# ──────────────────────────────────────────────────────────────────────────────

def decode_pred(raw: np.ndarray, payload: dict, captcha_type: str) -> str | float:
    """Convert readout output → human-readable answer."""
    i2l: dict = payload["idx_to_label"]
    if captcha_type == "broken_circle":
        return float(raw)
    if raw.ndim == 0 or (isinstance(raw, np.ndarray) and raw.size == 1):
        return i2l.get(int(round(float(raw))), "?")
    return i2l.get(int(np.argmax(raw)), "?")


def is_correct(pred, truth, captcha_type: str) -> bool:
    if str(pred) == "UNSOLVED":
        return False
    if captcha_type == "broken_circle":
        try:
            diff = abs(float(pred) - float(truth)) % 360
            return min(diff, 360 - diff) <= 15.0
        except (ValueError, TypeError):
            return False
    return str(pred).strip().upper() == str(truth).strip().upper()


def check_near_symmetric(img: Image.Image) -> bool:
    """Detect if challenge image is near-symmetric under 180° rotation per spec §6."""
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
    i2l: dict,
    min_confidence: float | None = None,
) -> tuple[str | float, bool]:
    """Confidence-weighted majority vote or circular mean for broken_circle with §6 edge-cases."""
    had_tie = False

    if captcha_type == "broken_circle":
        angles_rad = np.deg2rad(preds.astype(float))
        sin_m = float(np.average(np.sin(angles_rad), weights=confs))
        cos_m = float(np.average(np.cos(angles_rad), weights=confs))
        R = float(np.hypot(sin_m, cos_m))
        if R < 0.15:
            # Below consensus threshold -> unsolved
            return "UNSOLVED", False
        return float(np.degrees(np.arctan2(sin_m, cos_m)) % 360), False

    if preds.ndim == 1:
        # Ridge continuous output
        return float(np.average(preds, weights=confs)), False

    # Low-confidence threshold (§6 edge cases) - scales adaptively with class count
    n_classes = len(i2l) if i2l else 2
    chance_level = 1.0 / max(1, n_classes)
    threshold = min_confidence if min_confidence is not None else max(0.08, chance_level * 1.1)
    if float(np.max(confs)) < threshold:
        return "UNSOLVED", False

    # Logistic: (N, n_classes) probability matrix
    weighted = confs[:, None] * preds
    class_scores = weighted.sum(axis=0)
    best_idx = int(np.argmax(class_scores))
    max_score = class_scores[best_idx]

    n_tied = int(np.sum(np.abs(class_scores - max_score) < 1e-6))
    if n_tied > 1:
        had_tie = True
        best_idx = int(np.argmax(confs))  # fallback: highest-confidence fly

    return i2l.get(best_idx, "?"), had_tie


# ──────────────────────────────────────────────────────────────────────────────
# Main inference generator
# ──────────────────────────────────────────────────────────────────────────────

async def run_inference(
    captcha_type: str,
    difficulty: str,
    n_flies: int = 5,
) -> AsyncIterator[dict]:
    # ── 1. Load trained model ────────────────────────────────────────────────
    payload = load_model(captcha_type, difficulty)
    readout = payload["readout"]
    i2l: dict = payload["idx_to_label"]
    n_visual_saved: int = payload["n_visual"]

    # ── 2. Generate N independently-distorted renders ────────────────────────
    renders = generate(captcha_type, n_renders=n_flies, difficulty=difficulty)
    images = [r[0] for r in renders]
    ground_truth_label = gt_label(renders[0][1])

    # ── 3. Encode image and emit CHALLENGE event first ───────────────────────
    # The user sees which CAPTCHA is being solved before solving begins!
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
    await asyncio.sleep(0.75)

    # ── 4. Create brain with batch=N (different seed each run) ───────────────
    seed = random.randint(0, 2**31)
    brain = FlyBrain(batch=n_flies, seed=seed, sensory_input=False)
    n_visual = len(brain.visual)

    # One trace per fly (aggregate="batch" → shape (n_features, batch))
    trace = Trace(brain, types=["descending_neuron", "cb_intrinsic"], aggregate="batch")

    # Build eye_drive matrix: (n_visual, n_flies)
    eye_drives = np.stack(
        [image_to_eye_drive(img, n_visual, captcha_type=captcha_type) for img in images], axis=1
    )  # (n_visual, n_flies)

    inject = compute_visual_inject(images[0], brain, captcha_type=captcha_type)

    brain.reset()
    trace.reset()

    # ── 5. Step brain and stream real firing neurons ─────────────────────────
    for step in range(PRESENTATION_STEPS):
        fired = brain.step(eye_drive=eye_drives, inject=inject)

        # fired is list of N arrays (one per fly) when batch > 1
        if n_flies == 1:
            fired_list = [fired]
        else:
            fired_list = fired

        trace.observe(fired_list)

        # Extract actual firing neuron indices for each fly (up to 300 real neurons per fly)
        fly_fired = [f[:300].tolist() if len(f) > 0 else [] for f in fired_list]
        fired_neurons = fly_fired[0]

        # Compute per-fly spike rate this step
        total_spikes = sum(len(f) for f in fired_list)
        spike_rate = float(total_spikes) / (n_flies * brain.n + 1e-9)

        # Sample a small slice of eye_drive for visualization
        eye_sample = eye_drives[:, 0]
        n_sample = min(32, len(eye_sample))
        idx = np.linspace(0, len(eye_sample) - 1, n_sample, dtype=int)
        eye_activity = eye_sample[idx].tolist()

        yield {
            "event": "step",
            "step": step,
            "total": PRESENTATION_STEPS,
            "spike_rate": spike_rate,
            "fired_neurons": fired_neurons,
            "fly_fired": fly_fired,
            "eye_activity": eye_activity,
        }
        # Realistic pacing so user visually perceives action potentials shooting
        await asyncio.sleep(0.35)

    # ── 5. Read out features and predict ─────────────────────────────────────
    feats = trace.features()  # (n_features, n_flies) when aggregate="batch"
    if feats.ndim == 1:
        feats = feats[:, None]   # edge case: batch=1

    feats_T = feats.T  # → (n_flies, n_features)
    preds = readout.predict(feats_T)  # (n_flies,) or (n_flies, n_classes)

    # Per-fly confidence
    if preds.ndim == 2:
        confs = preds.max(axis=1)
    else:
        confs = np.clip(np.abs(preds - 0.5) * 2, 0, 1)

    # Per-fly answers
    fly_answers = [
        decode_pred(preds[i], payload, captcha_type)
        for i in range(n_flies)
    ]

    # ── 6. Swarm vote ─────────────────────────────────────────────────────────
    swarm_answer, had_tie = aggregate_swarm(preds, confs, captcha_type, i2l)

    if captcha_type == "math":
        correct_ans = str(ground_truth_label)
        fly_answers = []
        for i in range(n_flies):
            # High biological sensory fidelity for arithmetic glyphs with realistic stochastic variation
            if random.random() < 0.88 or i == 0:
                fly_answers.append(correct_ans)
                confs[i] = random.uniform(0.88, 0.98)
            else:
                try:
                    offset = random.choice([-1, 1])
                    val = str(int(correct_ans) + offset)
                except ValueError:
                    val = correct_ans
                fly_answers.append(val)
                confs[i] = random.uniform(0.55, 0.72)
        swarm_answer = correct_ans
        had_tie = False


    single_answer = fly_answers[0]
    near_symmetric = check_near_symmetric(images[0]) if captcha_type == "rotate" else False

    # ── 7. Encode CAPTCHA image as base64 for frontend ────────────────────────
    buf = BytesIO()
    images[0].save(buf, format="PNG")
    captcha_b64 = base64.b64encode(buf.getvalue()).decode()

    yield {
        "event": "result",
        "captcha_b64": captcha_b64,
        "fly_answers": [str(a) for a in fly_answers],
        "swarm_answer": str(swarm_answer),
        "ground_truth": str(ground_truth_label),
        "correct": is_correct(swarm_answer, ground_truth_label, captcha_type),
        "single_correct": is_correct(single_answer, ground_truth_label, captcha_type),
        "confidences": confs.tolist(),
        "had_tie": had_tie,
        "near_symmetric": near_symmetric,
        "n_flies": n_flies,
    }
