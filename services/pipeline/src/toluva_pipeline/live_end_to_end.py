"""Fixture-free English-to-German localization slice using real provider stages."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

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
    CorrectionAttempt,
    TimingCorrectionOutcome,
)
from toluva_pipeline.domain.multi_segment import (
    MultiSegmentLocalizationEngine,
    MultiSegmentLocalizationRequest,
    MultiSegmentStatus,
    SegmentTranslationArtifact,
)
from toluva_pipeline.domain.timing import TimingPolicy
from toluva_pipeline.domain.transcript import TimedSegment, TimedTranscript, to_webvtt
from toluva_pipeline.domain.transcript_quality import (
    POLICY_VERSION,
    TranscriptQualityBlocked,
    evaluate_transcript_quality,
    validated_human_review_text,
)
from toluva_pipeline.domain.transcription import timed_transcript_from_scribe
from toluva_pipeline.live_timing_correction import (
    GenblazeElevenLabsAttemptGenerator,
)
from toluva_pipeline.live_tts import DEFAULT_MODEL, DEFAULT_STOCK_VOICE_ID
from toluva_pipeline.media import probe_duration, probe_media
from toluva_pipeline.providers.audio_assembler import (
    ToluvaSegmentAudioAssembler,
)
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
from toluva_pipeline.storage.multi_segment import B2MultiSegmentJournal
from toluva_pipeline.storage.records import put_immutable
from toluva_pipeline.storage.stages import B2StageJournal
from toluva_pipeline.storage.translation_revisions import (
    B2ApprovedTranslationRewriter,
    RewriteApprovalRequired,
)

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
AUDIO_ASSEMBLY_POLICY_VERSION = "tempo-fit-v2"
ProgressCallback = Callable[[str, str], None]


class EndToEndIntegrityError(RuntimeError):
    """Raised when a live input, manifest, or stored output cannot be verified."""


class TimingCorrectionBlocked(RuntimeError):
    """Raised when timing QA stops before an unapproved or unsafe retry."""

    job_state = "blocked"

    def __init__(self, segment_id: str) -> None:
        super().__init__(
            f"Segment {segment_id} requires an approved timing revision."
        )
        self.segment_id = segment_id


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
    transcript_quality_key: str | None = None
    transcript_quality_decision: str = "not-recorded"
    transcript_review_key: str | None = None
    effective_source_text: str | None = None
    multi_segment_summary_key: str | None = None
    segment_results: tuple[dict[str, object], ...] = ()
    translation_run_ids: tuple[str, ...] = ()
    translation_asset_keys: tuple[str, ...] = ()
    translation_manifest_keys: tuple[str, ...] = ()
    selected_speech_keys: tuple[str, ...] = ()
    selected_speech_manifest_keys: tuple[str, ...] = ()
    localized_audio_run_id: str | None = None
    localized_audio_asset_key: str | None = None
    localized_audio_manifest_key: str | None = None
    red_to_green_segment_ids: tuple[str, ...] = ()
    resumed_segment_ids: tuple[str, ...] = ()

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


def _verified_checkpoint_asset(
    *,
    checkpoint: dict[str, object],
    backend: object,
) -> VerifiedPipelineAsset:
    required = (
        "asset_key",
        "asset_sha256",
        "manifest_key",
        "manifest_hash",
        "run_id",
    )
    if any(not isinstance(checkpoint.get(key), str) for key in required):
        raise EndToEndIntegrityError("Stored stage checkpoint is malformed")
    asset_key = str(checkpoint["asset_key"])
    manifest_key = str(checkpoint["manifest_key"])
    stored_bytes = backend.get(asset_key)
    stored_manifest = Manifest.model_validate_json(backend.get(manifest_key))
    asset_matches = _sha256(stored_bytes) == checkpoint["asset_sha256"]
    manifest_valid = stored_manifest.verify()
    manifest_hash_matches = (
        stored_manifest.canonical_hash == checkpoint["manifest_hash"]
    )
    if (
        not asset_matches
        or not manifest_valid
        or not manifest_hash_matches
        or stored_manifest.run.run_id != checkpoint["run_id"]
    ):
        raise EndToEndIntegrityError(
            "Stored checkpoint manifest or asset hash verification failed"
        )
    return VerifiedPipelineAsset(
        asset_key=asset_key,
        asset_sha256=str(checkpoint["asset_sha256"]),
        manifest_key=manifest_key,
        manifest_hash=str(checkpoint["manifest_hash"]),
        run_id=str(checkpoint["run_id"]),
        stored_manifest_valid=manifest_valid,
        stored_asset_hash_matches=asset_matches,
        bytes=stored_bytes,
    )


class _CheckpointedArgosSegmentTranslator:
    """Run or replay one verified Argos Genblaze stage per source segment."""

    def __init__(
        self,
        *,
        backend: object,
        stage_journal: B2StageJournal,
        keys: ToluvaObjectKeys,
        scope: StorageScope,
        packages_dir: Path,
        version: str,
        resumed: list[str],
    ) -> None:
        self._backend = backend
        self._stage_journal = stage_journal
        self._keys = keys
        self._scope = scope
        self._packages_dir = packages_dir
        self._version = version
        self._resumed = resumed

    def translate(
        self,
        request: MultiSegmentLocalizationRequest,
        segment: TimedSegment,
        protected_terms: tuple[str, ...],
    ) -> SegmentTranslationArtifact:
        stage = f"translation-argos-en-de-{segment.segment_id}"
        checkpoint = self._stage_journal.completion(stage)
        if checkpoint is None:
            idempotency_key = _sha256(
                (
                    f"{request.job_id}\0{segment.segment_id}\0"
                    f"{segment.text}\0{ARGOS_MODEL}"
                ).encode()
            )
            self._stage_journal.begin(
                stage,
                idempotency_key=idempotency_key,
                provider="argos-translate-offline",
                model=ARGOS_MODEL,
            )
            sink = ObjectStorageSink(
                self._backend,
                prefix=self._keys.translation_genblaze_prefix(
                    self._scope,
                    segment.segment_id,
                    self._version,
                ),
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            try:
                result = (
                    Pipeline(
                        "toluva-live-segment-translation",
                        tenant_id="toluva-demo",
                        project_id=request.project_id,
                        preflight=False,
                    )
                    .metadata(
                        job_id=request.job_id,
                        segment_id=segment.segment_id,
                        idempotency_key=idempotency_key,
                    )
                    .step(
                        ArgosCTranslate2Provider(
                            packages_dir=self._packages_dir
                        ),
                        model=ARGOS_MODEL,
                        prompt=segment.text,
                        modality=Modality.TEXT,
                        metadata={
                            "operation": "protected_term_translation",
                            "live_model": True,
                            "segment_id": segment.segment_id,
                        },
                        source_language="en",
                        target_language="de",
                        protected_terms=list(protected_terms),
                    )
                    .run(
                        sink=sink,
                        raise_on_failure=True,
                        timeout=120,
                        pipeline_timeout=180,
                        max_retries=0,
                    )
                )
                verified = _verified_pipeline_asset(
                    result=result,
                    sink=sink,
                    backend=self._backend,
                )
                checkpoint = {
                    "asset_key": verified.asset_key,
                    "asset_sha256": verified.asset_sha256,
                    "manifest_key": verified.manifest_key,
                    "manifest_hash": verified.manifest_hash,
                    "run_id": verified.run_id,
                    "segment_id": segment.segment_id,
                    "source_text_sha256": _sha256(
                        segment.text.encode("utf-8")
                    ),
                }
                self._stage_journal.complete(stage, checkpoint)
            except Exception as exc:
                self._stage_journal.fail(
                    stage,
                    error_type=type(exc).__name__,
                )
                raise
        else:
            self._resumed.append(stage)

        if (
            checkpoint.get("segment_id") != segment.segment_id
            or checkpoint.get("source_text_sha256")
            != _sha256(segment.text.encode("utf-8"))
        ):
            raise EndToEndIntegrityError(
                "Stored translation checkpoint does not match its segment"
            )
        verified = _verified_checkpoint_asset(
            checkpoint=checkpoint,
            backend=self._backend,
        )
        payload = json.loads(verified.bytes)
        if (
            not isinstance(payload, dict)
            or payload.get("record_type") != "machine_translation"
            or payload.get("source_text") != segment.text
            or tuple(payload.get("protected_terms", ())) != protected_terms
        ):
            raise EndToEndIntegrityError(
                "Stored translation payload does not match its segment"
            )
        translated_text = str(payload.get("translated_text", "")).strip()
        return SegmentTranslationArtifact(
            segment_id=segment.segment_id,
            source_text=segment.text,
            translated_text=translated_text,
            provider="argos-translate-offline",
            model=ARGOS_MODEL,
            run_id=verified.run_id,
            asset_key=verified.asset_key,
            manifest_key=verified.manifest_key,
            stored_manifest_valid=verified.stored_manifest_valid,
            stored_manifest_hash_matches=(
                verified.manifest_hash == checkpoint["manifest_hash"]
            ),
            stored_asset_hash_matches=verified.stored_asset_hash_matches,
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


def _reviewed_timed_transcript(
    transcript: TimedTranscript,
    corrected_text: str,
) -> TimedTranscript:
    """Apply one approved sentence to each preserved provider time slot."""

    if len(transcript.segments) == 1:
        replacements = (corrected_text.strip(),)
    else:
        replacements = tuple(
            match.group(0).strip()
            for match in re.finditer(
                r"[^.!?]+(?:[.!?]+(?=\s|$)|$)",
                corrected_text.strip(),
            )
            if match.group(0).strip()
        )
        if len(replacements) != len(transcript.segments):
            raise EndToEndIntegrityError(
                "A multi-segment transcript correction must preserve one "
                "sentence per timed source segment"
            )
    return TimedTranscript(
        language=transcript.language,
        source=transcript.source,
        source_asset_sha256=transcript.source_asset_sha256,
        segments=tuple(
            TimedSegment(
                segment_id=segment.segment_id,
                start_seconds=segment.start_seconds,
                end_seconds=segment.end_seconds,
                text=replacement,
                speaker_id=segment.speaker_id,
            )
            for segment, replacement in zip(
                transcript.segments,
                replacements,
                strict=True,
            )
        ),
    )


def _existing_report(
    settings: Settings,
    *,
    backend: object,
    final_record_key: str,
    project_id: str,
    job_id: str,
    version: str,
) -> LiveEndToEndReport | None:
    if not backend.exists(final_record_key):
        return None
    payload = json.loads(backend.get(final_record_key))
    if not isinstance(payload, dict):
        raise EndToEndIntegrityError("Stored final report is malformed")
    local_path = (
        settings.work_dir
        / "vertical-slice"
        / project_id
        / job_id
        / version
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
    project_id: str = E2E_PROJECT_ID,
    source_asset_id: str = E2E_SOURCE_ASSET_ID,
    authorization_id: str = E2E_AUTHORIZATION_ID,
    protected_terms: tuple[str, ...] = E2E_PROTECTED_TERMS,
    create_development_source_if_missing: bool = True,
    development_sample: bool = True,
    source_kind: str = "locally-generated-development-sample",
    max_tts_calls: int | None = None,
    max_tts_characters: int | None = None,
    version: str = E2E_VERSION,
    on_progress: ProgressCallback | None = None,
) -> LiveEndToEndReport:
    """Run or safely reuse the first fixture-free localized video."""

    def progress(stage: str, message: str) -> None:
        if on_progress is not None:
            on_progress(stage, message)

    if not settings.elevenlabs_ready:
        raise CredentialConfigurationError("ELEVENLABS_API_KEY is not configured")
    if not settings.b2_ready:
        raise CredentialConfigurationError("Backblaze B2 is not configured")
    if not protected_terms:
        raise ValueError("At least one protected term is required")

    scope = StorageScope(project_id, job_id, E2E_LANGUAGE)
    keys = ToluvaObjectKeys(project_id)
    storage = build_b2_storage(settings, scope, preflight=True)
    final_record_key = keys.final_record(scope, version)
    existing = _existing_report(
        settings,
        backend=storage.backend,
        final_record_key=final_record_key,
        project_id=project_id,
        job_id=job_id,
        version=version,
    )
    if existing is not None:
        progress("completed", "Reused the verified final B2 checkpoint.")
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

    source_key = keys.source_master(source_asset_id, "mp4")
    source_record_key = keys.source_record(source_asset_id)
    source_version = f"{version}-{job_id}"
    transcript_key = keys.transcript(source_version)
    segments_key = keys.segments(source_version)
    transcript_quality_key = keys.transcript_quality(scope, version)
    transcript_review_key = keys.transcript_human_review(scope, version)
    captions_key = keys.captions(scope, version)
    disclosure_key = keys.disclosure(scope, version)
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
            if not create_development_source_if_missing:
                raise EndToEndIntegrityError(
                    "Queued source media is missing from B2"
                )
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
                        "source_kind": source_kind,
                        "source_generation_tool": "macos-system-voice",
                        "expected_source_text": E2E_SOURCE_TEXT,
                        "not_final_demo_asset": development_sample,
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
        if (
            not create_development_source_if_missing
            and not 1.0 <= float(source.duration) <= 30.05
        ):
            raise EndToEndIntegrityError(
                "Queued source duration must be between 1 and 30 seconds"
            )
        progress("source-ready", "Verified the uploaded MP4 against its B2 bytes.")

        transcription_stage = "transcription-whisper-base-en"
        transcription_checkpoint = stage_journal.completion(transcription_stage)
        if transcription_checkpoint is None:
            progress(
                "transcribing",
                "Running pinned local Whisper through a Genblaze stage.",
            )
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
                        project_id=project_id,
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
                        keyterms=list(protected_terms),
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
        if len(timed_transcript.segments) == 0:
            raise EndToEndIntegrityError(
                "The bounded source produced no speech segment"
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
        detected_source_text = str(raw_transcript["text"]).strip()
        progress(
            "transcribed",
            "Stored the timed transcript and protected-term decision in B2.",
        )
        if storage.backend.exists(transcript_quality_key):
            transcript_quality = json.loads(
                storage.backend.get(transcript_quality_key)
            )
            if not isinstance(transcript_quality, dict):
                raise EndToEndIntegrityError(
                    "Stored transcript quality review is malformed"
                )
            resumed.append("transcript-quality")
        else:
            review = evaluate_transcript_quality(
                raw_transcript,
                protected_terms=protected_terms,
            )
            transcript_quality = {
                "schema_version": "1.0",
                "record_type": "transcript_quality_review",
                "project_id": project_id,
                "job_id": job_id,
                "source_sha256": str(source.sha256),
                "transcript_key": transcript_key,
                "provider_asset_key": transcription_checkpoint["asset_key"],
                "detected_text": str(raw_transcript["text"]).strip(),
                **review.to_dict(),
            }
            put_immutable(
                storage.backend,
                transcript_quality_key,
                _json_bytes(transcript_quality),
                content_type="application/json",
            )
        detected_text = str(raw_transcript["text"]).strip()
        detected_text_sha256 = hashlib.sha256(
            detected_text.encode("utf-8")
        ).hexdigest()
        raw_reason_codes = transcript_quality.get("reason_codes")
        if (
            transcript_quality.get("record_type")
            != "transcript_quality_review"
            or transcript_quality.get("project_id") != project_id
            or transcript_quality.get("job_id") != job_id
            or transcript_quality.get("source_sha256") != str(source.sha256)
            or transcript_quality.get("transcript_key") != transcript_key
            or transcript_quality.get("policy_version") != POLICY_VERSION
            or transcript_quality.get("detected_text") != detected_text
            or transcript_quality.get("text_sha256")
            != detected_text_sha256
            or not isinstance(raw_reason_codes, list)
        ):
            raise EndToEndIntegrityError(
                "Stored transcript quality review does not match the job"
            )
        transcript_quality_decision = str(
            transcript_quality.get("decision", "")
        )
        if (
            transcript_quality_decision == "accepted"
            and raw_reason_codes
        ) or (
            transcript_quality_decision == "review_required"
            and not raw_reason_codes
        ):
            raise EndToEndIntegrityError(
                "Stored transcript quality decision contradicts its evidence"
            )
        if transcript_quality_decision not in {
            "accepted",
            "review_required",
        }:
            raise EndToEndIntegrityError(
                "Stored transcript quality decision is unsupported"
            )
        if transcript_quality_decision != "accepted":
            if storage.backend.exists(transcript_review_key):
                human_review = json.loads(
                    storage.backend.get(transcript_review_key)
                )
                corrected_text = validated_human_review_text(
                    human_review,
                    original_text_sha256=str(
                        transcript_quality.get("text_sha256", "")
                    ),
                    protected_terms=protected_terms,
                    project_id=project_id,
                    job_id=job_id,
                )
                timed_transcript = _reviewed_timed_transcript(
                    timed_transcript,
                    corrected_text,
                )
                transcript_quality_decision = "human-approved"
                resumed.append("transcript-human-review")
                progress(
                    "transcript-approved",
                    "An immutable operator correction passed protected-term checks.",
                )
            else:
                raw_reasons = transcript_quality.get("reason_codes", ())
                reason_codes = tuple(
                    str(value)
                    for value in raw_reasons
                    if isinstance(value, str)
                )
                progress(
                    "transcript-blocked",
                    "Suspicious transcript evidence requires human review; translation and TTS were not called.",
                )
                raise TranscriptQualityBlocked(reason_codes)
        else:
            progress(
                "transcript-reviewed",
                "Transcript confidence, protected terms, and trailing-fragment checks passed.",
            )

        translator = _CheckpointedArgosSegmentTranslator(
            backend=storage.backend,
            stage_journal=stage_journal,
            keys=keys,
            scope=scope,
            packages_dir=argos_packages,
            version=version,
            resumed=resumed,
        )

        now = datetime.now(UTC)
        evidence = (
            b"Toluva live development authorization: use the configured "
            b"ElevenLabs stock voice for a short German internal-training sample."
        )
        evidence_sha256 = _sha256(evidence)
        authorization = VoiceAuthorization(
            authorization_id=authorization_id,
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
            authorization_id,
            authorization.evidence_asset_id,
            "txt",
        )
        authorization_key = keys.authorization_record(authorization_id)
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
        progress(
            "authorized",
            "Voice language and internal-training purpose passed before TTS.",
        )

        correction_journal = B2CorrectionJournal(
            storage.backend,
            keys=keys,
            scope=scope,
        )
        generator = GenblazeElevenLabsAttemptGenerator(
            settings=settings,
            backend=storage.backend,
            scope=scope,
            keys=keys,
            authorization_id=authorization_id,
            authorization_code=authorization_decision.code.value,
            language=E2E_LANGUAGE,
            language_code="de",
            purpose="internal-training",
            max_tts_calls=max_tts_calls,
            max_tts_characters=max_tts_characters,
        )
        completed_timings: dict[str, TimingCorrectionOutcome] = {}
        prior_attempts: dict[str, tuple[CorrectionAttempt, ...]] = {}
        for segment in timed_transcript.segments:
            completed = correction_journal.completed_outcome(
                segment.segment_id
            )
            if completed is not None:
                completed_timings[segment.segment_id] = completed
                continue
            durable_attempts = correction_journal.completed_attempts(
                segment.segment_id,
                max_attempts=settings.max_timing_retries + 1,
            )
            prior_attempts[segment.segment_id] = durable_attempts
            for attempt in durable_attempts:
                generator.restore_attempt(attempt)

        progress(
            "translating",
            "Translating each preserved source segment with the pinned offline model.",
        )
        progress(
            "synthesizing",
            "Generating disclosed speech in source order with bounded spend.",
        )
        try:
            multi_outcome = MultiSegmentLocalizationEngine(
                translator=translator,
                generator=generator,
                rewriter=B2ApprovedTranslationRewriter(
                    storage.backend,
                    keys=keys,
                    scope=scope,
                ),
                policy=TimingPolicy(
                    green_threshold=settings.green_drift_threshold,
                    amber_threshold=settings.amber_drift_threshold,
                    max_retries=settings.max_timing_retries,
                ),
                journal=correction_journal,
                completed_timing_loader=completed_timings.get,
                prior_attempts_loader=lambda segment_id: prior_attempts.get(
                    segment_id,
                    (),
                ),
            ).run(
                MultiSegmentLocalizationRequest(
                    project_id=project_id,
                    job_id=job_id,
                    transcript=timed_transcript,
                    source_language="English",
                    target_language="German",
                    protected_terms=protected_terms,
                )
            )
        except RewriteApprovalRequired as exc:
            progress(
                "timing-blocked",
                "Timing QA recorded the first speech attempt and stopped before an unapproved retry.",
            )
            raise TimingCorrectionBlocked(exc.segment_id) from exc

        multi_segment_journal = B2MultiSegmentJournal(
            storage.backend,
            keys=keys,
            scope=scope,
            version=version,
        )
        multi_segment_summary_key = multi_segment_journal.store(multi_outcome)
        if multi_outcome.status == MultiSegmentStatus.HUMAN_REVIEW:
            progress(
                "timing-blocked",
                "A segment exhausted its bounded retry budget and requires human review.",
            )
            raise TimingCorrectionBlocked(
                multi_outcome.stopped_segment_id or "unknown-segment"
            )
        progress(
            "translated",
            "Verified every German segment translation and Genblaze manifest.",
        )
        progress(
            "timing-qa",
            "Measured every segment and selected the bounded timing action.",
        )

        localized_transcript = multi_outcome.to_localized_transcript(
            source="argos-translate-offline-live",
        )
        captions_bytes = to_webvtt(localized_transcript).encode("utf-8")
        put_immutable(
            storage.backend,
            captions_key,
            captions_bytes,
            content_type="text/vtt",
        )
        segment_audio_assets: list[Asset] = []
        for result in multi_outcome.segment_results:
            speech = result.selected_speech
            speech_bytes = _assert_speech_integrity(
                storage.backend,
                asdict(speech),
            )
            speech_path = (
                temp_root
                / f"{result.source_segment.segment_id}-selected.mp3"
            )
            speech_path.write_bytes(speech_bytes)
            segment_audio_assets.append(
                Asset(
                    url=local_file_url(speech_path.resolve()),
                    media_type="audio/mpeg",
                    sha256=_sha256(speech_bytes),
                    size_bytes=len(speech_bytes),
                    duration=speech.generated_seconds,
                    audio=AudioMetadata(codec="mp3"),
                    metadata={
                        "segment_id": result.source_segment.segment_id,
                        "b2_key": speech.audio_key,
                        "genblaze_manifest_key": speech.manifest_key,
                        "selected_timing_attempt": (
                            result.timing.selected_attempt_number
                        ),
                    },
                )
            )

        audio_stage = (
            f"localized-audio-assembly-{version}-"
            f"{AUDIO_ASSEMBLY_POLICY_VERSION}"
        )
        audio_checkpoint = stage_journal.completion(audio_stage)
        if audio_checkpoint is None:
            audio_idempotency = _sha256(
                (
                    f"{job_id}\0{source.sha256}\0"
                    f"{AUDIO_ASSEMBLY_POLICY_VERSION}\0"
                    + "\0".join(
                        asset.sha256 or "" for asset in segment_audio_assets
                    )
                ).encode()
            )
            stage_journal.begin(
                audio_stage,
                idempotency_key=audio_idempotency,
                provider="toluva-segment-audio-assembler",
                model="ffmpeg-segment-audio-v2",
            )
            audio_sink = ObjectStorageSink(
                storage.backend,
                prefix=keys.localized_audio_genblaze_prefix(
                    scope,
                    f"{version}-{AUDIO_ASSEMBLY_POLICY_VERSION}",
                ),
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            try:
                audio_result = (
                    Pipeline(
                        "toluva-live-segment-audio-assembly",
                        tenant_id="toluva-demo",
                        project_id=project_id,
                        preflight=False,
                    )
                    .metadata(
                        job_id=job_id,
                        language=E2E_LANGUAGE,
                        source_key=source_key,
                        segment_count=len(segment_audio_assets),
                        idempotency_key=audio_idempotency,
                    )
                    .step(
                        ToluvaSegmentAudioAssembler(
                            output_dir=temp_root,
                            max_tempo_factor=(
                                1.0 + settings.green_drift_threshold
                            ),
                        ),
                        model="ffmpeg-segment-audio-v2",
                        modality=Modality.AUDIO,
                        expected_duration_sec=source.duration,
                        external_inputs=segment_audio_assets,
                        metadata={
                            "operation": "source_timed_audio_fan_in",
                            "segment_count": len(segment_audio_assets),
                            "assembly_policy_version": (
                                AUDIO_ASSEMBLY_POLICY_VERSION
                            ),
                        },
                        placements=[
                            {
                                "segment_id": result.source_segment.segment_id,
                                "start_seconds": (
                                    result.source_segment.start_seconds
                                ),
                                "end_seconds": (
                                    result.source_segment.end_seconds
                                ),
                            }
                            for result in multi_outcome.segment_results
                        ],
                        target_seconds=source.duration,
                    )
                    .run(
                        sink=audio_sink,
                        raise_on_failure=True,
                        timeout=120,
                        pipeline_timeout=180,
                        max_retries=0,
                    )
                )
                verified_audio = _verified_pipeline_asset(
                    result=audio_result,
                    sink=audio_sink,
                    backend=storage.backend,
                )
                audio_checkpoint = {
                    "asset_key": verified_audio.asset_key,
                    "asset_sha256": verified_audio.asset_sha256,
                    "manifest_key": verified_audio.manifest_key,
                    "manifest_hash": verified_audio.manifest_hash,
                    "run_id": verified_audio.run_id,
                }
                stage_journal.complete(audio_stage, audio_checkpoint)
            except Exception as exc:
                stage_journal.fail(
                    audio_stage,
                    error_type=type(exc).__name__,
                )
                raise
        else:
            resumed.append(audio_stage)
        localized_audio = _verified_checkpoint_asset(
            checkpoint=audio_checkpoint,
            backend=storage.backend,
        )
        speech_path = temp_root / "localized-de.wav"
        captions_path = temp_root / "localized-de.vtt"
        speech_path.write_bytes(localized_audio.bytes)
        captions_path.write_bytes(captions_bytes)

        audio_asset = Asset(
            url=local_file_url(speech_path.resolve()),
            media_type="audio/wav",
            sha256=localized_audio.asset_sha256,
            size_bytes=len(localized_audio.bytes),
            duration=float(source.duration),
            audio=AudioMetadata(codec="pcm_s16le"),
            metadata={
                "b2_key": localized_audio.asset_key,
                "genblaze_manifest_key": localized_audio.manifest_key,
                "segment_count": len(multi_outcome.segment_results),
                "placement_policy": "source-timed-bounded-tempo-fit",
                "assembly_policy_version": AUDIO_ASSEMBLY_POLICY_VERSION,
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
        progress(
            "composing",
            "Fanning source video, selected speech, and captions into the final MP4.",
        )
        composition_stage = f"localized-composition-{version}"
        composition_checkpoint = stage_journal.completion(composition_stage)
        if composition_checkpoint is None:
            composition_idempotency = _sha256(
                (
                    f"{job_id}\0{source.sha256}\0"
                    f"{localized_audio.asset_sha256}\0{_sha256(captions_bytes)}"
                ).encode()
            )
            stage_journal.begin(
                composition_stage,
                idempotency_key=composition_idempotency,
                provider="toluva-ffmpeg-compositor",
                model="ffmpeg-captioned-mp4-v1",
            )
            composition_sink = ObjectStorageSink(
                storage.backend,
                prefix=keys.composition_genblaze_prefix(scope, version),
                key_strategy=KeyStrategy.HIERARCHICAL,
            )
            try:
                composition_result = (
                    Pipeline(
                        "toluva-live-localized-composition",
                        tenant_id="toluva-demo",
                        project_id=project_id,
                        preflight=False,
                    )
                    .metadata(
                        job_id=job_id,
                        language=E2E_LANGUAGE,
                        source_key=source_key,
                        captions_key=captions_key,
                        localized_audio_key=localized_audio.asset_key,
                        selected_speech_keys=tuple(
                            result.selected_speech.audio_key
                            for result in multi_outcome.segment_results
                        ),
                        fan_in_inputs=(
                            "video",
                            "localized_audio",
                            "captions",
                        ),
                        idempotency_key=composition_idempotency,
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
                            "caption_delivery": (
                                "embedded-mov_text-and-sidecar-vtt"
                            ),
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
                    )
                )
                verified_composition = _verified_pipeline_asset(
                    result=composition_result,
                    sink=composition_sink,
                    backend=storage.backend,
                )
                composition_checkpoint = {
                    "asset_key": verified_composition.asset_key,
                    "asset_sha256": verified_composition.asset_sha256,
                    "manifest_key": verified_composition.manifest_key,
                    "manifest_hash": verified_composition.manifest_hash,
                    "run_id": verified_composition.run_id,
                }
                stage_journal.complete(
                    composition_stage,
                    composition_checkpoint,
                )
            except Exception as exc:
                stage_journal.fail(
                    composition_stage,
                    error_type=type(exc).__name__,
                )
                raise
        else:
            resumed.append(composition_stage)
        composition_asset = _verified_checkpoint_asset(
            checkpoint=composition_checkpoint,
            backend=storage.backend,
        )
        generated_output = temp_root / "localized-de-composed.mp4"
        generated_output.write_bytes(composition_asset.bytes)
        stream_types = _stream_types(generated_output)
        final_duration = probe_duration(generated_output)
        if abs(final_duration - float(source.duration)) > 0.05:
            raise EndToEndIntegrityError(
                "Final localized media duration differs from the source"
            )

        durable_dir = (
            settings.work_dir
            / "vertical-slice"
            / project_id
            / job_id
            / version
        ).resolve()
        durable_dir.mkdir(parents=True, exist_ok=True)
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
            "authorization_id": authorization_id,
            "language": E2E_LANGUAGE,
            "source_transcription_provider": "faster-whisper-local",
            "translation_provider": "argos-translate-offline",
            "translation_rewrite_provider": (
                "b2-human-approved-translation-memory"
            ),
            "segment_count": len(multi_outcome.segment_results),
            "human_approval_required_before_publish": True,
            "development_sample": development_sample,
        }
        put_immutable(
            storage.backend,
            disclosure_key,
            _json_bytes(disclosure),
            content_type="application/json",
        )

        translation_results = tuple(
            result.translation for result in multi_outcome.segment_results
        )
        selected_attempts = tuple(
            result.selected_attempt for result in multi_outcome.segment_results
        )
        selected_speeches = tuple(
            result.selected_speech for result in multi_outcome.segment_results
        )
        first_translation = translation_results[0]
        first_speech = selected_speeches[0]
        band_rank = {"green": 0, "amber": 1, "red": 2}
        worst_band = max(
            (attempt.timing_band for attempt in selected_attempts),
            key=lambda value: band_rank.get(value, 99),
        )
        if multi_outcome.red_to_green_segment_ids:
            aggregate_action = "bounded_rewrite_regeneration"
        elif any(
            attempt.timing_action == "pad_silence"
            for attempt in selected_attempts
        ):
            aggregate_action = "segment_silence_padding"
        else:
            aggregate_action = "accept"
        report = LiveEndToEndReport(
            project_id=project_id,
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
            detected_source_text=detected_source_text,
            translation_provider="argos-translate-offline",
            translation_model=ARGOS_MODEL,
            translation_run_id=first_translation.run_id,
            translation_asset_key=first_translation.asset_key,
            translation_manifest_key=first_translation.manifest_key,
            translated_text=" ".join(
                segment.text for segment in localized_transcript.segments
            ),
            protected_terms_preserved=True,
            authorization_code=authorization_decision.code.value,
            timing_status=multi_outcome.status.value,
            timing_band=worst_band,
            timing_action=aggregate_action,
            tts_attempt_count=multi_outcome.total_tts_attempts,
            tts_generated_characters=(
                multi_outcome.total_generated_characters
            ),
            selected_speech_key=first_speech.audio_key,
            selected_speech_manifest_key=first_speech.manifest_key,
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
            transcript_quality_key=transcript_quality_key,
            transcript_quality_decision=transcript_quality_decision,
            transcript_review_key=(
                transcript_review_key
                if transcript_quality_decision == "human-approved"
                else None
            ),
            effective_source_text=" ".join(
                segment.text for segment in timed_transcript.segments
            ),
            multi_segment_summary_key=multi_segment_summary_key,
            segment_results=tuple(
                result.to_dict() for result in multi_outcome.segment_results
            ),
            translation_run_ids=tuple(
                translation.run_id for translation in translation_results
            ),
            translation_asset_keys=tuple(
                translation.asset_key for translation in translation_results
            ),
            translation_manifest_keys=tuple(
                translation.manifest_key
                for translation in translation_results
            ),
            selected_speech_keys=tuple(
                speech.audio_key for speech in selected_speeches
            ),
            selected_speech_manifest_keys=tuple(
                speech.manifest_key for speech in selected_speeches
            ),
            localized_audio_run_id=localized_audio.run_id,
            localized_audio_asset_key=localized_audio.asset_key,
            localized_audio_manifest_key=localized_audio.manifest_key,
            red_to_green_segment_ids=(
                multi_outcome.red_to_green_segment_ids
            ),
            resumed_segment_ids=multi_outcome.resumed_segment_ids,
        )
        put_immutable(
            storage.backend,
            final_record_key,
            _json_bytes(report.to_durable_dict()),
            content_type="application/json",
        )
        (durable_dir / "report.json").write_bytes(_json_bytes(report.to_dict()))
        progress(
            "completed",
            "Verified the final B2 bytes and published the immutable final record.",
        )
        return report
