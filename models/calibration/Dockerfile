# Build context: this Dockerfile REQUIRES a repo-root build context.
# It does `COPY models/shared/ ...`, so build from the repo root, e.g.:
#   docker build -f models/calibration/Dockerfile .
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and image operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY models/shared/ /app/shared/
COPY models/calibration/worker.py /app/worker.py

RUN pip install --no-cache-dir numpy scipy opencv-python-headless

ENV PYTHONPATH=/app/shared

ENTRYPOINT ["python", "/app/worker.py"]
