# Whisper GPU 추론 서비스

A100 서버에서 faster-whisper(large-v3)로 음성을 전사하는 별도 마이크로서비스입니다.
Next.js 앱(`app/api/transcribe/route.ts`)이 이 서비스를 HTTP로 호출합니다.

## 요구 사항

- NVIDIA GPU (A100) + 최신 드라이버
- CUDA 및 cuDNN (faster-whisper/CTranslate2가 요구하는 버전)
- Python 3.9+

## 실행 방법

```bash
cd whisper-service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --host 0.0.0.0 --port 8000
```

첫 요청 시 `large-v3` 모델(수 GB)을 자동으로 다운로드합니다.

## 환경변수 (선택)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `large-v3` | faster-whisper 모델 크기 |
| `WHISPER_DEVICE` | `cuda` | 추론 디바이스 |
| `WHISPER_COMPUTE_TYPE` | `float16` | 연산 정밀도 (속도 우선 시 `int8_float16`) |

## Next.js 쪽 설정

`neurocareapp/.env.local`에 이 서비스의 주소를 넣어주세요:

```
WHISPER_SERVICE_URL=http://<A100-서버-주소>:8000
```
