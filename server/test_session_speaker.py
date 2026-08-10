"""세션 스코프 화자 필터(speaker.check_session_speaker)의 상태 전이만 빠르게 검증한다.
resemblyzer/torch를 실제로 로드하지 않도록 embed_with_duration을 가짜로 바꿔치기한다.
실행: python server/test_session_speaker.py
"""

from __future__ import annotations

import numpy as np

import speaker


def fake_embed(vector: list[float], duration: float):
    def _embed(_audio_bytes: bytes):
        return np.array(vector, dtype=np.float32), duration

    return _embed


def fake_encoder(vector: list[float]):
    """check_session_speaker_array(스트리밍 경로)는 _get_encoder().embed_utterance(wav)를
    직접 부른다 - embed_with_duration을 거치지 않으므로 인코더 자체를 바꿔치기한다."""

    class _FakeEncoder:
        def embed_utterance(self, _wav: np.ndarray) -> np.ndarray:
            return np.array(vector, dtype=np.float32)

    return _FakeEncoder()


def seconds_of_silence(seconds: float) -> np.ndarray:
    return np.zeros(int(speaker.SAMPLE_RATE * seconds), dtype=np.float32)


def reset():
    speaker._session_speakers.clear()


def test_short_first_utterance_does_not_register():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=0.5)  # MIN보다 짧음
    result = speaker.check_session_speaker("s1", b"whatever")
    assert result is None, "짧은 첫 발화는 등록도, 비교도 안 되고 그냥 통과해야 한다"
    assert "s1" not in speaker._session_speakers, "짧은 발화는 기준으로 저장되면 안 된다"


def test_long_first_utterance_registers_and_passes():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=2.0)
    result = speaker.check_session_speaker("s1", b"whatever")
    assert result is None, "첫 등록 발화는 비교 대상이 없어 None(통과)이어야 한다"
    assert "s1" in speaker._session_speakers, "충분히 긴 첫 발화는 기준으로 등록돼야 한다"


def test_same_voice_high_similarity():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=2.0)
    speaker.check_session_speaker("s1", b"first")
    speaker.embed_with_duration = fake_embed([1.0, 0.0001], duration=2.0)  # 거의 같은 방향
    similarity = speaker.check_session_speaker("s1", b"second")
    assert similarity is not None and similarity > 0.99, f"같은 목소리는 유사도가 높아야 한다: {similarity}"


def test_different_voice_low_similarity():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=2.0)
    speaker.check_session_speaker("s1", b"first")
    speaker.embed_with_duration = fake_embed([0.0, 1.0], duration=2.0)  # 완전히 다른 방향(직교)
    similarity = speaker.check_session_speaker("s1", b"second")
    assert similarity is not None and similarity < speaker.SESSION_SIMILARITY_THRESHOLD, (
        f"다른 목소리는 임계값 밑이어야 한다: {similarity}"
    )


def test_sessions_are_independent():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=2.0)
    speaker.check_session_speaker("s1", b"first")
    # s2는 별개 세션이라 s1의 기준과 무관하게 첫 발화로 등록돼야 한다.
    speaker.embed_with_duration = fake_embed([0.0, 1.0], duration=2.0)
    result = speaker.check_session_speaker("s2", b"first")
    assert result is None, "다른 세션은 서로의 기준에 영향을 주면 안 된다"


def test_stale_sessions_are_pruned():
    reset()
    speaker.embed_with_duration = fake_embed([1.0, 0.0], duration=2.0)
    speaker.check_session_speaker("s1", b"first", now=1000.0)
    far_future = 1000.0 + speaker._SESSION_TTL_SECONDS + 1
    speaker.check_session_speaker("s2", b"first", now=far_future)
    assert "s1" not in speaker._session_speakers, "TTL을 넘긴 세션은 정리돼야 한다"


def test_array_variant_short_first_utterance_does_not_register():
    reset()
    speaker._get_encoder = lambda: fake_encoder([1.0, 0.0])
    result = speaker.check_session_speaker_array("s1", seconds_of_silence(0.5))
    assert result is None, "배열 버전도 짧은 첫 발화는 등록 없이 통과해야 한다"
    assert "s1" not in speaker._session_speakers


def test_array_variant_same_voice_high_similarity():
    reset()
    speaker._get_encoder = lambda: fake_encoder([1.0, 0.0])
    speaker.check_session_speaker_array("s1", seconds_of_silence(2.0))
    speaker._get_encoder = lambda: fake_encoder([1.0, 0.0001])
    similarity = speaker.check_session_speaker_array("s1", seconds_of_silence(2.0))
    assert similarity is not None and similarity > 0.99, f"배열 버전도 같은 목소리는 유사도가 높아야 한다: {similarity}"


def test_array_variant_different_voice_low_similarity():
    reset()
    speaker._get_encoder = lambda: fake_encoder([1.0, 0.0])
    speaker.check_session_speaker_array("s1", seconds_of_silence(2.0))
    speaker._get_encoder = lambda: fake_encoder([0.0, 1.0])
    similarity = speaker.check_session_speaker_array("s1", seconds_of_silence(2.0))
    assert similarity is not None and similarity < speaker.SESSION_SIMILARITY_THRESHOLD, (
        f"배열 버전도 다른 목소리는 임계값 밑이어야 한다: {similarity}"
    )


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
    print("all session speaker checks passed")
