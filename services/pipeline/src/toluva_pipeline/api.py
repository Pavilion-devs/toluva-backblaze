"""FastAPI boundary for policy checks and pipeline operations."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from importlib.metadata import version
from pathlib import Path
from shutil import which

from fastapi import FastAPI
from pydantic import BaseModel, Field

from toluva_pipeline.domain.authorization import (
    AuthorizationRequest,
    VoiceAuthorization,
    VoiceType,
    evaluate_authorization,
)
from toluva_pipeline.domain.timing import (
    TimingPolicy,
    decide_timing_action,
    measure_timing,
)
from toluva_pipeline.provenance import run_local_provenance_spike
from toluva_pipeline.settings import Settings

app = FastAPI(
    title="Toluva Pipeline",
    version="0.1.0",
    description="Authorization-first localization pipeline service.",
)


class AuthorizationRecordBody(BaseModel):
    authorization_id: str
    speaker_id: str
    voice_profile_id: str
    voice_type: VoiceType
    evidence_asset_id: str
    evidence_sha256: str
    allowed_languages: list[str]
    allowed_purposes: list[str]
    valid_from: datetime
    expires_at: datetime
    approved_by: str
    approved_at: datetime
    revoked_at: datetime | None = None


class AuthorizationRequestBody(BaseModel):
    authorization: AuthorizationRecordBody | None
    voice_profile_id: str
    language: str
    purpose: str
    requested_at: datetime


class TimingRequestBody(BaseModel):
    source_start_seconds: float
    source_end_seconds: float
    generated_seconds: float
    attempt_number: int = Field(ge=1)


@app.get("/health")
def health() -> dict[str, object]:
    settings = Settings.from_env()
    return {
        "status": "ok",
        "service": "toluva-pipeline",
        "versions": {
            "genblaze-core": version("genblaze-core"),
            "genblaze-s3": version("genblaze-s3"),
            "genblaze-elevenlabs": version("genblaze-elevenlabs"),
        },
        "media_tools": {
            "ffmpeg": which("ffmpeg") is not None,
            "ffprobe": which("ffprobe") is not None,
        },
        "credentials": settings.readiness(),
    }


@app.post("/v1/authorization/check")
def authorization_check(body: AuthorizationRequestBody) -> dict[str, object]:
    authorization = None
    if body.authorization is not None:
        authorization_data = body.authorization.model_dump()
        authorization_data["allowed_languages"] = tuple(
            body.authorization.allowed_languages
        )
        authorization_data["allowed_purposes"] = tuple(
            body.authorization.allowed_purposes
        )
        authorization = VoiceAuthorization(**authorization_data)
    decision = evaluate_authorization(
        authorization,
        AuthorizationRequest(
            voice_profile_id=body.voice_profile_id,
            language=body.language,
            purpose=body.purpose,
            requested_at=body.requested_at,
        ),
    )
    return asdict(decision)


@app.post("/v1/timing/evaluate")
def timing_evaluate(body: TimingRequestBody) -> dict[str, object]:
    settings = Settings.from_env()
    policy = TimingPolicy(
        green_threshold=settings.green_drift_threshold,
        amber_threshold=settings.amber_drift_threshold,
        max_retries=settings.max_timing_retries,
    )
    measurement = measure_timing(
        body.source_start_seconds,
        body.source_end_seconds,
        body.generated_seconds,
        policy=policy,
    )
    decision = decide_timing_action(
        measurement,
        attempt_number=body.attempt_number,
        policy=policy,
    )
    return asdict(decision)


@app.post("/v1/spikes/local-provenance")
def local_provenance() -> dict[str, object]:
    settings = Settings.from_env()
    return run_local_provenance_spike(Path(settings.work_dir)).to_dict()
