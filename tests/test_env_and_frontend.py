"""
test_env_and_frontend.py
========================
Phase 0 + Phase 1 unit tests.

Tests:
  - ReceptorEncoder with a synthetic image
  - ConnectomeRunner (mocked — avoids loading full MaleCNS in CI)
  - Swarm N=1 degenerate case
  - Swarm tie-break rule
  - Swarm low-confidence abstain rule
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def synthetic_image():
    """64x64 random RGB image."""
    arr = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
    return Image.fromarray(arr)


@pytest.fixture
def mock_flybrain(monkeypatch):
    """Mock the flybrain module so tests run without full model weights."""
    fb = MagicMock()
    receptor = MagicMock()
    receptor.encode.return_value = np.random.rand(1000).astype(np.float32)
    receptor.encode_batch.side_effect = lambda imgs, **kw: np.random.rand(
        len(imgs), 1000
    ).astype(np.float32)
    fb.receptor_model.return_value = receptor

    cns = MagicMock()
    cns.forward.return_value = np.random.rand(500).astype(np.float32)
    cns.forward_batch.side_effect = lambda acts, **kw: np.random.rand(
        acts.shape[0], 500
    ).astype(np.float32)
    fb.MaleCNS.return_value = cns

    monkeypatch.setitem(sys.modules, "flybrain", fb)
    return fb


# ---------------------------------------------------------------------------
# ReceptorEncoder tests
# ---------------------------------------------------------------------------

class TestReceptorEncoder:
    def test_encode_returns_1d_array(self, mock_flybrain, synthetic_image):
        from flyswarm.receptor_encoding import ReceptorEncoder
        enc = ReceptorEncoder()
        result = enc.encode(synthetic_image)
        assert result.ndim == 1
        assert result.dtype == np.float32

    def test_encode_batch_shape(self, mock_flybrain, synthetic_image):
        from flyswarm.receptor_encoding import ReceptorEncoder
        enc = ReceptorEncoder()
        batch = [synthetic_image] * 5
        result = enc.encode_batch(batch)
        assert result.shape[0] == 5
        assert result.ndim == 2


# ---------------------------------------------------------------------------
# ConnectomeRunner tests
# ---------------------------------------------------------------------------

class TestConnectomeRunner:
    def test_run_returns_1d(self, mock_flybrain):
        from flyswarm.connectome import ConnectomeRunner
        runner = ConnectomeRunner()
        acts = np.random.rand(1000).astype(np.float32)
        spikes = runner.run(acts)
        assert spikes.ndim == 1

    def test_run_batch_shape(self, mock_flybrain):
        from flyswarm.connectome import ConnectomeRunner
        runner = ConnectomeRunner()
        acts = np.random.rand(5, 1000).astype(np.float32)
        spikes = runner.run_batch(acts)
        assert spikes.shape[0] == 5


# ---------------------------------------------------------------------------
# Swarm edge-case tests
# ---------------------------------------------------------------------------

class FakeHead:
    """Minimal readout head for testing Swarm logic."""

    def __init__(self, guess="A", confidence=0.9):
        self._guess = guess
        self._confidence = confidence

    def predict(self, spike_vector):
        return self._guess, self._confidence

    def aggregate(self, fly_results):
        # Simple: return first fly's guess
        return fly_results[0].guess, fly_results[0].confidence, False


class TestSwarm:
    def test_n1_degenerate(self, mock_flybrain, synthetic_image):
        from flyswarm.swarm import Swarm
        head = FakeHead(guess="Z", confidence=0.95)
        swarm = Swarm(readout_head=head)
        result = swarm.run([synthetic_image])
        assert result.n_flies == 1
        assert result.answer == "Z"
        assert not result.is_unsolved

    def test_n1_low_confidence_abstains(self, mock_flybrain, synthetic_image):
        from flyswarm.swarm import Swarm
        head = FakeHead(guess="Z", confidence=0.05)
        swarm = Swarm(readout_head=head, min_confidence=0.2)
        result = swarm.run([synthetic_image])
        assert result.is_unsolved
        assert result.answer == "unsolved"

    def test_swarm_n5_runs(self, mock_flybrain, synthetic_image):
        from flyswarm.swarm import Swarm
        head = FakeHead(guess="A", confidence=0.8)
        swarm = Swarm(readout_head=head)
        renders = [synthetic_image] * 5
        result = swarm.run(renders)
        assert result.n_flies == 5


# ---------------------------------------------------------------------------
# Metrics unit tests
# ---------------------------------------------------------------------------

class TestMetrics:
    def test_text_accuracy_perfect(self):
        from eval.metrics import text_accuracy
        m = text_accuracy(["ABC", "XYZ"], ["ABC", "XYZ"])
        assert m["accuracy"] == 1.0

    def test_text_accuracy_zero(self):
        from eval.metrics import text_accuracy
        m = text_accuracy(["AAA", "BBB"], ["XYZ", "ZZZ"])
        assert m["accuracy"] == 0.0

    def test_wilson_ci_basic(self):
        from eval.metrics import wilson_ci
        lo, hi = wilson_ci(50, 100)
        assert 0.0 <= lo <= hi <= 1.0
        assert abs((lo + hi) / 2 - 0.5) < 0.05

    def test_broken_circle_angular_error(self):
        from eval.metrics import broken_circle_angular_error
        m = broken_circle_angular_error([10.0, 355.0], [10.0, 355.0])
        assert m["mean_angular_error_deg"] == pytest.approx(0.0, abs=1e-5)
