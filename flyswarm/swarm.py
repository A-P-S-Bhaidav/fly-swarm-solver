"""
swarm.py
========
Orchestrates the single-fly baseline and confidence-weighted swarm consensus pipeline.

Edge cases handled per spec §6:
- N=1: degrades cleanly to single-fly prediction without special-case branching.
- Tied vote: falls back to the highest-confidence individual fly and logs the tie.
- Low aggregate confidence: abstains with "unsolved" when below `min_confidence`.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
import logging
from typing import Any, Protocol, Sequence

import numpy as np
from PIL import Image

from flyswarm.connectome import ConnectomeRunner
from flyswarm.receptor_encoding import ReceptorEncoder

logger = logging.getLogger(__name__)


class ReadoutHeadProtocol(Protocol):
    def predict(self, spike_vector: np.ndarray) -> tuple[Any, float]: ...


@dataclass
class FlyResult:
    """Single-fly readout prediction and confidence."""

    guess: Any
    confidence: float


@dataclass
class SwarmResult:
    """Aggregated ensemble output across N connectome instances."""

    answer: Any
    confidence: float
    n_flies: int
    fly_results: list[FlyResult] = field(default_factory=list)
    had_tie: bool = False
    is_unsolved: bool = False


def majority_vote_with_tiebreak(
    fly_results: Sequence[FlyResult],
) -> tuple[Any, float, bool]:
    """
    Confidence-weighted majority vote across discrete guesses.
    If multiple classes tie for maximum weighted vote, selects the guess
    of the single highest-confidence fly and marks `had_tie = True`.
    """
    if not fly_results:
        return "unsolved", 0.0, False

    if len(fly_results) == 1:
        only = fly_results[0]
        return only.guess, float(only.confidence), False

    scores: dict[Any, float] = defaultdict(float)
    for res in fly_results:
        scores[res.guess] += max(0.0, float(res.confidence))

    total_weight = sum(scores.values())
    if total_weight <= 0.0:
        best_fly = max(fly_results, key=lambda r: r.confidence)
        return best_fly.guess, float(best_fly.confidence), True

    max_score = max(scores.values())
    tied = [ans for ans, sc in scores.items() if abs(sc - max_score) <= 1e-6]
    had_tie = len(tied) > 1

    if had_tie:
        best_fly = max(fly_results, key=lambda r: r.confidence)
        winner = best_fly.guess
        logger.info("Swarm vote tie among %s; resolved via max-confidence fly (%s).", tied, winner)
    else:
        winner = tied[0]

    agg_confidence = float(max_score / max(len(fly_results), 1))
    return winner, agg_confidence, had_tie


class Swarm:
    """
    Ensemble runner coordinating receptor encoding, MaleCNS forward passes,
    per-fly readout decoding, and confidence-weighted consensus aggregation.
    """

    def __init__(
        self,
        readout_head: Any,
        receptor_encoder: ReceptorEncoder | None = None,
        connectome_runner: ConnectomeRunner | None = None,
        min_confidence: float = 0.15,
    ) -> None:
        self.readout_head = readout_head
        self.receptor_encoder = receptor_encoder or ReceptorEncoder()
        self.connectome_runner = connectome_runner or ConnectomeRunner()
        self.min_confidence = float(min_confidence)

    def run(self, renders: Sequence[Image.Image | np.ndarray]) -> SwarmResult:
        """Run N renders of a challenge through N flies and aggregate their predictions."""
        n_flies = len(renders)
        if n_flies == 0:
            raise ValueError("Swarm.run requires at least 1 render.")

        activations = self.receptor_encoder.encode_batch(renders)
        spike_matrix = self.connectome_runner.run_batch(activations)

        fly_results: list[FlyResult] = []
        for i in range(n_flies):
            guess, conf = self.readout_head.predict(spike_matrix[i])
            fly_results.append(FlyResult(guess=guess, confidence=float(conf)))

        if n_flies == 1:
            answer = fly_results[0].guess
            confidence = fly_results[0].confidence
            had_tie = False
        elif hasattr(self.readout_head, "aggregate"):
            answer, confidence, had_tie = self.readout_head.aggregate(fly_results)
        else:
            answer, confidence, had_tie = majority_vote_with_tiebreak(fly_results)

        if float(confidence) < self.min_confidence:
            logger.info(
                "Swarm aggregate confidence %.3f < min_confidence %.3f -> unsolved",
                confidence,
                self.min_confidence,
            )
            return SwarmResult(
                answer="unsolved",
                confidence=float(confidence),
                n_flies=n_flies,
                fly_results=fly_results,
                had_tie=had_tie,
                is_unsolved=True,
            )

        return SwarmResult(
            answer=answer,
            confidence=float(confidence),
            n_flies=n_flies,
            fly_results=fly_results,
            had_tie=had_tie,
            is_unsolved=False,
        )
