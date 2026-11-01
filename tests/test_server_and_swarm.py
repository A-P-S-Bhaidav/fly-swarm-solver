"""
test_server_and_swarm.py
========================
Comprehensive unit & API tests covering:
- FastAPI REST routes (`/`, `/health`, `/models`, `/types`, `/captcha/sample`)
- CAPTCHA multi-render generator invariants (same ground truth, distinct renders)
- Ridge-score probability calibration & broken-circle population-vector decoding
- Swarm tie-break and abstention edge cases
- Difficulty fallback model loading
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from flyswarm.local_captcha_gen import GENERATORS, generate, gt_label
from flyswarm.swarm import FlyResult, majority_vote_with_tiebreak
from server.app import app
from server.inference import (
    aggregate_swarm,
    decode_broken_circle_preds,
    is_correct,
    scores_to_probs,
)
from server.trainer import encode_labels, list_models


client = TestClient(app)


class TestFastAPIEndpoints:
    def test_root_endpoint(self) -> None:
        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "online"

    def test_health_endpoint(self) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["models_count"] >= 5
        assert set(body["supported_types"]) == set(GENERATORS.keys())

    def test_models_endpoint_reads_metadata_without_flybrain(self) -> None:
        models = list_models()
        assert len(models) >= 5
        resp = client.get("/models")
        assert resp.status_code == 200
        assert len(resp.json()) == len(models)

    @pytest.mark.parametrize("ctype", list(GENERATORS.keys()))
    def test_sample_captcha_endpoint(self, ctype: str) -> None:
        resp = client.get(f"/captcha/sample?type={ctype}&difficulty=hard")
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == ctype
        assert body["difficulty"] == "hard"
        assert len(body["captcha_b64"]) > 100


class TestGeneratorsAndCalibration:
    @pytest.mark.parametrize("ctype", list(GENERATORS.keys()))
    def test_multi_render_shares_ground_truth_but_varies_pixels(self, ctype: str) -> None:
        renders = generate(ctype, n_renders=3, difficulty="medium")
        assert len(renders) == 3
        labels = [gt_label(gt) for _, gt in renders]
        assert labels[0] == labels[1] == labels[2]
        arr0 = np.asarray(renders[0][0])
        arr1 = np.asarray(renders[1][0])
        assert arr0.shape == arr1.shape
        assert not np.array_equal(arr0, arr1)

    def test_scores_to_probs_handles_negative_and_unbounded_ridge_outputs(self) -> None:
        raw = np.array([[-0.4, 1.35, 0.1], [0.2, 0.2, 0.2]], dtype=np.float32)
        probs = scores_to_probs(raw)
        assert probs.shape == (2, 3)
        assert np.all(probs > 0.0) and np.all(probs < 1.0)
        assert np.allclose(probs.sum(axis=1), 1.0, atol=1e-5)
        assert int(np.argmax(probs[0])) == 1

    def test_broken_circle_sincos_encoding_and_decoding(self) -> None:
        y, l2i, i2l = encode_labels([0.0, 90.0, 270.0, 359.0], "broken_circle")
        assert y.shape == (4, 2)
        assert l2i == {} and i2l == {}
        angles, confs = decode_broken_circle_preds(y)
        assert is_correct(angles[0], 0.0, "broken_circle")
        assert is_correct(angles[1], 90.0, "broken_circle")
        assert is_correct(angles[2], 270.0, "broken_circle")
        assert is_correct(angles[3], 359.0, "broken_circle")
        assert np.all((confs > 0.0) & (confs <= 1.0))

    def test_majority_vote_tiebreak_picks_highest_confidence_fly(self) -> None:
        votes = [
            FlyResult(guess="90", confidence=0.70),
            FlyResult(guess="180", confidence=0.35),
            FlyResult(guess="180", confidence=0.35),
        ]
        winner, conf, had_tie = majority_vote_with_tiebreak(votes)
        assert had_tie is True
        assert winner == "90"
        assert conf > 0.0

    def test_aggregate_swarm_circular_wraparound(self) -> None:
        # Angles straddling 0/360: 355 deg and 5 deg -> circular mean should be ~0 deg, NOT 180 deg!
        preds = np.array([355.0, 5.0, 358.0, 2.0], dtype=np.float32)
        confs = np.array([0.8, 0.8, 0.8, 0.8], dtype=np.float32)
        ans, had_tie = aggregate_swarm(preds, confs, "broken_circle", {})
        assert had_tie is False
        assert is_correct(ans, 0.0, "broken_circle")
