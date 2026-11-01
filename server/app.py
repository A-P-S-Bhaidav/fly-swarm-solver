"""
app.py
======
FastAPI backend — REST + WebSocket API for MaleCNS v1.0 connectome training
and real-time multi-agent CAPTCHA inference.

Start with:
    python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload

Endpoints
---------
GET  /                  -> API status summary
GET  /health            -> Container/cloud healthcheck probe
GET  /models            -> List serialized readout models
GET  /types             -> List supported CAPTCHA challenge categories
GET  /captcha/sample    -> Generate a base64 PNG preview stimulus
WS   /ws/train          -> Stream live connectome readout training progress
WS   /ws/infer          -> Stream per-step connectome firing telemetry + consensus
"""

from __future__ import annotations

import asyncio
import base64
from io import BytesIO
import json
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from flyswarm.local_captcha_gen import GENERATORS, generate, gt_label
from server.inference import run_inference
from server.trainer import list_models, train

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FlySwarm Connectome Solver API",
    description="Ensemble Drosophila melanogaster (MaleCNS v1.0) CAPTCHA solver backend.",
    version="1.0.0",
)

cors_origins_env = os.environ.get("CORS_ORIGINS", "*").strip()
allowed_origins = (
    ["*"]
    if cors_origins_env == "*"
    else [o.strip() for o in cors_origins_env.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# REST endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse({
        "service": "FlySwarm Connectome Solver API",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    })


@app.get("/health")
async def health() -> JSONResponse:
    models = list_models()
    return JSONResponse({
        "status": "ok",
        "models_count": len(models),
        "supported_types": list(GENERATORS.keys()),
    })


@app.get("/models")
async def get_models() -> JSONResponse:
    return JSONResponse(list_models())


@app.get("/types")
async def get_types() -> JSONResponse:
    return JSONResponse(list(GENERATORS.keys()))


@app.get("/captcha/sample")
async def get_sample_captcha(
    type: str = "rotate",
    difficulty: str = "medium",
) -> JSONResponse:
    captcha_type = type if type in GENERATORS else "rotate"
    diff = difficulty if difficulty in {"easy", "medium", "hard"} else "medium"
    renders = generate(captcha_type, n_renders=1, difficulty=diff)
    img, gt = renders[0]
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return JSONResponse({
        "captcha_b64": b64,
        "type": captcha_type,
        "difficulty": diff,
        "sample_label": str(gt_label(gt)),
    })


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket: training
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/train")
async def ws_train(ws: WebSocket) -> None:
    await ws.accept()
    try:
        raw = await ws.receive_text()
        req = json.loads(raw)
        captcha_type = req.get("type", "rotate")
        difficulty = req.get("difficulty", "medium")
        n_train = int(req.get("n_train", 80))

        logger.info(
            "Training request: type=%s difficulty=%s n=%d",
            captcha_type,
            difficulty,
            n_train,
        )

        async def progress_cb(frac: float, message: str) -> None:
            await ws.send_json({
                "event": "progress",
                "frac": round(frac, 3),
                "message": message,
            })

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
async def ws_infer(ws: WebSocket) -> None:
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
            n_flies = max(1, min(16, int(req.get("n_flies", 5))))

            logger.info(
                "Inference request: type=%s difficulty=%s n_flies=%d",
                captcha_type,
                difficulty,
                n_flies,
            )

            await ws.send_json({
                "event": "start",
                "type": captcha_type,
                "difficulty": difficulty,
                "n_flies": n_flies,
            })

            try:
                async for msg in run_inference(captcha_type, difficulty, n_flies):
                    await ws.send_json(msg)
                    await asyncio.sleep(0)
            except Exception as infer_exc:
                logger.exception("Inference run error")
                await ws.send_json({"event": "error", "message": str(infer_exc)})

    except WebSocketDisconnect:
        logger.info("Inference WebSocket disconnected")
    except Exception as exc:
        logger.exception("WebSocket session error")
        try:
            await ws.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
