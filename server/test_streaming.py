"""/ws/transcribe 엔드포인트 독립 테스트. 앱 클라이언트를 건드리지 않고 서버 로직만 검증한다.

edge-tts로 문장을 합성 -> PCM16 16kHz mono로 디코드 -> 실시간 발화를 흉내 내며
작은 조각으로 나눠 WebSocket에 스트리밍 전송 -> partial/final 응답을 출력한다.

사용법(컨테이너 안에서 실행 - 의존성이 이미 다 있다):
    docker exec -it neurocare-stt python test_streaming.py
"""

import asyncio
import io

import av
import edge_tts
import numpy as np
import websockets

TEST_SENTENCE = "안녕하세요. 오늘 날씨가 참 좋네요. 산책하기 좋은 날인 것 같아요."
CHUNK_MS = 200  # 실시간 스트리밍을 흉내 내기 위해 이만큼씩 잘라 보낸다.
SAMPLE_RATE = 16000


async def synthesize_pcm16(text: str) -> bytes:
    """edge-tts로 mp3를 만들고 av로 16kHz mono PCM16으로 디코드한다."""
    mp3_bytes = bytearray()
    communicate = edge_tts.Communicate(text, voice="ko-KR-SunHiNeural")
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_bytes.extend(chunk["data"])

    container = av.open(io.BytesIO(bytes(mp3_bytes)))
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    pcm = bytearray()
    for frame in container.decode(audio=0):
        for resampled in resampler.resample(frame):
            pcm.extend(bytes(resampled.planes[0]))
    return bytes(pcm)


async def main() -> None:
    print(f"테스트 문장: {TEST_SENTENCE!r}")
    print("음성 합성 중...")
    pcm = await synthesize_pcm16(TEST_SENTENCE)
    duration_s = len(pcm) / 2 / SAMPLE_RATE
    print(f"PCM16 준비 완료: {len(pcm)} bytes (~{duration_s:.1f}초)")

    bytes_per_chunk = int(SAMPLE_RATE * 2 * (CHUNK_MS / 1000))

    uri = "ws://localhost:8000/ws/transcribe"
    print(f"연결: {uri}")
    async with websockets.connect(uri) as ws:
        async def receiver():
            async for message in ws:
                print(f"  <- {message}")

        recv_task = asyncio.create_task(receiver())

        await ws.send('{"type": "start"}')
        for offset in range(0, len(pcm), bytes_per_chunk):
            await ws.send(pcm[offset : offset + bytes_per_chunk])
            await asyncio.sleep(CHUNK_MS / 1000)  # 실제 말하는 속도를 흉내 낸다.

        await ws.send('{"type": "end"}')
        await asyncio.sleep(3)  # 마지막 partial/final 응답을 받을 시간을 준다.
        recv_task.cancel()

    print("완료")


if __name__ == "__main__":
    asyncio.run(main())
