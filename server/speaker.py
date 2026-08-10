"""화자 인식(speaker verification).

VAD와 음량 게이트만으로는 "사람 목소리인지"와 "얼마나 가까운지"만 알 수 있고,
그게 *등록된 본인*인지는 알 수 없다. 여기서는 resemblyzer로 성문(voiceprint)을 뽑아
등록된 성문과 코사인 유사도를 비교해 본인 발화만 통과시킨다.
"""

from __future__ import annotations

import io
import logging
import os
import time
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger("neurocare-speaker")

VOICEPRINT_DIR = Path(__file__).parent / "voiceprints"

# resemblyzer 기준 동일 화자면 보통 0.75 이상이 나온다.
# 낮추면 남의 목소리가 통과하고, 높이면 본인도 거절당하므로 실사용 보며 조정한다.
SIMILARITY_THRESHOLD = float(os.environ.get("SPEAKER_SIMILARITY_THRESHOLD", "0.70"))
# ponytail: 호출어("복실아")만 반복해 만든 성문은 음소가 단조로워 타인 유사도가 0.69까지
# 올라온다(마진 0.01). 실사용에서 오인식이 보이면 /account의 8초 문장 낭독 등록을 쓰면 되고
# (그 성문이 기기 성문보다 우선 적용된다), 더 필요하면 통과한 대화로 성문을 갱신하는 방식으로 올린다.

# 성문을 만들기에 너무 짧은 오디오는 신뢰할 수 없다.
# 3초로 만든 성문은 타인 유사도가 0.69까지 올라와 임계값 0.70에 거의 붙었다.
# 5초로 올리면 마진이 확보된다. "복실아" 기준 3회 정도이고, 처음엔 반응이 없어
# 자연스럽게 여러 번 부르게 되므로 사용자가 등록 절차를 의식할 일은 없다.
MIN_ENROLL_SECONDS = 5.0
SAMPLE_RATE = 16000

# 안드로이드 웨이크워드 서비스가 "복실아"를 처음 부른 사람의 목소리를 등록하는 ID.
DEVICE_SPEAKER_ID = "device"

# 세션 스코프 화자 필터(main.py) - 사전 등록 없이 "이번 대화에서 처음 들린 목소리"를
# 그 세션의 기준으로 삼고, 이후 발화가 그 목소리와 다르면(TV/다른 가족 등) 걸러낸다.
# MIN_ENROLL_SECONDS(5초, 명시적 등록용)보다 훨씬 관대한 임계값/최소 길이를 쓴다 - 이건
# 사용자가 의식하지 못하는 사이에 자동으로 이뤄지는 약한 필터라, 너무 엄격하면 예전에
# 걷어낸 화자 인증과 같은 문제(짧은 음성이라 본인도 종종 거절됨)가 재현된다. 애매하면
# 통과시키는 쪽으로 기운다(fail-open) - 목표는 "확실히 다른 목소리"만 거르는 것.
SESSION_SIMILARITY_THRESHOLD = float(os.environ.get("SESSION_SPEAKER_SIMILARITY_THRESHOLD", "0.55"))
# 이보다 짧은 발화는 세션 기준 목소리로 등록하지 않는다(신뢰할 수 없음) - 다음 발화가
# 이 길이를 채울 때까지 계속 미등록 상태로 둔다.
MIN_SESSION_REFERENCE_SECONDS = 1.2

_encoder = None


def _get_encoder():
    """VoiceEncoder는 로딩 비용이 있으므로 처음 쓸 때 한 번만 만든다.
    GPU가 보이면 그쪽을 쓰고(매 턴 whisper 앞을 CPU로 순차 실행하던 게 지연의
    한 원인이었다), 없으면 CPU로 조용히 내려간다(로컬 개발 환경 등)."""
    global _encoder
    if _encoder is None:
        import torch
        from resemblyzer import VoiceEncoder

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _encoder = VoiceEncoder(device)
        logger.info("화자 인식 인코더 로딩 완료 (device=%s)", device)
    return _encoder


def _decode_wav(audio_bytes: bytes) -> np.ndarray:
    """WAV 바이트를 16kHz mono float32로 만든다."""
    data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)

    if sample_rate != SAMPLE_RATE:
        # 선형 보간 리샘플링. 성문 비교에는 이 정도 정밀도로 충분하다.
        target_length = int(len(mono) * SAMPLE_RATE / sample_rate)
        mono = np.interp(
            np.linspace(0, len(mono), target_length, endpoint=False),
            np.arange(len(mono)),
            mono,
        ).astype(np.float32)

    return mono


def _embed_with_duration(audio_bytes: bytes) -> tuple[np.ndarray, float]:
    wav = _decode_wav(audio_bytes)
    duration = len(wav) / SAMPLE_RATE
    return _get_encoder().embed_utterance(wav), duration


def _embed(audio_bytes: bytes) -> np.ndarray:
    return _embed_with_duration(audio_bytes)[0]


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator == 0.0:
        return 0.0
    return float(np.dot(a, b) / denominator)


def embed_with_duration(audio_bytes: bytes) -> tuple[np.ndarray, float]:
    """세션 스코프 화자 비교(main.py의 첫 발화 자동 등록)에서 저장 없이 바로 쓴다."""
    return _embed_with_duration(audio_bytes)


def _voiceprint_path(speaker_id: str) -> Path:
    # speaker_id는 그대로 파일명이 되므로 경로 조작(../)을 막는다.
    safe_id = "".join(ch for ch in speaker_id if ch.isalnum() or ch in "-_")
    if not safe_id:
        raise ValueError("speaker_id가 올바르지 않습니다")
    return VOICEPRINT_DIR / f"{safe_id}.npy"


