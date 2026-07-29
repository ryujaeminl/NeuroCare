import io
import logging

import edge_tts
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from pydantic import BaseModel

import speaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neurocare-stt")

app = FastAPI(title="Neurocare STT Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# GPU(A100)에서 float16으로 돌린다 - CPU/int8 대비 전사 지연이 크게 줄어든다.
# large-v3는 small보다 훨씬 정확한 한국어 인식을 하는데, A100에서는 지연 비용이
# 거의 안 든다(VRAM도 80GB라 넉넉함) - 정확도 요구사항 때문에 큰 모델을 그대로 쓴다.
model = WhisperModel("large-v3", device="cuda", compute_type="float16")

# 차분하고 안정적인 톤의 한국어 여성 뉴스캐스터 보이스. 감정 기복이 큰 보이스는 피한다.
DEFAULT_TTS_VOICE = "ko-KR-SunHiNeural"


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None

# 무음/잡음(TV 소리 등) 구간에서 whisper가 자주 만들어내는 정형 문구.
# 발화 전체가 이 문구와 (거의) 일치할 때만 걸러낸다 - 짧은 일반 단어는 넣지 않는다.
_HALLUCINATION_PHRASES = {
    "시청해주셔서감사합니다",
    "구독과좋아요부탁드립니다",
    "구독과좋아요를눌러주세요",
    "다음영상에서만나요",
    "이영상은유료광고를포함하고있습니다",
    "자막제공",
    "mbc뉴스",
}


def _normalize(text: str) -> str:
    return "".join(text.split()).lower()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    speaker_id: str | None = Form(default=None),
) -> dict:
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio file")

    # 성문이 등록된 사용자라면 본인 목소리인지 먼저 확인한다.
    # 등록 전이면 similarity가 None이라 기존과 동일하게 동작한다(하위 호환).
    similarity: float | None = None
    if speaker_id:
        try:
            similarity = speaker.verify(speaker_id, audio_bytes)
        except Exception:  # noqa: BLE001 - 화자 검증 실패가 전사를 막지 않게 한다
            logger.exception("speaker verification failed")

        if similarity is not None and similarity < speaker.SIMILARITY_THRESHOLD:
            logger.info("다른 화자로 판단해 무시 (유사도 %.2f)", similarity)
            return {"text": "", "language": "ko", "duration": 0.0, "speaker_similarity": similarity}

    try:
        segments, info = model.transcribe(
            io.BytesIO(audio_bytes),
            language="ko",
            # 클라이언트가 이미 VAD로 발화 구간만 잘라 보내지만, 마이크 주변 TV 소리 같은
            # 잡음이 섞여 들어온 경우를 대비해 whisper 자체 VAD로 한 번 더 걸러낸다.
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300),
        )

        kept_text = []
        for segment in segments:
            # no_speech_prob이 높거나(사실상 무음/잡음) avg_logprob이 낮으면(모델 스스로도
            # 확신 못 하는 억지 전사 - 잡음에서 흔함) 그 구간은 버린다.
            if segment.no_speech_prob < 0.5 and segment.avg_logprob > -0.8:
                kept_text.append(segment.text)
        text = "".join(kept_text).strip()

        if _normalize(text) in _HALLUCINATION_PHRASES:
            text = ""
    except Exception as exc:  # noqa: BLE001 - 클라이언트가 원인을 알 수 있게 그대로 전달
        logger.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"transcription failed: {exc}") from exc

    return {
        "text": text,
        "language": info.language,
        "duration": info.duration,
        "speaker_similarity": similarity,
    }


@app.post("/enroll")
async def enroll(speaker_id: str = Form(...), file: UploadFile = File(...)) -> dict:
    """등록용 음성으로 성문을 저장한다. 이후 이 사람 목소리만 대화로 인정된다."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio file")

    try:
        duration = speaker.enroll(speaker_id, audio_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("enrollment failed")
        raise HTTPException(status_code=500, detail=f"enrollment failed: {exc}") from exc

    return {"enrolled": True, "duration": duration}


@app.get("/enroll/{speaker_id}")
def enrollment_status(speaker_id: str) -> dict:
    return {"enrolled": speaker.has_voiceprint(speaker_id)}


@app.delete("/enroll/{speaker_id}")
def delete_enrollment(speaker_id: str) -> dict:
    return {"deleted": speaker.delete_voiceprint(speaker_id)}


@app.post("/tts")
async def tts(payload: TTSRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text가 비어 있습니다")

    voice = payload.voice or DEFAULT_TTS_VOICE

    async def audio_stream():
        # 환자의 인지 처리 시간을 고려해 기본보다 살짝 느리게 (-10%)
        communicate = edge_tts.Communicate(text, voice=voice, rate="-10%")
        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception:
            logger.exception("tts streaming failed")
            raise

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")
