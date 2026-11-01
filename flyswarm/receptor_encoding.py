"""
receptor_encoding.py
====================
Converts a PIL image (or numpy array) into MaleCNS photoreceptor activations.

Supports both the `flybrain.receptor_model()` interface and direct biological
photoreceptor strip/quadrant encoding compatible with `flybrain.FlyBrain`.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np
from PIL import Image

DEFAULT_PRESENTATION_MS: int = 100
DEFAULT_INPUT_SIZE: tuple[int, int] = (128, 128)


class ReceptorEncoder:
    """
    Convert a 2-D or 3-D image into photoreceptor activation vectors.

    Parameters
    ----------
    presentation_ms : int
        Simulated stimulus presentation window in milliseconds.
    input_size : tuple[int, int]
        (width, height) to which images are resized before encoding.
    """

    def __init__(
        self,
        presentation_ms: int = DEFAULT_PRESENTATION_MS,
        input_size: tuple[int, int] = DEFAULT_INPUT_SIZE,
    ) -> None:
        self.presentation_ms = int(presentation_ms)
        self.input_size = tuple(input_size)
        self._receptor = None
        try:
            import flybrain  # noqa: PLC0415

            if hasattr(flybrain, "receptor_model"):
                self._receptor = flybrain.receptor_model()
        except ImportError:
            self._receptor = None

    def _prepare_array(self, image: Image.Image | np.ndarray) -> np.ndarray:
        if isinstance(image, Image.Image):
            pil_img = image.convert("RGB").resize(self.input_size, Image.Resampling.LANCZOS)
            return np.asarray(pil_img, dtype=np.float32) / 255.0
        arr = np.asarray(image, dtype=np.float32)
        if arr.max() > 1.0:
            arr = arr / 255.0
        return arr

    def encode(self, image: Image.Image | np.ndarray) -> np.ndarray:
        """Encode a single image into a 1-D float32 photoreceptor activation vector."""
        arr = self._prepare_array(image)
        if self._receptor is not None:
            out = self._receptor.encode(arr, presentation_ms=self.presentation_ms)
            return np.asarray(out, dtype=np.float32).ravel()

        # Biological fallback: R1-R6 luminance + R7/R8 chromatic contrast channels
        if arr.ndim == 3 and arr.shape[2] >= 3:
            lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            rg_opponency = arr[:, :, 0] - 0.5 * (arr[:, :, 1] + arr[:, :, 2])
            h_strip = lum.mean(axis=0)
            v_strip = lum.mean(axis=1)
            c_strip = np.clip(rg_opponency.mean(axis=0), -1.0, 1.0)
            vec = np.concatenate([h_strip, v_strip, c_strip], axis=0)
        else:
            vec = arr.ravel()
        return np.asarray(vec, dtype=np.float32)

    def encode_batch(self, images: Sequence[Image.Image | np.ndarray]) -> np.ndarray:
        """Encode a sequence of N images into a 2-D float32 array of shape (N, n_receptors)."""
        if not images:
            return np.empty((0, 0), dtype=np.float32)

        prepared = [self._prepare_array(img) for img in images]
        if self._receptor is not None and hasattr(self._receptor, "encode_batch"):
            out = self._receptor.encode_batch(prepared, presentation_ms=self.presentation_ms)
            return np.asarray(out, dtype=np.float32)

        return np.stack([self.encode(arr) for arr in prepared], axis=0).astype(np.float32)
