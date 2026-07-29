FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-speaker.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --no-deps -r requirements-speaker.txt \
    && pip install --no-cache-dir nvidia-cublas-cu12 nvidia-cudnn-cu12==9.*

COPY . .

# 빌드 시점에 whisper 모델을 내려받아 이미지에 캐시한다 - 안 하면 배포/재시작마다
# 컨테이너가 뜰 때 HuggingFace에서 다시 받아와 첫 요청이 한참 느려진다.
# 빌드 컨테이너엔 GPU가 안 보이므로 여기선 cpu로만 받아둔다(가중치 파일은 device 무관하게
# 캐시됨) - 실제 로딩은 main.py가 런타임에 cuda로 한다.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8')"

# ctranslate2(faster-whisper 내부 엔진)가 GPU에서 쓸 cuBLAS/cuDNN 공유 라이브러리 경로.
ENV LD_LIBRARY_PATH="/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib"

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
