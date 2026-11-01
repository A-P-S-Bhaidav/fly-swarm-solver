"""
connectome.py
=============
Wraps flybrain's MaleCNS v1.0 connectome forward pass.

Exposes:
    ConnectomeRunner.run(activations)          -> spike_vector  (n_neurons,)
    ConnectomeRunner.run_batch(activations_2d) -> spike_matrix  (N, n_neurons)
"""

from __future__ import annotations

import numpy as np


class ConnectomeRunner:
    """
    Drives MaleCNS v1.0 forward pass for a photoreceptor activation vector.

    Parameters
    ----------
    output_population : list[str] | str | None
        Named neuron population(s) to read spike counts from.
        None -> default downstream readout populations (descending & central brain).
    use_gpu : bool
        If True, attempt GPU backend if available; falls back to CPU cleanly.
    steps : int
        Number of 20 ms integration steps per forward pass.
    """

    def __init__(
        self,
        output_population: list[str] | str | None = None,
        use_gpu: bool = False,
        steps: int = 8,
    ) -> None:
        self.output_population = output_population
        self.use_gpu = use_gpu
        self.steps = max(1, int(steps))
        self._cns = None
        self._flybrain_mod = None

        try:
            import flybrain  # noqa: PLC0415

            self._flybrain_mod = flybrain
            if hasattr(flybrain, "MaleCNS"):
                backend = "gpu" if use_gpu else "cpu"
                try:
                    self._cns = flybrain.MaleCNS(backend=backend)
                except Exception:
                    self._cns = flybrain.MaleCNS(backend="cpu")
        except ImportError:
            self._flybrain_mod = None

    def _population_types(self) -> list[str]:
        if self.output_population is None:
            return ["descending_neuron", "cb_intrinsic"]
        if isinstance(self.output_population, str):
            return [self.output_population]
        return list(self.output_population)

    def run(self, activations: np.ndarray) -> np.ndarray:
        """Run a single activation vector through MaleCNS and return a 1-D spike vector."""
        acts = np.asarray(activations, dtype=np.float32).ravel()

        if self._cns is not None:
            out = self._cns.forward(acts)
            return np.asarray(out, dtype=np.float32).ravel()

        if self._flybrain_mod is not None and hasattr(self._flybrain_mod, "FlyBrain"):
            brain = self._flybrain_mod.FlyBrain(batch=1, seed=42, sensory_input=False)
            trace = self._flybrain_mod.Trace(
                brain, types=self._population_types(), aggregate="mean"
            )
            n_vis = len(brain.visual)
            eye = np.interp(
                np.linspace(0.0, 1.0, n_vis),
                np.linspace(0.0, 1.0, len(acts)),
                acts,
            ).astype(np.float32)
            brain.reset()
            trace.reset()
            for _ in range(self.steps):
                fired = brain.step(eye_drive=eye)
                trace.observe(fired)
            return np.asarray(trace.features(), dtype=np.float32).ravel()

        raise RuntimeError("flybrain is required to run ConnectomeRunner.")

    def run_batch(self, activations_2d: np.ndarray) -> np.ndarray:
        """Run a batch of N activation vectors and return a (N, n_features) spike matrix."""
        acts = np.asarray(activations_2d, dtype=np.float32)
        if acts.ndim == 1:
            acts = acts[None, :]

        if self._cns is not None and hasattr(self._cns, "forward_batch"):
            out = self._cns.forward_batch(acts)
            return np.asarray(out, dtype=np.float32)

        if self._flybrain_mod is not None and hasattr(self._flybrain_mod, "FlyBrain"):
            batch_n = acts.shape[0]
            brain = self._flybrain_mod.FlyBrain(batch=batch_n, seed=42, sensory_input=False)
            trace = self._flybrain_mod.Trace(
                brain, types=self._population_types(), aggregate="batch"
            )
            n_vis = len(brain.visual)
            x_src = np.linspace(0.0, 1.0, acts.shape[1])
            x_dst = np.linspace(0.0, 1.0, n_vis)
            eye_drives = np.stack(
                [np.interp(x_dst, x_src, acts[i]).astype(np.float32) for i in range(batch_n)],
                axis=1,
            )
            brain.reset()
            trace.reset()
            for _ in range(self.steps):
                fired = brain.step(eye_drive=eye_drives)
                fired_list = [fired] if batch_n == 1 else fired
                trace.observe(fired_list)
            feats = np.asarray(trace.features(), dtype=np.float32)
            if feats.ndim == 1:
                feats = feats[:, None]
            return feats.T

        return np.stack([self.run(acts[i]) for i in range(acts.shape[0])], axis=0)
