"""
check_env.py
============
Environment verification script — checks Python, ML, FastAPI, and optional
connectome dependencies across macOS, Linux, and Windows.

Run with:
    python setup/check_env.py
"""

from __future__ import annotations

import importlib
import platform
import subprocess
import sys
from typing import Callable


def check(name: str, fn: Callable[[], str]) -> bool:
    try:
        result = fn()
        status = "PASS"
        detail = f" -> {result}" if result else ""
    except Exception as exc:
        status = "FAIL"
        detail = f" ({exc})"
    pad = "." * max(1, 40 - len(name))
    print(f"  {name} {pad} [{status}]{detail}")
    return status == "PASS"


def main() -> None:
    print("=" * 64)
    print("FlySwarm Solver — Environment Diagnostics")
    print(f"Python:   {sys.version.split()[0]}")
    print(f"Platform: {platform.platform()}")
    print("=" * 64)

    critical: list[bool] = []
    optional: list[bool] = []

    print("\n[Core Scientific & Server Stack]")
    critical.append(check("numpy", lambda: importlib.import_module("numpy").__version__))
    critical.append(check("scipy", lambda: importlib.import_module("scipy").__version__))
    critical.append(check("scikit-learn", lambda: importlib.import_module("sklearn").__version__))
    critical.append(check("numba", lambda: importlib.import_module("numba").__version__))
    critical.append(check("pillow", lambda: importlib.import_module("PIL").__version__))
    critical.append(check("opencv-python-headless", lambda: importlib.import_module("cv2").__version__))
    critical.append(check("fastapi", lambda: importlib.import_module("fastapi").__version__))
    critical.append(check("uvicorn", lambda: importlib.import_module("uvicorn").__version__))

    print("\n[MaleCNS v1.0 Simulation Engine]")

    def _check_flybrain() -> str:
        fb = importlib.import_module("flybrain")
        ver = getattr(fb, "__version__", "installed")
        return f"v{ver}"

    critical.append(check("flybrain", _check_flybrain))

    print("\n[Optional Acceleration & Baselines]")

    def _check_cupy() -> str:
        cp = importlib.import_module("cupy")
        return f"v{cp.__version__}, {cp.cuda.runtime.getDeviceCount()} GPU(s)"

    optional.append(check("cupy (GPU backend)", _check_cupy))
    optional.append(check("psutil", lambda: importlib.import_module("psutil").__version__))
    optional.append(
        check(
            "pytesseract",
            lambda: str(importlib.import_module("pytesseract").get_tesseract_version()),
        )
    )
    optional.append(
        check(
            "docker",
            lambda: subprocess.check_output(["docker", "--version"], text=True).strip(),
        )
    )

    crit_passed = sum(critical)
    opt_passed = sum(optional)
    print(f"\n{'=' * 64}")
    print(f"  Critical checks: {crit_passed}/{len(critical)} passed")
    print(f"  Optional checks: {opt_passed}/{len(optional)} passed")
    if crit_passed == len(critical):
        print("  [OK] Core runtime environment is ready.")
    else:
        print("  [ERROR] Missing critical dependencies; run `pip install -r requirements.txt`.")
    print("=" * 64)


if __name__ == "__main__":
    main()
