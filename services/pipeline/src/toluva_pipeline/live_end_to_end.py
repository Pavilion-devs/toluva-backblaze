"""Fixture-free English-to-German localization slice using real provider stages."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from genblaze_core import (
    Asset,
    AudioMetadata,
    KeyStrategy,
    Manifest,
    Modality,
    ObjectStorageSink,
    Pipeline,
    VideoMetadata,
)
from genblaze_core._utils import local_file_url

from toluva_pipeline.domain.authorization import (
    AuthorizationRequest,
    VoiceAuthorization,
    VoiceType,
    authorize_or_raise,
)
from toluva_pipeline.domain.correction import (
    ScriptedTranslationRewriter,
    TimingCorrectionEngine,
    TimingCorrectionRequest,
)
from toluva_pipeline.domain.timing import TimingPolicy
from toluva_pipeline.domain.transcript import TimedSegment, TimedTranscript, to_webvtt
from toluva_pipeline.domain.transcription import timed_transcript_from_scribe
from toluva_pipeline.live_timing_correction import (
    GenblazeElevenLabsAttemptGenerator,
)
from toluva_pipeline.live_tts import DEFAULT_MODEL, DEFAULT_STOCK_VOICE_ID
from toluva_pipeline.media import probe_duration, probe_media
from toluva_pipeline.providers.compositor import ToluvaFFmpegCompositor
from toluva_pipeline.providers.transcriber import FasterWhisperProvider
from toluva_pipeline.providers.translator import ArgosCTranslate2Provider
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import (
    CredentialConfigurationError,
    build_b2_storage,
)
from toluva_pipeline.storage.journal import B2CorrectionJournal
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable
from toluva_pipeline.storage.stages import B2StageJournal

E2E_PROJECT_ID = "live-localization-project"
E2E_JOB_ID = "english-to-german-v4"
E2E_LANGUAGE = "de-DE"
E2E_SOURCE_LANGUAGE = "eng"
E2E_SOURCE_SECONDS = 4.0
E2E_VERSION = "live-v1"
E2E_SOURCE_ASSET_ID = "system-voice-source-v2"
E2E_SOURCE_TEXT = "Welcome to Toluva. One message, many languages."
E2E_PROTECTED_TERMS = ("Toluva",)
E2E_AUTHORIZATION_ID = "auth-stock-live-v1"
ARGOS_MODEL = "translate-en_de-1_3"
WHISPER_MODEL = "whisper-base-en"
WHISPER_MODEL_REVISION = "88b03866a4066bb4a97c12258abb82b1e9af0121"


class EndToEndIntegrityError(RuntimeError):
    """Raised when a live input, manifest, or stored output cannot be verified."""


@dataclass(frozen=True)
class VerifiedPipelineAsset:
    asset_key: str
    asset_sha256: str
    manifest_key: str
    manifest_hash: str
    run_id: str
    stored_manifest_valid: bool
    stored_asset_hash_matches: bool
    bytes: bytes


@dataclass(frozen=True)
class LiveEndToEndReport:
    project_id: str
    job_id: str
    source_language: str
    target_language: str
    source_key: str
    source_record_key: str
    source_sha256: str
    source_duration_seconds: float
    transcription_provider: str
    transcription_model: str
    transcription_run_id: str
    transcription_asset_key: str
    transcription_manifest_key: str
    transcript_key: str
    segments_key: str
    segment_count: int
    detected_source_text: str
    translation_provider: str
    translation_model: str
    translation_run_id: str
    translation_asset_key: str
    translation_manifest_key: str
    translated_text: str
    protected_terms_preserved: bool
    authorization_code: str
    timing_status: str
    timing_band: str
    timing_action: str
    tts_attempt_count: int
    tts_generated_characters: int
    selected_speech_key: str
    selected_speech_manifest_key: str
    captions_key: str
    composition_run_id: str
    composition_manifest_key: str
    final_asset_key: str
    final_asset_sha256: str
    final_duration_seconds: float
    captions_embedded: bool
    disclosure_key: str
    final_record_key: str
    local_output_path: str
    resumed_completed_stages: tuple[str, ...]
    live_transcription: bool
    live_translation: bool
    live_tts: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

    def to_durable_dict(self) -> dict[str, object]:
        payload = self.to_dict()
        payload.pop("local_output_path", None)
        return payload


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_bytes(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _create_development_source(path: Path, *, temp_root: Path) -> None:
    """Create a real speech-bearing development source without model credits."""

    speech_path = temp_root / "source-voice.aiff"
    subprocess.run(
        [
            "say",
            "-v",
            "Alex",
            "-r",
            "190",
            "-o",
            str(speech_path),
            E2E_SOURCE_TEXT,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if probe_duration(speech_path) >= E2E_SOURCE_SECONDS:
        raise RuntimeError("Development source speech exceeds its target slot")
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x0B1716:s=1280x720:r=30:d={E2E_SOURCE_SECONDS:.6f}",
            "-i",
            str(speech_path),
            "-filter_complex",
            (
                "[1:a]adelay=250|250,"
                f"apad=whole_dur={E2E_SOURCE_SECONDS:.6f}[source_audio]"
            ),
            "-map",
            "0:v:0",
            "-map",
            "[source_audio]",
            "-vf",
            (
                "drawbox=x=0:y=0:w=iw:h=18:color=0xB9FF66:t=fill,"
                "drawbox=x=96:y=240:w=1088:h=240:color=0x173C37:t=fill"
            ),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-t",
            f"{E2E_SOURCE_SECONDS:.6f}",
            "-threads",
            "1",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            "-y",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _verified_pipeline_asset(
    *,
    result: object,
    sink: ObjectStorageSink,
    backend: object,
) -> VerifiedPipelineAsset:
    run = getattr(result, "run")
    manifest = getattr(result, "manifest")
    asset = run.steps[-1].assets[0]
    asset_key = backend.key_from_url(asset.url)
    if asset_key is None or asset.sha256 is None:
        raise EndToEndIntegrityError("Could not resolve stored pipeline asset")
    stored_bytes = backend.get(asset_key)
    asset_matches = _sha256(stored_bytes) == asset.sha256
    stored_manifest = sink.read_manifest(run, verify=True)
    manifest_valid = stored_manifest.verify()
    if (
        not asset_matches
        or not manifest_valid
        or stored_manifest.canonical_hash != manifest.canonical_hash
    ):
        raise EndToEndIntegrityError(
            "Stored pipeline manifest or asset hash verification failed"
        )
    return VerifiedPipelineAsset(
        asset_key=asset_key,
        asset_sha256=asset.sha256,
        manifest_key=sink.manifest_key_for(run),
        manifest_hash=manifest.canonical_hash,
        run_id=run.run_id,
        stored_manifest_valid=manifest_valid,
        stored_asset_hash_matches=asset_matches,
        bytes=stored_bytes,
    )


def _source_asset(path: Path, source_key: str) -> Asset:
    source_bytes = path.read_bytes()
    return Asset(
        url=local_file_url(path.resolve()),
        media_type="video/mp4",
        sha256=_sha256(source_bytes),
        size_bytes=len(source_bytes),
        width=1280,
        height=720,
        duration=probe_duration(path),
        video=VideoMetadata(
            frame_rate=30.0,
            codec="h264",
            resolution="1280x720",
            has_audio=True,
        ),
        metadata={
            "b2_key": source_key,
            "development_sample": True,
            "fixture_transcript": False,
        },
    )


def _selected_speech(summary: dict[str, object]) -> dict[str, object]:
    selected_number = summary["selected_attempt_number"]
    attempts = summary["attempts"]
    if not isinstance(attempts, (list, tuple)):
        raise EndToEndIntegrityError("Timing summary has no attempt list")
    selected = next(
        (
            item
            for item in attempts
            if isinstance(item, dict)
            and isinstance(item.get("context"), dict)
            and item["context"].get("attempt_number") == selected_number
        ),
        None,
    )
    if not isinstance(selected, dict) or not isinstance(selected.get("speech"), dict):
        raise EndToEndIntegrityError("Timing summary has no selected speech")
    return selected["speech"]


def _assert_speech_integrity(
    backend: object,
    speech: dict[str, object],
) -> bytes:
    audio_key = str(speech["audio_key"])
    manifest_key = str(speech["manifest_key"])
    audio_bytes = backend.get(audio_key)
    stored_manifest = Manifest.model_validate_json(backend.get(manifest_key))
    if not stored_manifest.verify():
        raise EndToEndIntegrityError("Selected speech manifest failed verification")
    audio_hash = _sha256(audio_bytes)
    if not any(
        asset.sha256 == audio_hash
        for step in stored_manifest.run.steps
        for asset in step.assets
    ):
        raise EndToEndIntegrityError(
            "Selected speech bytes do not match their manifest"
        )
    return audio_bytes


def _stream_types(path: Path) -> tuple[str, ...]:
    payload = probe_media(path)
    streams = payload.get("streams")
    if not isinstance(streams, list):
        raise EndToEndIntegrityError("Final media contains no streams")
    values = tuple(
        str(stream.get("codec_type", ""))
        for stream in streams
        if isinstance(stream, dict)
    )
    if not {"video", "audio", "subtitle"}.issubset(values):
        raise EndToEndIntegrityError(
            "Final media must contain video, audio, and subtitle streams"
        )
    return values


def _existing_report(
    settings: Settings,
    *,
    backend: object,
    final_record_key: str,
    job_id: str,
) -> LiveEndToEndReport | None:
    if not backend.exists(final_record_key):
        return None
    payload = json.loads(backend.get(final_record_key))
    if not isinstance(payload, dict):
        raise EndToEndIntegrityError("Stored final report is malformed")
    local_path = (
        settings.work_dir
        / "vertical-slice"
        / job_id
        / E2E_VERSION
        / "localized-de.mp4"
    ).resolve()
    payload["local_output_path"] = str(local_path)
    payload["resumed_completed_stages"] = tuple(
        sorted(
            set(payload.get("resumed_completed_stages", ()))
            | {"completed-job"}
        )
    )
    return LiveEndToEndReport(**payload)


def run_live_end_to_end(
    settings: Settings,
    *,
    job_id: str = E2E_JOB_ID,
) -> LiveEndToEndReport:
    """Run or safely reuse the first fixture-free localized video."""

    if not settings.elevenlabs_ready:
        raise CredentialConfigurationError("ELEVENLABS_API_KEY is not configured")
    if not settings.b2_ready:
        raise CredentialConfigurationError("Backblaze B2 is not configured")

    scope = StorageScope(E2E_PROJECT_ID, job_id, E2E_LANGUAGE)
    keys = ToluvaObjectKeys(E2E_PROJECT_ID)
    storage = build_b2_storage(settings, scope, preflight=True)
    final_record_key = keys.final_record(scope, E2E_VERSION)
    existing = _existing_report(
        settings,
        backend=storage.backend,
        final_record_key=final_record_key,
        job_id=job_id,
    )
    if existing is not None:
        return existing

    argos_packages = (
        settings.work_dir / "models" / "argos" / "packages"
    ).resolve()
    expected_argos_model = argos_packages / "translate-en_de-1_3"
    if not expected_argos_model.is_dir():
        raise RuntimeError(
            "Offline English-to-German model is not installed in Toluva work storage"
        )
    whisper_model_dir = (
        settings.work_dir / "models" / "whisper" / "base-en"
    ).resolve()
    if not (whisper_model_dir / "model.bin").is_file():
        raise RuntimeError(
            "Pinned local Whisper model is not installed in Toluva work storage"
        )

    source_key = keys.source_master(E2E_SOURCE_ASSET_ID, "mp4")
    source_record_key = keys.source_record(E2E_SOURCE_ASSET_ID)
    source_version = f"{E2E_VERSION}-{job_id}"
    transcript_key = keys.transcript(source_version)
    segments_key = keys.segments(source_version)
    captions_key = keys.captions(scope, E2E_VERSION)
    disclosure_key = keys.disclosure(scope, E2E_VERSION)
    stage_journal = B2StageJournal(
        storage.backend,
        keys=keys,
        scope=scope,
    )
    resumed: list[str] = []

    with tempfile.TemporaryDirectory(prefix="toluva-live-e2e-") as temp_dir:
        temp_root = Path(temp_dir)
        source_path = temp_root / "source-en.mp4"
        if storage.backend.exists(source_key):
            source_path.write_bytes(storage.backend.get(source_key))
            resumed.append("source-ingest")
        else:
            _create_development_source(source_path, temp_root=temp_root)
            source_bytes = source_path.read_bytes()
            put_immutable(
                storage.backend,
                source_key,
                source_bytes,
                content_type="video/mp4",
            )
            put_immutable(
                storage.backend,
                source_record_key,
                _json_bytes(
                    {
                        "schema_version": "1.0",
                        "record_type": "source_ingest",
                        "source_kind": "locally-generated-development-sample",
                        "source_generation_tool": "macos-system-voice",
                        "expected_source_text": E2E_SOURCE_TEXT,
                        "not_final_demo_asset": True,
                        "b2_key": source_key,
                        "sha256": _sha256(source_bytes),
                        "duration_seconds": probe_duration(source_path),
                        "mime_type": "video/mp4",
                    }
                ),
                content_type="application/json",
            )
        source = _source_asset(source_path, source_key)
        if _sha256(source_path.read_bytes()) != source.sha256:
            raise EndToEndIntegrityError("Source media failed hash verification")

        transcription_stage = "transcription-whisper-base-en"
        transcription_checkpoint = stage_journal.completion(transcription_stage)
        if transcription_checkpoint is None:
            transcription_idempotency = _sha256(
                f"{job_id}\0{source.sha256}\0{WHISPER_MODEL_REVISION}".encode()
            )
            stage_journal.begin(
                transcription_stage,
                idempotency_key=transcription_idempotency,
                provider="faster-whisper-local",
                model=WHISPER_MODEL,
            )
            transcription_sink = ObjectStorageSink(
                storage.backend,
                prefix=keys.transcription_genblaze_prefix(source_version),
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            try:
                transcription_result = (
                    Pipeline(
                        "toluva-live-transcription",
                        tenant_id="toluva-demo",
                        project_id=E2E_PROJECT_ID,
                        preflight=False,
                    )
                    .metadata(
                        job_id=job_id,
                        source_key=source_key,
                        idempotency_key=transcription_idempotency,
                    )
                    .step(
                        FasterWhisperProvider(
                            model_dir=whisper_model_dir,
                            model_revision=WHISPER_MODEL_REVISION,
                        ),
                        model=WHISPER_MODEL,
                        modality=Modality.TEXT,
                        expected_duration_sec=source.duration,
                        external_inputs=[source],
                        metadata={
                            "operation": "timed_transcription",
                            "live_model": True,
                        },
                        keyterms=list(E2E_PROTECTED_TERMS),
                    )
                    .run(
                        sink=transcription_sink,
                        raise_on_failure=True,
                        timeout=120,
                        pipeline_timeout=180,
                        max_retries=0,
                    )
                )
                transcription_asset = _verified_pipeline_asset(
                    result=transcription_result,
                    sink=transcription_sink,
                    backend=storage.backend,
                )
                transcription_checkpoint = {
                    "asset_key": transcription_asset.asset_key,
                    "asset_sha256": transcription_asset.asset_sha256,
                    "manifest_key": transcription_asset.manifest_key,
                    "manifest_hash": transcription_asset.manifest_hash,
                    "run_id": transcription_asset.run_id,
                }
                stage_journal.complete(
                    transcription_stage,
                    transcription_checkpoint,
                )
            except Exception as exc:
                stage_journal.fail(
                    transcription_stage,
                    error_type=type(exc).__name__,
                )
                raise
        else:
            resumed.append(transcription_stage)

        raw_transcript_bytes = storage.backend.get(
            str(transcription_checkpoint["asset_key"])
        )
        if _sha256(raw_transcript_bytes) != transcription_checkpoint["asset_sha256"]:
            raise EndToEndIntegrityError("Stored transcription asset hash changed")
        raw_transcript = json.loads(raw_transcript_bytes)
        timed_transcript = timed_transcript_from_scribe(
            raw_transcript,
            source_asset_sha256=str(source.sha256),
            media_duration_seconds=float(source.duration),
            source="faster-whisper-base-en-live",
        )
        if len(timed_transcript.segments) != 1:
            raise EndToEndIntegrityError(
                "The bounded development source must produce exactly one segment"
            )
        normalized_transcript = {
            "schema_version": "1.0",
            "record_type": "timed_transcript",
            **timed_transcript.to_dict(),
            "provider_asset_key": transcription_checkpoint["asset_key"],
            "provider_manifest_key": transcription_checkpoint["manifest_key"],
        }
        normalized_segments = {
            "schema_version": "1.0",
            "record_type": "timed_segments",
            "segments": [
                asdict(segment) for segment in timed_transcript.segments
            ],
        }
        put_immutable(
            storage.backend,
            transcript_key,
            _json_bytes(normalized_transcript),
            content_type="application/json",
        )
        put_immutable(
            storage.backend,
            segments_key,
            _json_bytes(normalized_segments),
            content_type="application/json",
        )
        source_segment = timed_transcript.segments[0]
        if "Toluva" not in source_segment.text:
            raise EndToEndIntegrityError(
                "Live transcription did not preserve the protected product name"
            )

        translation_stage = "translation-argos-en-de"
        translation_checkpoint = stage_journal.completion(translation_stage)
        if translation_checkpoint is None:
            translation_idempotency = _sha256(
                f"{job_id}\0{source_segment.text}\0{ARGOS_MODEL}".encode()
            )
            stage_journal.begin(
                translation_stage,
                idempotency_key=translation_idempotency,
                provider="argos-translate-offline",
                model=ARGOS_MODEL,
            )
            translation_sink = ObjectStorageSink(
                storage.backend,
                prefix=keys.translation_genblaze_prefix(
                    scope,
                    source_segment.segment_id,
                    E2E_VERSION,
                ),
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            try:
                translation_result = (
                    Pipeline(
                        "toluva-live-translation",
                        tenant_id="toluva-demo",
                        project_id=E2E_PROJECT_ID,
                        preflight=False,
                    )
                    .metadata(
                        job_id=job_id,
                        segment_id=source_segment.segment_id,
                        idempotency_key=translation_idempotency,
                    )
                    .step(
                        ArgosCTranslate2Provider(packages_dir=argos_packages),
                        model=ARGOS_MODEL,
                        prompt=source_segment.text,
                        modality=Modality.TEXT,
                        metadata={
                            "operation": "protected_term_translation",
                            "live_model": True,
                        },
                        source_language="en",
                        target_language="de",
                        protected_terms=list(E2E_PROTECTED_TERMS),
                    )
                    .run(
                        sink=translation_sink,
                        raise_on_failure=True,
                        timeout=120,
                        pipeline_timeout=180,
                        max_retries=0,
                    )
                )
                translation_asset = _verified_pipeline_asset(
                    result=translation_result,
                    sink=translation_sink,
                    backend=storage.backend,
                )
                translation_checkpoint = {
                    "asset_key": translation_asset.asset_key,
                    "asset_sha256": translation_asset.asset_sha256,
                    "manifest_key": translation_asset.manifest_key,
                    "manifest_hash": translation_asset.manifest_hash,
                    "run_id": translation_asset.run_id,
                }
                stage_journal.complete(translation_stage, translation_checkpoint)
            except Exception as exc:
                stage_journal.fail(
                    translation_stage,
                    error_type=type(exc).__name__,
                )
                raise
        else:
            resumed.append(translation_stage)

        translation_bytes = storage.backend.get(
            str(translation_checkpoint["asset_key"])
        )
        if _sha256(translation_bytes) != translation_checkpoint["asset_sha256"]:
            raise EndToEndIntegrityError("Stored translation asset hash changed")
        translation_payload = json.loads(translation_bytes)
        translated_text = str(translation_payload["translated_text"]).strip()
        if any(term not in translated_text for term in E2E_PROTECTED_TERMS):
            raise EndToEndIntegrityError(
                "Stored translation lost a protected term"
            )

        now = datetime.now(UTC)
        evidence = (
            b"Toluva live development authorization: use the configured "
            b"ElevenLabs stock voice for a short German internal-training sample."
        )
        evidence_sha256 = _sha256(evidence)
        authorization = VoiceAuthorization(
            authorization_id=E2E_AUTHORIZATION_ID,
            speaker_id="elevenlabs-stock-voice",
            voice_profile_id=DEFAULT_STOCK_VOICE_ID,
            voice_type=VoiceType.STOCK,
            evidence_asset_id="stock-voice-live-policy",
            evidence_sha256=evidence_sha256,
            allowed_languages=(E2E_LANGUAGE,),
            allowed_purposes=("internal-training",),
            valid_from=datetime(2026, 7, 29, tzinfo=UTC),
            expires_at=datetime(2026, 8, 12, tzinfo=UTC),
            approved_by="toluva-spike-operator",
            approved_at=datetime(2026, 7, 29, tzinfo=UTC),
        )
        authorization_decision = authorize_or_raise(
            authorization,
            AuthorizationRequest(
                voice_profile_id=DEFAULT_STOCK_VOICE_ID,
                language=E2E_LANGUAGE,
                purpose="internal-training",
                requested_at=now,
            ),
        )
        evidence_key = keys.authorization_evidence(
            E2E_AUTHORIZATION_ID,
            authorization.evidence_asset_id,
            "txt",
        )
        authorization_key = keys.authorization_record(E2E_AUTHORIZATION_ID)
        put_immutable(
            storage.backend,
            evidence_key,
            evidence,
            content_type="text/plain",
        )
        put_immutable(
            storage.backend,
            authorization_key,
            _json_bytes(
                {
                    **asdict(authorization),
                    "voice_type": authorization.voice_type.value,
                    "valid_from": authorization.valid_from.isoformat(),
                    "expires_at": authorization.expires_at.isoformat(),
                    "approved_at": authorization.approved_at.isoformat(),
                    "revoked_at": None,
                    "evidence_key": evidence_key,
                    "disclosure": "Synthetic stock voice used.",
                }
            ),
            content_type="application/json",
        )

        timing_summary_key = keys.timing_summary(
            scope,
            source_segment.segment_id,
        )
        if storage.backend.exists(timing_summary_key):
            timing_summary = json.loads(storage.backend.get(timing_summary_key))
            resumed.append("timing-correction")
        else:
            correction_journal = B2CorrectionJournal(
                storage.backend,
                keys=keys,
                scope=scope,
            )
            correction_journal.assert_fresh(source_segment.segment_id)
            correction_engine = TimingCorrectionEngine(
                generator=GenblazeElevenLabsAttemptGenerator(
                    settings=settings,
                    backend=storage.backend,
                    scope=scope,
                    keys=keys,
                    authorization_id=E2E_AUTHORIZATION_ID,
                    authorization_code=authorization_decision.code.value,
                    language=E2E_LANGUAGE,
                    language_code="de",
                    purpose="internal-training",
                ),
                rewriter=ScriptedTranslationRewriter(
                    (),
                    name="no-rewrite-needed-for-live-slice",
                ),
                policy=TimingPolicy(
                    green_threshold=settings.green_drift_threshold,
                    amber_threshold=settings.amber_drift_threshold,
                    max_retries=settings.max_timing_retries,
                ),
                journal=correction_journal,
            )
            correction_outcome = correction_engine.run(
                TimingCorrectionRequest(
                    project_id=E2E_PROJECT_ID,
                    job_id=job_id,
                    segment_id=source_segment.segment_id,
                    source_text=source_segment.text,
                    initial_translation=translated_text,
                    source_language="English",
                    target_language="German",
                    target_seconds=source_segment.end_seconds
                    - source_segment.start_seconds,
                    protected_terms=E2E_PROTECTED_TERMS,
                )
            )
            timing_summary = {
                "schema_version": "1.0",
                "record_type": "timing_correction_summary",
                **correction_outcome.to_dict(),
            }

        speech = _selected_speech(timing_summary)
        speech_bytes = _assert_speech_integrity(storage.backend, speech)
        selected_attempt_number = timing_summary["selected_attempt_number"]
        attempts = timing_summary["attempts"]
        selected_attempt = next(
            item
            for item in attempts
            if item["context"]["attempt_number"] == selected_attempt_number
        )

        localized_transcript = TimedTranscript(
            language=E2E_LANGUAGE,
            source="argos-translate-offline-live",
            source_asset_sha256=str(source.sha256),
            segments=(
                TimedSegment(
                    segment_id=source_segment.segment_id,
                    start_seconds=source_segment.start_seconds,
                    end_seconds=source_segment.end_seconds,
                    text=translated_text,
                    speaker_id="elevenlabs-stock-voice",
                ),
            ),
        )
        captions_bytes = to_webvtt(localized_transcript).encode("utf-8")
        put_immutable(
            storage.backend,
            captions_key,
            captions_bytes,
            content_type="text/vtt",
        )
        speech_path = temp_root / "localized-de.mp3"
        captions_path = temp_root / "localized-de.vtt"
        speech_path.write_bytes(speech_bytes)
        captions_path.write_bytes(captions_bytes)

        composition_sink = ObjectStorageSink(
            storage.backend,
            prefix=keys.composition_genblaze_prefix(scope, E2E_VERSION),
            key_strategy=KeyStrategy.HIERARCHICAL,
        )
        audio_asset = Asset(
            url=local_file_url(speech_path.resolve()),
            media_type="audio/mpeg",
            sha256=_sha256(speech_bytes),
            size_bytes=len(speech_bytes),
            duration=float(speech["generated_seconds"]),
            audio=AudioMetadata(codec="mp3"),
            metadata={
                "b2_key": speech["audio_key"],
                "genblaze_manifest_key": speech["manifest_key"],
                "selected_timing_attempt": selected_attempt_number,
            },
        )
        caption_asset = Asset(
            url=local_file_url(captions_path.resolve()),
            media_type="text/vtt",
            sha256=_sha256(captions_bytes),
            size_bytes=len(captions_bytes),
            duration=float(source.duration),
            metadata={"b2_key": captions_key, "language": E2E_LANGUAGE},
        )
        local_composition_outputs: list[str] = []

        def capture_local_composition(event: object) -> None:
            step_event = getattr(event, "step", None)
            assets = getattr(step_event, "assets", None)
            if assets:
                local_composition_outputs.append(assets[0].url)

        composition_result = (
            Pipeline(
                "toluva-live-localized-composition",
                tenant_id="toluva-demo",
                project_id=E2E_PROJECT_ID,
                preflight=False,
            )
            .metadata(
                job_id=job_id,
                language=E2E_LANGUAGE,
                source_key=source_key,
                captions_key=captions_key,
                selected_speech_key=speech["audio_key"],
                fan_in_inputs=("video", "localized_audio", "captions"),
            )
            .step(
                ToluvaFFmpegCompositor(output_dir=temp_root),
                model="ffmpeg-captioned-mp4-v1",
                modality=Modality.VIDEO,
                expected_duration_sec=source.duration,
                external_inputs=[source, audio_asset, caption_asset],
                metadata={
                    "operation": "localized_video_fan_in",
                    "input_count": 3,
                    "caption_delivery": "embedded-mov_text-and-sidecar-vtt",
                },
                target_seconds=source.duration,
                subtitle_language="deu",
            )
            .run(
                sink=composition_sink,
                raise_on_failure=True,
                timeout=120,
                pipeline_timeout=180,
                max_retries=0,
                on_step_complete=capture_local_composition,
            )
        )
        composition_asset = _verified_pipeline_asset(
            result=composition_result,
            sink=composition_sink,
            backend=storage.backend,
        )
        if not local_composition_outputs:
            raise EndToEndIntegrityError(
                "Composition did not expose a local output before storage"
            )
        local_output_url = local_composition_outputs[0]
        parsed_output = urlparse(local_output_url)
        if parsed_output.scheme != "file":
            raise EndToEndIntegrityError("Composition did not expose a local output")
        generated_output = Path(unquote(parsed_output.path))
        stream_types = _stream_types(generated_output)
        final_duration = probe_duration(generated_output)
        if abs(final_duration - float(source.duration)) > 0.05:
            raise EndToEndIntegrityError(
                "Final localized media duration differs from the source"
            )

        durable_dir = (
            settings.work_dir / "vertical-slice" / job_id / E2E_VERSION
        ).resolve()
        durable_dir.mkdir(parents=True, exist_ok=False)
        durable_output = durable_dir / "localized-de.mp4"
        shutil.copy2(generated_output, durable_output)
        (durable_dir / "captions.vtt").write_bytes(captions_bytes)

        disclosure = {
            "schema_version": "1.0",
            "record_type": "synthetic_media_disclosure",
            "synthetic_voice": True,
            "voice_type": "stock",
            "voice_provider": "elevenlabs-tts",
            "voice_model": DEFAULT_MODEL,
            "authorization_id": E2E_AUTHORIZATION_ID,
            "language": E2E_LANGUAGE,
            "source_transcription_provider": "faster-whisper-local",
            "translation_provider": "argos-translate-offline",
            "human_approval_required_before_publish": True,
            "development_sample": True,
        }
        put_immutable(
            storage.backend,
            disclosure_key,
            _json_bytes(disclosure),
            content_type="application/json",
        )

        report = LiveEndToEndReport(
            project_id=E2E_PROJECT_ID,
            job_id=job_id,
            source_language=E2E_SOURCE_LANGUAGE,
            target_language=E2E_LANGUAGE,
            source_key=source_key,
            source_record_key=source_record_key,
            source_sha256=str(source.sha256),
            source_duration_seconds=float(source.duration),
            transcription_provider="faster-whisper-local",
            transcription_model=WHISPER_MODEL,
            transcription_run_id=str(transcription_checkpoint["run_id"]),
            transcription_asset_key=str(transcription_checkpoint["asset_key"]),
            transcription_manifest_key=str(
                transcription_checkpoint["manifest_key"]
            ),
            transcript_key=transcript_key,
            segments_key=segments_key,
            segment_count=len(timed_transcript.segments),
            detected_source_text=source_segment.text,
            translation_provider="argos-translate-offline",
            translation_model=ARGOS_MODEL,
            translation_run_id=str(translation_checkpoint["run_id"]),
            translation_asset_key=str(translation_checkpoint["asset_key"]),
            translation_manifest_key=str(
                translation_checkpoint["manifest_key"]
            ),
            translated_text=translated_text,
            protected_terms_preserved=True,
            authorization_code=authorization_decision.code.value,
            timing_status=str(timing_summary["status"]),
            timing_band=str(selected_attempt["timing_band"]),
            timing_action=str(selected_attempt["timing_action"]),
            tts_attempt_count=len(attempts),
            tts_generated_characters=int(
                timing_summary["total_generated_characters"]
            ),
            selected_speech_key=str(speech["audio_key"]),
            selected_speech_manifest_key=str(speech["manifest_key"]),
            captions_key=captions_key,
            composition_run_id=composition_asset.run_id,
            composition_manifest_key=composition_asset.manifest_key,
            final_asset_key=composition_asset.asset_key,
            final_asset_sha256=composition_asset.asset_sha256,
            final_duration_seconds=final_duration,
            captions_embedded="subtitle" in stream_types,
            disclosure_key=disclosure_key,
            final_record_key=final_record_key,
            local_output_path=str(durable_output),
            resumed_completed_stages=tuple(resumed),
            live_transcription=True,
            live_translation=True,
            live_tts=True,
        )
        put_immutable(
            storage.backend,
            final_record_key,
            _json_bytes(report.to_durable_dict()),
            content_type="application/json",
        )
        (durable_dir / "report.json").write_bytes(_json_bytes(report.to_dict()))
        return report