def enroll(speaker_id: str, audio_bytes: bytes) -> float:
    """등록용 음성으로 성문을 저장하고, 등록에 쓴 길이(초)를 반환한다."""
    wav = _decode_wav(audio_bytes)
    duration = len(wav) / SAMPLE_RATE
    if duration < MIN_ENROLL_SECONDS:
        raise ValueError(f"등록에는 최소 {MIN_ENROLL_SECONDS:.0f}초 이상의 음성이 필요합니다")

    embedding = _get_encoder().embed_utterance(wav)
    VOICEPRINT_DIR.mkdir(parents=True, exist_ok=True)
    np.save(_voiceprint_path(speaker_id), embedding)
    logger.info("성문 등록 완료: %s (%.1f초)", speaker_id, duration)
    return duration


def has_voiceprint(speaker_id: str) -> bool:
    try:
        return _voiceprint_path(speaker_id).exists()
    except ValueError:
        return False


def delete_voiceprint(speaker_id: str) -> bool:
    """등록 해제. 개인정보 삭제 요청에 대응하기 위해 필요하다."""
    try:
        path = _voiceprint_path(speaker_id)
    except ValueError:
        return False
    if path.exists():
        path.unlink()
        return True
    return False


def _resolve_speaker_id(speaker_id: str) -> str | None:
    """
    웹은 로그인한 사용자 ID로, 안드로이드 웨이크워드 서비스는 기기 ID로 검증을 요청한다.
    태블릿 1대 = 환자 1명이므로, 사용자별 성문이 없으면 기기 성문으로 대신 검증한다.
    (호출어로 목소리를 등록해두면 웹 대화에도 같은 성문이 그대로 적용된다)
    """
    if has_voiceprint(speaker_id):
        return speaker_id
    if has_voiceprint(DEVICE_SPEAKER_ID):
        return DEVICE_SPEAKER_ID
    return None


def verify(speaker_id: str, audio_bytes: bytes) -> float | None:
    """등록된 성문과의 코사인 유사도를 반환한다. 성문이 없으면 None."""
    resolved = _resolve_speaker_id(speaker_id)
    if resolved is None:
        return None

    reference = np.load(_voiceprint_path(resolved))
    candidate = _embed(audio_bytes)
    return cosine_similarity(reference, candidate)


# 세션 스코프 화자 필터 - 사전 등록(enroll) 없이도 "이 대화에서 처음 들린 목소리"를
# 그 세션의 기준으로 삼고, 이후 발화가 크게 다르면(TV/다른 가족 등) 걸러낸다. 클라이언트가
# 앱을 새로 열 때마다 임의의 session_id를 만들어 보내므로, 서버 프로세스가 오래 떠 있는
# 동안 세션이 계속 쌓일 수 있다 - TTL을 두고 오래된 항목을 정리한다.
# ponytail: 단일 프로세스 in-memory 캐시라 여러 인스턴스로 수평 확장하면 세션별 기준이
# 인스턴스마다 따로 논다 - 이 서버는 GPU 서버 한 대에서만 돈다는 전제라 지금은 충분하다.
_SESSION_TTL_SECONDS = 60 * 60 * 2
_session_speakers: dict[str, tuple[np.ndarray, float]] = {}


def _prune_stale_sessions(now: float) -> None:
    cutoff = now - _SESSION_TTL_SECONDS
    stale = [sid for sid, (_, last_used) in _session_speakers.items() if last_used < cutoff]
    for sid in stale:
        del _session_speakers[sid]


def _match_session_speaker(session_id: str, embedding: np.ndarray, duration: float, now: float) -> float | None:
    """세션의 기준 목소리와 비교한다. 기준이 아직 없으면(첫 발화, 또는 그동안 너무 짧은
    발화만 있었음) 이번 발화로 등록을 시도하고 None을 반환한다(비교 대상이 없어 통과).
    기준이 있으면 유사도를 반환한다."""
    cached = _session_speakers.get(session_id)
    if cached is None:
        if duration >= MIN_SESSION_REFERENCE_SECONDS:
            _session_speakers[session_id] = (embedding, now)
            logger.info("세션 %s 기준 목소리 등록 (%.1f초)", session_id, duration)
        return None

    reference, _ = cached
    _session_speakers[session_id] = (reference, now)  # TTL 갱신
    return cosine_similarity(reference, embedding)


def check_session_speaker(session_id: str, audio_bytes: bytes, now: float | None = None) -> float | None:
    """바이트 입력 버전(HTTP 업로드 경로, main.py의 /transcribe용). now는 테스트에서
    시계를 주입하기 위한 것으로, 실제 호출에서는 생략하면 현재 시각을 쓴다."""
    now = now if now is not None else time.time()
    _prune_stale_sessions(now)
    embedding, duration = embed_with_duration(audio_bytes)
    return _match_session_speaker(session_id, embedding, duration, now)


def check_session_speaker_array(session_id: str, wav: np.ndarray, now: float | None = None) -> float | None:
    """이미 16kHz mono float32로 디코드된 오디오 배열 버전(스트리밍(/ws/transcribe) 경로용) -
    청크들을 이미 배열로 이어붙여 놨으므로, WAV로 다시 인코딩했다 디코드하는 왕복
    (check_session_speaker가 하는 일)을 건너뛴다."""
    now = now if now is not None else time.time()
    _prune_stale_sessions(now)
    duration = len(wav) / SAMPLE_RATE
    embedding = _get_encoder().embed_utterance(wav)
    return _match_session_speaker(session_id, embedding, duration, now)
