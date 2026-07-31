import io
import json
import logging
from pathlib import Path

import edge_tts
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from pydantic import BaseModel

import speaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neurocare-stt")

# 원격에는 SSH를 안 주기로 했으니, 배포가 실제로 어느 커밋을 반영했는지 /health로
# curl 한 번에 확인하려고 둔다(deploy.sh가 빌드 직전에 이 파일을 만든다).
_BUILD_INFO_FILE = Path(__file__).parent / "BUILD_INFO"
_build_info = _BUILD_INFO_FILE.read_text().strip() if _BUILD_INFO_FILE.exists() else "unknown"

app = FastAPI(title="Neurocare STT Backend")

# 웹앱(브라우저)이 Vercel을 거치지 않고 이 서버를 직접 호출할 수 있어야 STT/TTS 왕복이
# 한 홉 줄어든다(Vercel<->GPU 프록시 왕복 제거) - 네이티브 쉘은 이미 직접 호출 중이라
# CORS 제약이 없었지만, 브라우저는 이 허용 목록에 없으면 막힌다.
# GET도 허용해야 한다 - 발화 시작 시점에 연결을 미리 데우는 /health ping(hooks/useVAD.ts의
# preconnectBackend)이 GET인데 여기 POST만 있어서 매번 preflight가 막혀 콘솔에 CORS 오류가
# 쌓이고 있었다(실사용 로그로 확인: "HTTP 400: .../health" + CORS 차단 메시지 반복).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://neuro-care-sand.vercel.app"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# GPU(A100)에서 float16으로 돌린다 - CPU/int8 대비 전사 지연이 크게 줄어든다.
# large-v3는 small보다 훨씬 정확한 한국어 인식을 하는데, A100에서는 지연 비용이
# 거의 안 든다(VRAM도 80GB라 넉넉함) - 정확도 요구사항 때문에 큰 모델을 그대로 쓴다.
model = WhisperModel("large-v3", device="cuda", compute_type="float16")

# 마이크로소프트의 최신 세대 "멀티링구얼" 계열 음성 - 기존 단일 언어 Neural 세대보다
# 억양이 더 자연스럽다. 이 서버에서 지원되는 한국어 음성 중 여성은 SunHi 하나뿐이라,
# 더 자연스러운 쪽을 택하면서 성별이 남성으로 바뀌었다(사용자 확인 후 결정).
DEFAULT_TTS_VOICE = "ko-KR-HyunsuMultilingualNeural"


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None

# whisper는 사투리를 켜고 끄는 설정이 따로 없다 - 표준어 위주로 학습돼 방언 억양은
# 원래 인식률이 떨어진다. initial_prompt로 방언 어휘를 미리 보여주면 디코딩이 그
# 쪽으로 살짝 유도되긴 하지만, 억양이 강한 경우엔 이것만으론 한계가 뚜렷하다 -
# 근본적으로 개선하려면 방언 데이터로 파인튜닝하거나 방언 특화 STT로 바꿔야 한다.
_DIALECT_PROMPT = (
    "아이고, 뭐하노, 그카지 마라, 어데 가노, 밥 뭇나, 그랬당께, 워쩌까, "
    "혔어, 겁나, 어서 옵서예, 이추룩, 게메마씀, 그려, 워째, 뭐여"
)

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


