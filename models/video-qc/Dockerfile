# Build context: this Dockerfile REQUIRES a repo-root build context.
# It does `COPY models/shared/ ...`, so build from the repo root, e.g.:
#   docker build -f models/video-qc/Dockerfile .
# Building from inside models/video-qc/ will fail (models/shared/ is outside it).
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and video decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY models/shared/ /app/shared/
COPY models/video-qc/worker.py /app/worker.py

ENV PYTHONPATH=/app/shared

ENTRYPOINT ["python", "/app/worker.py"]
