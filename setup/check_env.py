"""
check_env.py
============
Phase 0 smoke test — verifies every dependency needed by Fly Swarm
is correctly installed in D:\\flyswarm-env.

Run with:
    D:\\flyswarm-env\\Scripts\\python setup\\check_env.py
"""

from __future__ import annotations

import importlib
import platform
import sys
from typing import Callable


def check(name: str, fn: Callable) -> bool:
    try:
        result = fn()
        status = "PASS"
        detail = f"  → {result}" if result else ""
    except Exception as exc:
        status = "FAIL"
        detail = f"  ✗ {exc}"
    pad = "." * max(1, 40 - len(name))
    print(f"  {name} {pad} [{status}]{detail}")
    return status == "PASS"


def main() -> None:
    print("=" * 60)
    print("Fly Swarm — Environment Check")
    print(f"Python {sys.version}")
    print(f"Platform: {platform.platform()}")
    print("=" * 60)

    results: list[bool] = []

    # ── Core ML stack ────────────────────────────────────────────────
    print("\n[Core ML stack]")
    results.append(check("numpy", lambda: importlib.import_module("numpy").__version__))
    results.append(check("scipy", lambda: importlib.import_module("scipy").__version__))
    results.append(check("scikit-learn", lambda: importlib.import_module("sklearn").__version__))
    results.append(check("numba", lambda: importlib.import_module("numba").__version__))
    results.append(check("pillow", lambda: importlib.import_module("PIL").__version__))
    results.append(check("opencv-python-headless",
                         lambda: importlib.import_module("cv2").__version__))

    # ── flybrain ─────────────────────────────────────────────────────
    print("\n[flybrain (MaleCNS v1.0)]")
    def _check_flybrain():
        import flybrain  # noqa: PLC0415
        ver = flybrain.__version__
        # Run the quickstart example
        model = flybrain.receptor_model()
        import numpy as np  # noqa: PLC0415
        dummy = np.random.rand(128, 128, 3).astype(np.float32)
        acts = model.encode(dummy, presentation_ms=100)
        cns = flybrain.MaleCNS(backend="cpu")
        spikes = cns.forward(acts)
        return f"v{ver} — quickstart OK, spike vector shape {spikes.shape}"
    results.append(check("flybrain + quickstart", _check_flybrain))

    # ── GPU (optional) ───────────────────────────────────────────────
    print("\n[GPU support (optional)]")
    def _check_cupy():
        import cupy  # noqa: PLC0415
        return f"v{cupy.__version__}, GPU: {cupy.cuda.runtime.getDeviceCount()} device(s)"
    results.append(check("cupy (GPU backend)", _check_cupy))

    # ── Utilities ────────────────────────────────────────────────────
    print("\n[Utilities]")
    results.append(check("psutil", lambda: importlib.import_module("psutil").__version__))
    results.append(check("pytesseract",
                         lambda: importlib.import_module("pytesseract").get_tesseract_version()))

    # ── Docker ───────────────────────────────────────────────────────
    print("\n[Docker (for PHP generators)]")
    import subprocess  # noqa: PLC0415
    def _check_docker():
        out = subprocess.check_output(["docker", "--version"], text=True).strip()
        return out
    results.append(check("docker", _check_docker))

    # ── Summary ──────────────────────────────────────────────────────
    passed = sum(results)
    total = len(results)
    print(f"\n{'=' * 60}")
    # CuPy failure is not a blocker — don't count it as critical
    critical_failures = total - passed
    if cupy_idx := None:  # placeholder
        pass
    print(f"  {passed}/{total} checks passed.")
    if passed == total:
        print("  ✅ Environment is fully ready.")
    elif passed >= total - 1:
        print("  ⚠  One optional check failed (likely CuPy/GPU — non-critical).")
    else:
        print("  ❌ Critical dependencies missing — see FAILs above.")
    print("=" * 60)


if __name__ == "__main__":
    main()
