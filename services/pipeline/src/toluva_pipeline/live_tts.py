"""Small, explicit, billable Genblaze ElevenLabs integration spike."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from genblaze_core import Modality, Pipeline
from genblaze_elevenlabs import ElevenLabsTTSProvider

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
from toluva_pipeline.media import probe_duration
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import (
    CredentialConfigurationError,
    build_b2_storage,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys

DEFAULT_STOCK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_MODEL = "eleven_flash_v2_5"
DEFAULT_TEXT = "Willkommen bei Toluva. Eine Botschaft, viele Sprachen."


@dataclass(frozen=True)
class LiveTTSReport:
    run_id: str
    run_status: str
    provider: str
    model: str
    voice_type: str
    language: str
    generated_characters: int
    generated_seconds: float
    target_seconds: float
    drift_ratio: float
    timing_band: str
    timing_action: str
    word_timing_count: int
    authorization_code: str
    authorization_record_key: str
    audio_key: str
    manifest_key: str
    qa_report_key: str
    manifest_hash: str
    stored_manifest_valid: bool
    stored_manifest_hash_matches: bool
    stored_asset_hash_matches: bool
    live_provider: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def run_live_tts_spike(
    settings: Settings,
    *,
    text: str = DEFAULT_TEXT,
    target_seconds: float = 4.0,
) -> LiveTTSReport:
    """Generate one short stock-voice sample, store it in B2, and verify it."""

    if not settings.elevenlabs_ready:
        raise CredentialConfigurationError("ELEVENLABS_API_KEY is not configured")
    if not settings.b2_ready:
        raise CredentialConfigurationError("Backblaze B2 is not configured")
    if not text.strip():
        raise ValueError("text must not be empty")

    now = datetime.now(UTC)
    project_id = "spike-project"
    job_id = f"tts-{now:%Y%m%d-%H%M%S}"
    language = "de-DE"
    scope = StorageScope(project_id, job_id, language)
    keys = ToluvaObjectKeys(project_id)
    storage = build_b2_storage(settings, scope, preflight=True)

    evidence = (
        b"Toluva integration spike approval: use the configured ElevenLabs "
        b"stock voice for a short German internal-training test."
    )
    evidence_sha256 = hashlib.sha256(evidence).hexdigest()
    authorization = VoiceAuthorization(
        authorization_id="auth-stock-smoke",
        speaker_id="elevenlabs-stock-voice",
        voice_profile_id=DEFAULT_STOCK_VOICE_ID,
        voice_type=VoiceType.STOCK,
        evidence_asset_id="stock-voice-policy",
        evidence_sha256=evidence_sha256,
        allowed_languages=(language,),
        allowed_purposes=("internal-training",),
        valid_from=now - timedelta(minutes=1),
        expires_at=now + timedelta(days=1),
        approved_by="toluva-spike-operator",
        approved_at=now,
    )
    authorization_decision = authorize_or_raise(
        authorization,
        AuthorizationRequest(
            voice_profile_id=DEFAULT_STOCK_VOICE_ID,
            language=language,
            purpose="internal-training",
            requested_at=now,
        ),
    )

    evidence_key = keys.authorization_evidence(
        authorization.authorization_id,
        authorization.evidence_asset_id,
        "txt",
    )
    authorization_key = keys.authorization_record(authorization.authorization_id)
    authorization_record = {
        **asdict(authorization),
        "voice_type": authorization.voice_type.value,
        "valid_from": authorization.valid_from.isoformat(),
        "expires_at": authorization.expires_at.isoformat(),
        "approved_at": authorization.approved_at.isoformat(),
        "revoked_at": None,
        "evidence_key": evidence_key,
        "disclosure": "Synthetic stock voice used for a Toluva integration spike.",
    }
    storage.backend.put(evidence_key, evidence, content_type="text/plain")
    storage.backend.put(
        authorization_key,
        json.dumps(authorization_record, sort_keys=True).encode("utf-8"),
        content_type="application/json",
    )

    report_dir = (settings.work_dir / "live-tts" / job_id).resolve()
    local_asset_urls: list[str] = []

    def capture_local_asset(event: object) -> None:
        step_event = getattr(event, "step", None)
        assets = getattr(step_event, "assets", None)
        if assets:
            local_asset_urls.append(assets[0].url)

    provider = ElevenLabsTTSProvider(
        api_key=settings.elevenlabs_api_key,
    )
    result = (
        Pipeline(
            "toluva-live-tts-spike",
            tenant_id="toluva-demo",
            project_id=project_id,
        )
        .step(
            provider,
            model=DEFAULT_MODEL,
            prompt=text,
            modality=Modality.AUDIO,
            expected_duration_sec=target_seconds,
            metadata={
                "authorization_id": authorization.authorization_id,
                "authorization_code": authorization_decision.code.value,
                "language": language,
                "purpose": "internal-training",
                "synthetic_voice": True,
                "voice_type": authorization.voice_type.value,
            },
            voice_id=DEFAULT_STOCK_VOICE_ID,
            language_code="de",
            with_timestamps=True,
            output_format="mp3_44100_128",
        )
        .run(
            sink=storage.sink,
            raise_on_failure=True,
            timeout=120,
            pipeline_timeout=180,
            max_retries=1,
            on_step_complete=capture_local_asset,
        )
    )

    step = result.run.steps[0]
    asset = step.assets[0]
    if not local_asset_urls:
        raise RuntimeError("Genblaze did not expose the local TTS asset")
    local_url = urlparse(local_asset_urls[0])
    if local_url.scheme != "file":
        raise RuntimeError("Expected the ElevenLabs adapter to return a local file")
    local_audio_path = Path(unquote(local_url.path))
    generated_seconds = probe_duration(local_audio_path)
    timing_policy = TimingPolicy(
        green_threshold=settings.green_drift_threshold,
        amber_threshold=settings.amber_drift_threshold,
        max_retries=settings.max_timing_retries,
    )
    measurement = measure_timing(
        0.0,
        target_seconds,
        generated_seconds,
        policy=timing_policy,
    )
    timing_decision = decide_timing_action(
        measurement,
        attempt_number=1,
        policy=timing_policy,
    )

    audio_key = storage.backend.key_from_url(asset.url)
    if audio_key is None:
        raise RuntimeError("Could not resolve the stored B2 audio key")
    stored_audio = storage.backend.get(audio_key)
    stored_asset_hash_matches = (
        asset.sha256 is not None
        and hashlib.sha256(stored_audio).hexdigest() == asset.sha256
    )
    stored_manifest = storage.sink.read_manifest(result.run, verify=True)

    word_timing_count = (
        len(asset.audio.word_timings)
        if asset.audio is not None and asset.audio.word_timings is not None
        else 0
    )
    qa_report_key = f"{scope.job_prefix}/reports/live-tts-spike.json"
    report = LiveTTSReport(
        run_id=result.run.run_id,
        run_status=result.run.status.value,
        provider=step.provider,
        model=step.model,
        voice_type=authorization.voice_type.value,
        language=language,
        generated_characters=len(text),
        generated_seconds=generated_seconds,
        target_seconds=target_seconds,
        drift_ratio=measurement.drift_ratio,
        timing_band=measurement.band.value,
        timing_action=timing_decision.action.value,
        word_timing_count=word_timing_count,
        authorization_code=authorization_decision.code.value,
        authorization_record_key=authorization_key,
        audio_key=audio_key,
        manifest_key=storage.sink.manifest_key_for(result.run),
        qa_report_key=qa_report_key,
        manifest_hash=result.manifest.canonical_hash,
        stored_manifest_valid=stored_manifest.verify(),
        stored_manifest_hash_matches=(
            stored_manifest.canonical_hash == result.manifest.canonical_hash
        ),
        stored_asset_hash_matches=stored_asset_hash_matches,
        live_provider=True,
    )
    report_bytes = (
        json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    storage.backend.put(
        qa_report_key,
        report_bytes,
        content_type="application/json",
    )
    report_dir.mkdir(parents=True, exist_ok=False)
    (report_dir / "report.json").write_bytes(report_bytes)
    return report
