FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-speaker.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --no-deps -r requirements-speaker.txt

COPY . .

# 빌드 시점에 whisper 모델을 내려받아 이미지에 캐시한다 - 안 하면 배포/재시작마다
# 컨테이너가 뜰 때 HuggingFace에서 다시 받아와 첫 요청이 한참 느려진다.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
