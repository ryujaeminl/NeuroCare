"""화자 인식(speaker verification).

VAD와 음량 게이트만으로는 "사람 목소리인지"와 "얼마나 가까운지"만 알 수 있고,
그게 *등록된 본인*인지는 알 수 없다. 여기서는 resemblyzer로 성문(voiceprint)을 뽑아
등록된 성문과 코사인 유사도를 비교해 본인 발화만 통과시킨다.
"""

from __future__ import annotations

import io
import logging
import os
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

_encoder = None


def _get_encoder():
    """VoiceEncoder는 로딩 비용이 있으므로 처음 쓸 때 한 번만 만든다."""
    global _encoder
    if _encoder is None:
        from resemblyzer import VoiceEncoder

        _encoder = VoiceEncoder("cpu")
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


def _embed(audio_bytes: bytes) -> np.ndarray:
    wav = _decode_wav(audio_bytes)
    return _get_encoder().embed_utterance(wav)


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

    denominator = float(np.linalg.norm(reference) * np.linalg.norm(candidate))
    if denominator == 0.0:
        return 0.0
    return float(np.dot(reference, candidate) / denominator)
