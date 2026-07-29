# syntax=docker/dockerfile:1.7

FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

ARG UV_VERSION=0.11.12
ARG ARGOS_MODEL_URL=https://argos-net.com/v1/translate-en_de-1_3.argosmodel
ARG ARGOS_ARCHIVE_SHA256=6cd847f0c06c9c66013e6b0932e07fd54a6d90894659c02bf6c5247b72fb25b1
ARG ARGOS_MODEL_SHA256=c29ca0fe955386c79197d0fce05b9cec0fa68953e41254a27ca654ee0dfb175a
ARG WHISPER_REVISION=88b03866a4066bb4a97c12258abb82b1e9af0121
ARG WHISPER_MODEL_SHA256=2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TOLUVA_WORK_DIR=/var/lib/toluva \
    PYTHONPATH=/app/services/pipeline/src \
    PATH=/app/services/pipeline/.venv/bin:$PATH \
    ARGOS_PACKAGES_DIR=/var/lib/toluva/models/argos/packages \
    XDG_DATA_HOME=/var/lib/toluva/models/argos/data \
    XDG_CONFIG_HOME=/var/lib/toluva/models/argos/config \
    XDG_CACHE_HOME=/var/lib/toluva/models/argos/cache \
    HF_HOME=/var/lib/toluva/models/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        libgomp1 \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "uv==${UV_VERSION}"

COPY services/pipeline/pyproject.toml services/pipeline/uv.lock \
    /app/services/pipeline/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync \
    --frozen \
    --no-dev \
    --project /app/services/pipeline

RUN mkdir -p \
        "${ARGOS_PACKAGES_DIR}" \
        "${XDG_DATA_HOME}" \
        "${XDG_CONFIG_HOME}" \
        "${XDG_CACHE_HOME}" \
        /var/lib/toluva/models/whisper/base-en \
    && curl \
        --fail \
        --location \
        --silent \
        --show-error \
        "${ARGOS_MODEL_URL}" \
        --output /tmp/translate-en_de-1_3.argosmodel \
    && echo \
        "${ARGOS_ARCHIVE_SHA256}  /tmp/translate-en_de-1_3.argosmodel" \
        | sha256sum --check --strict \
    && python -c \
        "from pathlib import Path; from argostranslate.package import install_from_path; install_from_path(Path('/tmp/translate-en_de-1_3.argosmodel'))" \
    && echo \
        "${ARGOS_MODEL_SHA256}  ${ARGOS_PACKAGES_DIR}/translate-en_de-1_3/model/model.bin" \
        | sha256sum --check --strict \
    && rm /tmp/translate-en_de-1_3.argosmodel

RUN hf download \
        Systran/faster-whisper-base.en \
        --revision "${WHISPER_REVISION}" \
        --local-dir /var/lib/toluva/models/whisper/base-en \
    && echo \
        "${WHISPER_MODEL_SHA256}  /var/lib/toluva/models/whisper/base-en/model.bin" \
        | sha256sum --check --strict \
    && rm -rf /var/lib/toluva/models/whisper/base-en/.cache

COPY services/pipeline/src /app/services/pipeline/src

RUN groupadd --gid 10001 toluva \
    && useradd \
        --create-home \
        --gid 10001 \
        --no-log-init \
        --uid 10001 \
        toluva \
    && chown -R toluva:toluva /var/lib/toluva

USER 10001:10001

HEALTHCHECK --interval=60s --timeout=15s --start-period=15s --retries=3 \
    CMD ["python", "-m", "toluva_pipeline.worker", "--check"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "toluva_pipeline.worker"]
