"""Zero-new-credit composition slice using the verified live timing output."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
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
from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.transcript import (
    TimedSegment,
    TimedTranscript,
    to_webvtt,
)
from toluva_pipeline.live_timing_correction import (
    LIVE_CORRECTED_TRANSLATION,
    LIVE_JOB_ID,
    LIVE_LANGUAGE,
    LIVE_PROJECT_ID,
    LIVE_SEGMENT_ID,
    LIVE_TARGET_SECONDS,
)
from toluva_pipeline.media import probe_duration, probe_media
from toluva_pipeline.providers.compositor import ToluvaFFmpegCompositor
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import (
    CredentialConfigurationError,
    build_b2_storage,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable

COMPOSITION_VERSION = "composition-v1"
SOURCE_ASSET_ID = "composition-source-v1"
SOURCE_TRANSCRIPT_VERSION = "composition-v1"


class ExistingCompositionRunError(RuntimeError):
    """Raised before composition when the stable final record already exists."""


class CompositionIntegrityError(RuntimeError):
    """Raised when an input or output fails independent integrity checks."""


@dataclass(frozen=True)
class LiveCompositionReport:
    project_id: str
    job_id: str
    language: str
    source_key: str
    transcript_key: str
    segments_key: str
    captions_key: str
    selected_speech_key: str
    selected_speech_manifest_key: str
    selected_speech_hash_matches: bool
    composition_run_id: str
    composition_manifest_key: str
    composition_manifest_hash: str
    final_asset_key: str
    final_asset_sha256: str
    final_asset_hash_matches: bool
    final_duration_seconds: float
    stream_types: tuple[str, ...]
    captions_embedded: bool
    disclosure_key: str
    final_record_key: str
    local_output_path: str
    live_tts_reused: bool
    new_provider_credits_spent: int

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

    def to_durable_dict(self) -> dict[str, object]:
        payload = self.to_dict()
        payload.pop("local_output_path", None)
        return payload


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _create_source_fixture(path: Path, *, duration_seconds: float) -> None:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        (
            "color=c=0x0B1716:s=1280x720:r=30:"
            f"d={duration_seconds:.6f}"
        ),
        "-vf",
        (
            "drawbox=x=0:y=0:w=iw:h=18:color=0xB9FF66:t=fill,"
            "drawbox=x=96:y=240:w=1088:h=240:color=0x173C37:t=fill"
        ),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "1",
        "-x264-params",
        "threads=1:lookahead_threads=1:sliced_threads=0",
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        "-flags:v",
        "+bitexact",
        "-movflags",
        "+faststart",
        "-y",
        str(path),
    ]
    subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _load_selected_speech(
    *,
    backend: S3StorageBackend,
    keys: ToluvaObjectKeys,
    scope: StorageScope,
) -> tuple[dict[str, object], bytes]:
    timing_summary_key = keys.timing_summary(scope, LIVE_SEGMENT_ID)
    summary_bytes = backend.get(timing_summary_key)
    summary = json.loads(summary_bytes)
    selected_number = summary["selected_attempt_number"]
    selected = next(
        attempt
        for attempt in summary["attempts"]
        if attempt["context"]["attempt_number"] == selected_number
    )
    speech = selected["speech"]
    audio_bytes = backend.get(speech["audio_key"])
    manifest_bytes = backend.get(speech["manifest_key"])
    manifest = Manifest.model_validate_json(manifest_bytes)
    if not manifest.verify():
        raise CompositionIntegrityError("Selected speech manifest failed verification")
    declared_asset = next(
        (
            asset
            for step in manifest.run.steps
            for asset in step.assets
            if asset.sha256 == _sha256(audio_bytes)
        ),
        None,
    )
    if declared_asset is None:
        raise CompositionIntegrityError(
            "Selected speech bytes do not match the stored Genblaze manifest"
        )
    return speech, audio_bytes


def _stream_types(probe: dict[str, object]) -> tuple[str, ...]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise CompositionIntegrityError("ffprobe returned no stream list")
    values = tuple(
        stream.get("codec_type", "")
        for stream in streams
        if isinstance(stream, dict)
    )
    if not {"video", "audio", "subtitle"}.issubset(values):
        raise CompositionIntegrityError(
            "Final MP4 must contain video, audio, and subtitle streams"
        )
    return values


def run_live_composition(
    settings: Settings,
    *,
    job_id: str = LIVE_JOB_ID,
) -> LiveCompositionReport:
    """Compose the verified green audio without making a new model call."""

    if not settings.b2_ready:
        raise CredentialConfigurationError("Backblaze B2 is not configured")

    scope = StorageScope(LIVE_PROJECT_ID, job_id, LIVE_LANGUAGE)
    keys = ToluvaObjectKeys(LIVE_PROJECT_ID)
    storage = build_b2_storage(settings, scope, preflight=True)
    final_record_key = keys.final_record(scope, COMPOSITION_VERSION)
    if storage.backend.exists(final_record_key):
        raise ExistingCompositionRunError(
            "This job already has a durable final composition record."
        )

    speech, audio_bytes = _load_selected_speech(
        backend=storage.backend,
        keys=keys,
        scope=scope,
    )
    source_key = keys.source_master(SOURCE_ASSET_ID, "mp4")
    transcript_key = keys.transcript(SOURCE_TRANSCRIPT_VERSION)
    segments_key = keys.segments(SOURCE_TRANSCRIPT_VERSION)
    captions_key = keys.captions(scope, COMPOSITION_VERSION)
    disclosure_key = keys.disclosure(scope, COMPOSITION_VERSION)

    with tempfile.TemporaryDirectory(prefix="toluva-compose-") as temp_dir:
        temp_root = Path(temp_dir)
        source_path = temp_root / "source.mp4"
        audio_path = temp_root / "localized.mp3"
        captions_path = temp_root / "captions.vtt"
        _create_source_fixture(source_path, duration_seconds=LIVE_TARGET_SECONDS)
        audio_path.write_bytes(audio_bytes)

        source_bytes = source_path.read_bytes()
        source_sha256 = _sha256(source_bytes)
        source_transcript = TimedTranscript(
            language="en-US",
            source="human-reviewed-spike-fixture",
            source_asset_sha256=source_sha256,
            segments=(
                TimedSegment(
                    segment_id=LIVE_SEGMENT_ID,
                    start_seconds=0.0,
                    end_seconds=LIVE_TARGET_SECONDS,
                    text="Welcome to Toluva. One message, many languages.",
                    speaker_id="fixture-speaker",
                ),
            ),
        )
        localized_captions = TimedTranscript(
            language=LIVE_LANGUAGE,
            source="human-reviewed-scripted-spike",
            source_asset_sha256=source_sha256,
            segments=(
                TimedSegment(
                    segment_id=LIVE_SEGMENT_ID,
                    start_seconds=0.0,
                    end_seconds=LIVE_TARGET_SECONDS,
                    text=LIVE_CORRECTED_TRANSLATION,
                    speaker_id="elevenlabs-stock-voice",
                ),
            ),
        )
        captions_bytes = to_webvtt(localized_captions).encode("utf-8")
        captions_path.write_bytes(captions_bytes)
        transcript_bytes = (
            json.dumps(
                {
                    "schema_version": "1.0",
                    "record_type": "timed_transcript",
                    **source_transcript.to_dict(),
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
        segments_bytes = (
            json.dumps(
                {
                    "schema_version": "1.0",
                    "record_type": "timed_segments",
                    "segments": [
                        asdict(segment) for segment in source_transcript.segments
                    ],
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")

        put_immutable(
            storage.backend,
            source_key,
            source_bytes,
            content_type="video/mp4",
        )
        put_immutable(
            storage.backend,
            transcript_key,
            transcript_bytes,
            content_type="application/json",
        )
        put_immutable(
            storage.backend,
            segments_key,
            segments_bytes,
            content_type="application/json",
        )
        put_immutable(
            storage.backend,
            captions_key,
            captions_bytes,
            content_type="text/vtt",
        )

        source_asset = Asset(
            url=local_file_url(source_path.resolve()),
            media_type="video/mp4",
            sha256=source_sha256,
            size_bytes=len(source_bytes),
            width=1280,
            height=720,
            duration=probe_duration(source_path),
            video=VideoMetadata(
                frame_rate=30.0,
                codec="h264",
                resolution="1280x720",
                has_audio=False,
            ),
            metadata={"b2_key": source_key, "fixture": True},
        )
        audio_asset = Asset(
            url=local_file_url(audio_path.resolve()),
            media_type="audio/mpeg",
            sha256=_sha256(audio_bytes),
            size_bytes=len(audio_bytes),
            duration=float(speech["generated_seconds"]),
            audio=AudioMetadata(codec="mp3"),
            metadata={
                "b2_key": speech["audio_key"],
                "genblaze_manifest_key": speech["manifest_key"],
                "selected_timing_attempt": True,
            },
        )
        captions_asset = Asset(
            url=local_file_url(captions_path.resolve()),
            media_type="text/vtt",
            sha256=_sha256(captions_bytes),
            size_bytes=len(captions_bytes),
            duration=LIVE_TARGET_SECONDS,
            metadata={"b2_key": captions_key, "language": LIVE_LANGUAGE},
        )
        sink = ObjectStorageSink(
            storage.backend,
            prefix=keys.composition_genblaze_prefix(
                scope,
                COMPOSITION_VERSION,
            ),
            key_strategy=KeyStrategy.HIERARCHICAL,
        )
        local_outputs: list[str] = []

        def capture_local_output(event: object) -> None:
            step_event = getattr(event, "step", None)
            assets = getattr(step_event, "assets", None)
            if assets:
                local_outputs.append(assets[0].url)

        result = (
            Pipeline(
                "toluva-localized-composition",
                tenant_id="toluva-demo",
                project_id=LIVE_PROJECT_ID,
                preflight=False,
            )
            .metadata(
                job_id=job_id,
                language=LIVE_LANGUAGE,
                source_key=source_key,
                captions_key=captions_key,
                selected_speech_key=speech["audio_key"],
                fan_in_inputs=("video", "localized_audio", "captions"),
            )
            .step(
                ToluvaFFmpegCompositor(output_dir=temp_root),
                model="ffmpeg-captioned-mp4-v1",
                modality=Modality.VIDEO,
                expected_duration_sec=LIVE_TARGET_SECONDS,
                external_inputs=[source_asset, audio_asset, captions_asset],
                metadata={
                    "operation": "localized_video_fan_in",
                    "input_count": 3,
                    "caption_delivery": "embedded-mov_text-and-sidecar-vtt",
                },
                target_seconds=LIVE_TARGET_SECONDS,
                subtitle_language="deu",
            )
            .run(
                sink=sink,
                raise_on_failure=True,
                timeout=120,
                pipeline_timeout=180,
                max_retries=0,
                on_step_complete=capture_local_output,
            )
        )
        if not local_outputs:
            raise RuntimeError("Genblaze did not expose the local composition output")
        output_url = urlparse(local_outputs[0])
        if output_url.scheme != "file":
            raise RuntimeError("Expected a local composition output before transfer")
        local_output = Path(unquote(output_url.path))
        output_probe = probe_media(local_output)
        stream_types = _stream_types(output_probe)
        final_duration = probe_duration(local_output)
        if abs(final_duration - LIVE_TARGET_SECONDS) > 0.05:
            raise CompositionIntegrityError(
                "Final composition duration does not match the source slot"
            )

        final_asset = result.run.steps[0].assets[0]
        final_asset_key = storage.backend.key_from_url(final_asset.url)
        if final_asset_key is None or final_asset.sha256 is None:
            raise CompositionIntegrityError(
                "Could not resolve the stored final asset identity"
            )
        stored_final = storage.backend.get(final_asset_key)
        final_hash_matches = _sha256(stored_final) == final_asset.sha256
        stored_manifest = sink.read_manifest(result.run, verify=True)
        if not final_hash_matches or not stored_manifest.verify():
            raise CompositionIntegrityError(
                "Stored composition manifest or final asset verification failed"
            )

        local_dir = (
            settings.work_dir / "vertical-slice" / job_id / COMPOSITION_VERSION
        ).resolve()
        local_dir.mkdir(parents=True, exist_ok=False)
        durable_local_output = local_dir / "localized-de.mp4"
        shutil.copy2(local_output, durable_local_output)

        disclosure = {
            "schema_version": "1.0",
            "record_type": "synthetic_media_disclosure",
            "synthetic_voice": True,
            "voice_type": "stock",
            "voice_provider": "elevenlabs-tts",
            "voice_model": "eleven_flash_v2_5",
            "authorization_id": "auth-stock-timing-v1",
            "language": LIVE_LANGUAGE,
            "caption_delivery": "embedded-mov_text-and-sidecar-vtt",
            "human_approval_required_before_publish": True,
        }
        put_immutable(
            storage.backend,
            disclosure_key,
            (json.dumps(disclosure, indent=2, sort_keys=True) + "\n").encode(
                "utf-8"
            ),
            content_type="application/json",
        )

        report = LiveCompositionReport(
            project_id=LIVE_PROJECT_ID,
            job_id=job_id,
            language=LIVE_LANGUAGE,
            source_key=source_key,
            transcript_key=transcript_key,
            segments_key=segments_key,
            captions_key=captions_key,
            selected_speech_key=str(speech["audio_key"]),
            selected_speech_manifest_key=str(speech["manifest_key"]),
            selected_speech_hash_matches=True,
            composition_run_id=result.run.run_id,
            composition_manifest_key=sink.manifest_key_for(result.run),
            composition_manifest_hash=result.manifest.canonical_hash,
            final_asset_key=final_asset_key,
            final_asset_sha256=final_asset.sha256,
            final_asset_hash_matches=final_hash_matches,
            final_duration_seconds=final_duration,
            stream_types=stream_types,
            captions_embedded="subtitle" in stream_types,
            disclosure_key=disclosure_key,
            final_record_key=final_record_key,
            local_output_path=str(durable_local_output),
            live_tts_reused=True,
            new_provider_credits_spent=0,
        )
        durable_report_bytes = (
            json.dumps(report.to_durable_dict(), indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        put_immutable(
            storage.backend,
            final_record_key,
            durable_report_bytes,
            content_type="application/json",
        )
        report_bytes = (
            json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        (local_dir / "report.json").write_bytes(report_bytes)
        (local_dir / "captions.vtt").write_bytes(captions_bytes)
        return report
