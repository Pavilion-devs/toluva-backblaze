"""Credential-free Genblaze provenance spike with real local media bytes."""

from __future__ import annotations

import hashlib
import json
import math
import struct
import wave
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from genblaze_core import Asset, AudioMetadata, Modality, Pipeline
from genblaze_core.mocks import MockAudioProvider

from toluva_pipeline.domain.authorization import (
    AuthorizationRequest,
    VoiceAuthorization,
    VoiceType,
    authorize_or_raise,
)
from toluva_pipeline.domain.timing import (
    TimingPolicy,
    decide_timing_action,
    measure_timing,
)


@dataclass(frozen=True)
class ProvenanceReport:
    run_id: str
    run_status: str
    manifest_path: str
    manifest_hash: str
    manifest_hash_valid: bool
    manifest_integrity_valid: bool
    asset_hash_valid: bool
    authorization_code: str
    timing_band: str
    timing_action: str
    provider: str
    model: str
    live_provider: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _write_fixture_wav(path: Path, duration_seconds: float = 1.0) -> bytes:
    """Write a deterministic mono WAV so the spike verifies actual bytes."""

    sample_rate = 16_000
    frame_count = round(sample_rate * duration_seconds)
    amplitude = 4_096
    frequency = 440.0
    frames = bytearray()
    for index in range(frame_count):
        sample = round(
            amplitude * math.sin(2 * math.pi * frequency * index / sample_rate)
        )
        frames.extend(struct.pack("<h", sample))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(frames)
    return path.read_bytes()


def verify_local_asset_bytes(asset: Asset) -> bool:
    """Verify the bytes referenced by a local file URL against the asset hash."""

    parsed = urlparse(asset.url)
    if parsed.scheme != "file" or not asset.sha256:
        return False
    path = Path(unquote(parsed.path))
    if not path.is_file():
        return False
    return hashlib.sha256(path.read_bytes()).hexdigest() == asset.sha256


def run_local_provenance_spike(work_dir: Path) -> ProvenanceReport:
    """Run the policy gate, timing measurement, and Genblaze manifest locally."""

    now = datetime.now(UTC)
    authorization = VoiceAuthorization(
        authorization_id="auth-local-spike",
        speaker_id="speaker-local",
        voice_profile_id="voice-local",
        voice_type=VoiceType.CLONED,
        evidence_asset_id="evidence-local",
        evidence_sha256="a" * 64,
        allowed_languages=("de-DE",),
        allowed_purposes=("internal-training",),
        valid_from=now - timedelta(days=1),
        expires_at=now + timedelta(days=30),
        approved_by="local-spike",
        approved_at=now - timedelta(days=1),
    )
    authorization_decision = authorize_or_raise(
        authorization,
        AuthorizationRequest(
            voice_profile_id="voice-local",
            language="de-DE",
            purpose="internal-training",
            requested_at=now,
        ),
    )

    timing_policy = TimingPolicy()
    timing = measure_timing(0.0, 1.0, 1.0, policy=timing_policy)
    timing_decision = decide_timing_action(
        timing,
        attempt_number=1,
        policy=timing_policy,
    )

    fixture_path = (work_dir / "fixture" / "authorized-tone.wav").resolve()
    fixture_bytes = _write_fixture_wav(fixture_path)
    asset = Asset(
        url=fixture_path.as_uri(),
        media_type="audio/wav",
        duration=1.0,
        audio=AudioMetadata(
            codec="pcm_s16le",
            channels=1,
            sample_rate=16_000,
            bitrate=256_000,
        ),
        metadata={
            "audio_type": "speech-fixture",
            "synthetic": True,
            "disclosure": "Prepared local test tone; no human voice is present.",
        },
    )
    asset.set_hash(fixture_bytes)

    result = (
        Pipeline(
            "toluva-local-provenance",
            tenant_id="toluva-demo",
            project_id="local-spike",
        )
        .step(
            MockAudioProvider(assets=[asset]),
            model="mock-authorized-audio-v1",
            prompt="Credential-free Toluva provenance verification.",
            modality=Modality.AUDIO,
            metadata={
                "authorization_id": authorization.authorization_id,
                "authorization_code": authorization_decision.code.value,
                "purpose": "internal-training",
                "language": "de-DE",
                "timing_band": timing.band.value,
                "timing_action": timing_decision.action.value,
            },
        )
        .run(raise_on_failure=True)
    )

    run_dir = work_dir / "runs" / result.run.run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(
        result.manifest.to_canonical_json() + "\n",
        encoding="utf-8",
    )

    output_asset = result.run.steps[0].assets[0]
    report = ProvenanceReport(
        run_id=result.run.run_id,
        run_status=result.run.status.value,
        manifest_path=str(manifest_path.resolve()),
        manifest_hash=result.manifest.canonical_hash,
        manifest_hash_valid=result.manifest.verify_hash(),
        manifest_integrity_valid=result.manifest.verify(),
        asset_hash_valid=verify_local_asset_bytes(output_asset),
        authorization_code=authorization_decision.code.value,
        timing_band=timing.band.value,
        timing_action=timing_decision.action.value,
        provider=result.run.steps[0].provider,
        model=result.run.steps[0].model,
        live_provider=False,
    )
    (run_dir / "report.json").write_text(
        json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report
