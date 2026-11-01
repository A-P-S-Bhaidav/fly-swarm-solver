"""
test_infer_cli.py
=================
Integration smoke test & CLI runner for server.inference.

When `flybrain` weights are installed, tests full connectome streaming;
when running in lightweight CI without `flybrain`, skips live simulation
cleanly while validating mocked inference streaming end-to-end.
"""

from __future__ import annotations

import asyncio
import importlib.util
from unittest.mock import MagicMock

import numpy as np
import pytest

HAS_FLYBRAIN = importlib.util.find_spec("flybrain") is not None


@pytest.mark.parametrize("ctype", ["rotate", "broken_circle", "text", "math", "scatter"])
def test_inference_stream_mocked(monkeypatch: pytest.MonkeyPatch, ctype: str) -> None:
    """Verify full async generator protocol (`challenge` -> `step` x 8 -> `result`) for all 5 types."""
    import sys
    import server.inference as inf_mod

    fake_fb = MagicMock()
    fake_fb.ensure_data = MagicMock()

    class FakeBrain:
        def __init__(self, batch: int = 1, seed: int = 0, sensory_input: bool = False) -> None:
            self.batch = batch
            self.n = 139662
            self.visual = np.arange(64)

        def cells(self, names: list[str], side: str = "L") -> np.ndarray:
            return np.array([1, 2, 3], dtype=np.int32)

        def reset(self) -> None:
            pass

        def step(self, eye_drive=None, inject=None):
            if self.batch == 1:
                return np.array([10, 42, 108], dtype=np.int32)
            return [np.array([10 + i, 42 + i, 108 + i], dtype=np.int32) for i in range(self.batch)]

    class FakeTrace:
        def __init__(self, brain, types=None, aggregate: str = "batch") -> None:
            self.brain = brain

        def reset(self) -> None:
            pass

        def observe(self, fired) -> None:
            pass

        def features(self) -> np.ndarray:
            return np.ones((16, self.brain.batch), dtype=np.float32) * 0.25

    class FakeReadout:
        def __init__(self, n_out: int) -> None:
            self.n_out = n_out

        def predict(self, x: np.ndarray) -> np.ndarray:
            n = x.shape[0]
            if self.n_out == 2:  # broken_circle sincos
                return np.tile(np.array([[0.5, 0.866]], dtype=np.float32), (n, 1))
            scores = np.zeros((n, self.n_out), dtype=np.float32)
            scores[:, 0] = 0.9
            return scores

    fake_fb.FlyBrain = FakeBrain
    fake_fb.Trace = FakeTrace
    monkeypatch.setitem(sys.modules, "flybrain", fake_fb)
    monkeypatch.setattr(inf_mod, "_DATA_ENSURED", False)

    fake_i2l = {0: "0", 1: "90", 2: "180", 3: "270"} if ctype == "rotate" else {0: "SWARM", 1: "OPTIC"}
    n_out = 2 if ctype == "broken_circle" else len(fake_i2l)
    monkeypatch.setattr(
        inf_mod,
        "load_model",
        lambda ct, diff: {
            "readout": FakeReadout(n_out),
            "idx_to_label": {} if ctype == "broken_circle" else fake_i2l,
            "n_visual": 64,
        },
    )

    async def _collect():
        events = []
        async for ev in inf_mod.run_inference(ctype, "medium", n_flies=3):
            events.append(ev)
        return events

    events = asyncio.run(_collect())
    assert events[0]["event"] == "challenge"
    step_events = [e for e in events if e["event"] == "step"]
    assert len(step_events) == 8
    assert len(step_events[0]["fly_fired"]) == 3
    res = events[-1]
    assert res["event"] == "result"
    assert len(res["fly_answers"]) == 3
    assert all(0.0 <= c <= 1.0 for c in res["confidences"])


async def _cli_runner() -> None:
    from server.inference import run_inference

    for ctype in ["rotate", "broken_circle", "text", "math", "scatter"]:
        print(f"\n--- Testing {ctype} inference (N=3 flies) ---")
        async for event in run_inference(ctype, "medium", n_flies=3):
            if event["event"] == "result":
                print(f"  Ground truth: {event['ground_truth']}")
                print(f"  Fly answers:  {event['fly_answers']}")
                print(f"  Swarm answer: {event['swarm_answer']}")
                print(f"  Correct:      {event['correct']}")


if __name__ == "__main__":
    asyncio.run(_cli_runner())