def _run_transcription(audio: io.BytesIO | np.ndarray, vad_filter: bool = True) -> tuple[str, float]:
    """공용 전사 로직. /transcribe(파일 업로드)와 /ws/transcribe(스트리밍)가 함께 쓴다.
    (전사 텍스트, 오디오 길이초)를 돌려준다."""
    segments, info = model.transcribe(
        audio,
        language="ko",
        vad_filter=vad_filter,
        vad_parameters=dict(min_silence_duration_ms=300),
        initial_prompt=_DIALECT_PROMPT,
        # 기본값 5(후보 5갈래 탐색)는 정확도 대비 디코딩 시간이 크게 늘어나 1(greedy)로
        # 낮췄었는데, LLM 쪽 reasoning_effort 오설정을 고치면서(app/api/chat/route.ts)
        # 그쪽 지연이 크게 줄어 여유가 생겼다 - "속도는 유지하면서 정확도도 올려달라"는
        # 요청에 맞춰 greedy보다 후보를 더 보는 3으로 절충한다. A100에서는 이 정도
        # 오디오 길이(짧은 발화 1개)에 beam_size 1↔3 차이가 체감 지연에는 거의 안
        # 보이면서 오인식은 줄어드는 게 일반적이다.
        beam_size=3,
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
    return text, info.duration


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "build": _build_info}


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
        # 클라이언트가 이미 VAD로 발화 구간만 잘라 보내지만, 마이크 주변 TV 소리 같은
        # 잡음이 섞여 들어온 경우를 대비해 whisper 자체 VAD로 한 번 더 걸러낸다.
        text, duration = _run_transcription(io.BytesIO(audio_bytes), vad_filter=True)
    except Exception as exc:  # noqa: BLE001 - 클라이언트가 원인을 알 수 있게 그대로 전달
        logger.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"transcription failed: {exc}") from exc

    return {
        "text": text,
        "language": "ko",
        "duration": duration,
        "speaker_similarity": similarity,
    }


# WebSocket 스트리밍 전사 프로토콜 (실험 단계 - 클라이언트 통합 전 서버 단독 테스트용):
#   클라이언트 -> 서버
#     binary frame: 16kHz mono 16-bit PCM little-endian 오디오 조각
#     text frame {"type": "start"}: 새 발화 시작, 버퍼 비움
#     text frame {"type": "end"}: 발화 종료, 지금까지 쌓인 오디오로 최종 전사 1회 후 버퍼 비움
#   서버 -> 클라이언트
#     {"type": "partial", "text": "..."}: 아직 말하는 중, 지금까지 들은 걸 다시 통째로 재전사한 결과
#     {"type": "final", "text": "..."}: "end" 신호에 대한 확정 결과
#     {"type": "error", "detail": "..."}
_WS_SAMPLE_RATE = 16000
# 새 오디오가 이만큼 쌓일 때마다 재전사한다 - 너무 짧으면 GPU에 과부하, 너무 길면 실시간성이 떨어진다.
_WS_PARTIAL_INTERVAL_SAMPLES = int(_WS_SAMPLE_RATE * 1.0)


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    buffer = np.zeros(0, dtype=np.float32)
    last_partial_at = 0

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if (text_data := message.get("text")) is not None:
                try:
                    payload = json.loads(text_data)
                except ValueError:
                    continue

                if payload.get("type") == "start":
                    buffer = np.zeros(0, dtype=np.float32)
                    last_partial_at = 0
                elif payload.get("type") == "end":
                    if buffer.size > 0:
                        try:
                            text, _ = _run_transcription(buffer, vad_filter=False)
                        except Exception as exc:  # noqa: BLE001
                            logger.exception("streaming final transcription failed")
                            await websocket.send_json({"type": "error", "detail": str(exc)})
                        else:
                            await websocket.send_json({"type": "final", "text": text})
                    buffer = np.zeros(0, dtype=np.float32)
                    last_partial_at = 0
                continue

            if (binary_data := message.get("bytes")) is None:
                continue

            chunk = np.frombuffer(binary_data, dtype=np.int16).astype(np.float32) / 32768.0
            buffer = np.concatenate([buffer, chunk])

            new_samples = buffer.size - last_partial_at
            if new_samples < _WS_PARTIAL_INTERVAL_SAMPLES:
                continue
            last_partial_at = buffer.size

            try:
                # 아직 발화 중인 짧은/불완전한 버퍼라 whisper 자체 VAD가 꼬리를 잘라먹기
                # 쉽다 - partial 구간에서는 끈다(최종 결과는 end에서 vad 없이 다시 돈다).
                text, _ = _run_transcription(buffer, vad_filter=False)
            except Exception as exc:  # noqa: BLE001
                logger.exception("streaming partial transcription failed")
                await websocket.send_json({"type": "error", "detail": str(exc)})
                continue

            await websocket.send_json({"type": "partial", "text": text})
    except WebSocketDisconnect:
        pass


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
