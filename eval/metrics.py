"""
metrics.py
==========
All type-appropriate correctness metrics for single-fly vs. swarm comparison.

Correctness definitions (§8.1)
-------------------------------
- text / math / scatter : exact-match string accuracy
- grid/select           : per-cell F1 score
- rotate                : angle classification accuracy (exact-match on 4 classes)
- tiles                 : precision / recall of flagged tiles
- broken-circle         : mean angular error (degrees), ±N° accuracy
- slider                : settle-success rate (bool)

Statistical rigor (§8.4)
--------------------------
- Wilson confidence interval for proportions.
- Train/eval split must be enforced outside this module.

Ablation helpers
-----------------
- swarm_size_ablation(results_by_n) → accuracy at N=1,2,3,5,8
- distortion_ablation(results_by_difficulty) → accuracy at easy/medium/hard
"""

from __future__ import annotations

import math
from typing import Any


# ---------------------------------------------------------------------------
# Wilson confidence interval
# ---------------------------------------------------------------------------

def wilson_ci(n_correct: int, n_total: int, z: float = 1.96) -> tuple[float, float]:
    """
    95% Wilson score interval for a proportion.

    Returns (lower, upper) in [0, 1].
    """
    if n_total == 0:
        return 0.0, 0.0
    p = n_correct / n_total
    denom = 1 + z ** 2 / n_total
    centre = (p + z ** 2 / (2 * n_total)) / denom
    margin = z * math.sqrt(p * (1 - p) / n_total + z ** 2 / (4 * n_total ** 2)) / denom
    return max(0.0, centre - margin), min(1.0, centre + margin)


# ---------------------------------------------------------------------------
# Per-type correctness functions
# ---------------------------------------------------------------------------

def text_accuracy(predictions: list[str], ground_truths: list[str]) -> dict:
    """Exact-match accuracy for text / math / scatter."""
    assert len(predictions) == len(ground_truths)
    correct = sum(p.strip().upper() == g.strip().upper()
                  for p, g in zip(predictions, ground_truths))
    n = len(ground_truths)
    lo, hi = wilson_ci(correct, n)
    return {"accuracy": correct / n, "ci_lower": lo, "ci_upper": hi, "n": n}


def grid_f1(
    predictions: list[list[str]],
    ground_truths: list[list[str]],
) -> dict:
    """
    Per-cell F1 score for grid/select.
    predictions[i] = list of 'yes'/'no' per cell for challenge i.
    """
    tp = fp = fn = 0
    for pred_cells, gt_cells in zip(predictions, ground_truths):
        for p, g in zip(pred_cells, gt_cells):
            if p == "yes" and g == "yes":
                tp += 1
            elif p == "yes" and g == "no":
                fp += 1
            elif p == "no" and g == "yes":
                fn += 1
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) > 0 else 0.0)
    return {"f1": f1, "precision": precision, "recall": recall}


def rotation_accuracy(
    predictions: list[str],
    ground_truths: list[str],
    near_symmetric_flags: list[bool],
) -> dict:
    """
    Accuracy on 4-way rotation, reported separately for near-symmetric images.
    """
    normal_pred = [p for p, f in zip(predictions, near_symmetric_flags) if not f]
    normal_gt = [g for g, f in zip(ground_truths, near_symmetric_flags) if not f]
    sym_pred = [p for p, f in zip(predictions, near_symmetric_flags) if f]
    sym_gt = [g for g, f in zip(ground_truths, near_symmetric_flags) if f]

    def _acc(preds, gts):
        if not gts:
            return None
        c = sum(p == g for p, g in zip(preds, gts))
        lo, hi = wilson_ci(c, len(gts))
        return {"accuracy": c / len(gts), "ci_lower": lo, "ci_upper": hi, "n": len(gts)}

    return {
        "normal_images": _acc(normal_pred, normal_gt),
        "near_symmetric": _acc(sym_pred, sym_gt),
    }


def tiles_precision_recall(
    predictions: list[list[bool]],
    ground_truths: list[list[bool]],
) -> dict:
    """Precision / recall for novelty tile flagging."""
    tp = fp = fn = 0
    for pred_flags, gt_flags in zip(predictions, ground_truths):
        for p, g in zip(pred_flags, gt_flags):
            if p and g:
                tp += 1
            elif p and not g:
                fp += 1
            elif not p and g:
                fn += 1
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) > 0 else 0.0)
    return {"precision": precision, "recall": recall, "f1": f1}


def broken_circle_angular_error(
    predictions_deg: list[float],
    ground_truths_deg: list[float],
    tolerance_deg: float = 15.0,
) -> dict:
    """
    Mean angular error and accuracy-within-tolerance.
    """
    errors = []
    for p, g in zip(predictions_deg, ground_truths_deg):
        diff = abs(p - g) % 360
        errors.append(min(diff, 360 - diff))
    mean_err = sum(errors) / len(errors) if errors else 0.0
    within_tol = sum(e <= tolerance_deg for e in errors)
    n = len(errors)
    lo, hi = wilson_ci(within_tol, n)
    return {
        "mean_angular_error_deg": mean_err,
        f"accuracy_within_{int(tolerance_deg)}deg": within_tol / n if n else 0.0,
        "ci_lower": lo,
        "ci_upper": hi,
        "n": n,
    }


def slider_success_rate(settled_flags: list[bool]) -> dict:
    """Fraction of slider challenges the swarm settled within tolerance."""
    n = len(settled_flags)
    c = sum(settled_flags)
    lo, hi = wilson_ci(c, n)
    return {"success_rate": c / n if n else 0.0, "ci_lower": lo, "ci_upper": hi, "n": n}


# ---------------------------------------------------------------------------
# Ablation helpers
# ---------------------------------------------------------------------------

def swarm_size_ablation(
    results_by_n: dict[int, dict],
) -> dict[int, Any]:
    """
    results_by_n : {n_flies: metrics_dict}
    Returns the same dict (just for typed documentation).
    """
    return results_by_n


def distortion_ablation(
    results_by_difficulty: dict[str, dict],
) -> dict[str, Any]:
    """
    results_by_difficulty : {'easy': metrics, 'medium': metrics, 'hard': metrics}
    """
    return results_by_difficulty
