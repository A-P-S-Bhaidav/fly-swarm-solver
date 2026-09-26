"""
app.py
======
FastAPI server — REST + WebSocket for training and real-time inference.

Start with:
    D:\\flyswarm-env\\Scripts\\python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload

Endpoints
---------
GET  /                  → serves frontend/index.html
GET  /models            → list trained models
WS   /ws/train          → stream training progress
WS   /ws/infer          → stream real-time inference steps + result
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).parent.parent))
from server.trainer import train, list_models
from server.inference import run_inference
from flyswarm.local_captcha_gen import GENERATORS, generate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Fly Swarm CAPTCHA", version="0.1.0")

# Allow Next.js dev server and any localhost origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# REST endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return JSONResponse({"status": "FlySwarm API running", "docs": "/docs"})


@app.get("/models")
async def get_models():
    return JSONResponse(list_models())


@app.get("/types")
async def get_types():
    return JSONResponse(list(GENERATORS.keys()))


@app.get("/captcha/sample")
async def get_sample_captcha(type: str = "rotate", difficulty: str = "medium"):
    import base64
    from io import BytesIO
    if type not in GENERATORS:
        type = "rotate"
    renders = generate(type, n_renders=1, difficulty=difficulty)
    buf = BytesIO()
    renders[0][0].save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return JSONResponse({"captcha_b64": b64, "type": type, "difficulty": difficulty})


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket: training
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/train")
async def ws_train(ws: WebSocket):
    """
    Client sends JSON: {"type": "rotate", "difficulty": "medium", "n_train": 80}
    Server streams:    {"event": "progress", "frac": 0.45, "message": "..."}
                       {"event": "done", "cv_score": 0.82, ...}
                       {"event": "error", "message": "..."}
    """
    await ws.accept()
    try:
        raw = await ws.receive_text()
        req = json.loads(raw)
        captcha_type = req.get("type", "rotate")
        difficulty = req.get("difficulty", "medium")
        n_train = int(req.get("n_train", 80))

        logger.info("Training request: type=%s difficulty=%s n=%d", captcha_type, difficulty, n_train)

        async def progress_cb(frac: float, message: str) -> None:
            await ws.send_json({"event": "progress", "frac": round(frac, 3), "message": message})

        result = await train(captcha_type, difficulty, n_train, progress_cb)
        await ws.send_json({"event": "done", **result})

    except WebSocketDisconnect:
        logger.info("Training WebSocket disconnected")
    except Exception as exc:
        logger.exception("Training error")
        try:
            await ws.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket: inference
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/infer")
async def ws_infer(ws: WebSocket):
    """
    Client sends JSON: {"type": "rotate", "difficulty": "medium", "n_flies": 5}
    Server streams per step: {"event": "step", "step": 12, "spike_rate": 0.23, ...}
    Server sends final:      {"event": "result", "correct": true, ...}
    Client can send "next" to request another challenge without reconnecting.
    """
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            if raw.strip() == "ping":
                await ws.send_text("pong")
                continue

            req = json.loads(raw)
            if req.get("action") == "stop":
                break

            captcha_type = req.get("type", "rotate")
            difficulty = req.get("difficulty", "medium")
            n_flies = int(req.get("n_flies", 5))

            logger.info("Inference request: type=%s difficulty=%s n_flies=%d",
                        captcha_type, difficulty, n_flies)

            await ws.send_json({"event": "start", "type": captcha_type,
                                "difficulty": difficulty, "n_flies": n_flies})

            async for msg in run_inference(captcha_type, difficulty, n_flies):
                await ws.send_json(msg)
                # Tiny yield so the event loop can breathe
                await asyncio.sleep(0)

    except WebSocketDisconnect:
        logger.info("Inference WebSocket disconnected")
    except FileNotFoundError as exc:
        try:
            await ws.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass
    except Exception as exc:
        logger.exception("Inference error")
        try:
            await ws.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
