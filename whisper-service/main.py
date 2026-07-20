import os

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
# A100은 float16 텐서 코어 성능이 좋음. 속도를 더 우선하면 "int8_float16"도 고려 가능
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")

app = FastAPI()
model: WhisperModel | None = None


@app.on_event("startup")
def load_model():
    global model
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {"ready": model is not None, "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(request: Request):
    if model is None:
        raise HTTPException(status_code=503, detail="모델이 아직 로드되지 않았어요.")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="오디오 데이터가 없어요.")

    # Next.js 쪽에서 디코딩해 보낸 16kHz 모노 PCM Float32 원본 바이트
    samples = np.frombuffer(body, dtype=np.float32)

    segments, info = model.transcribe(
        samples,
        language="ko",
        beam_size=5,
        vad_filter=True,  # 무음/노이즈 구간을 자동으로 걸러내 할루시네이션 방지
    )

    text = "".join(segment.text for segment in segments).strip()
    return JSONResponse({"text": text, "language": info.language})
