"""Genblaze fan-in provider for video, localized audio, and WebVTT captions."""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
from pathlib import Path
from shutil import which
from urllib.parse import unquote, urlparse

from genblaze_core import (
    Asset,
    AudioMetadata,
    Modality,
    ProviderCapabilities,
    Step,
    StepType,
    SyncProvider,
    Track,
    VideoMetadata,
)
from genblaze_core._utils import local_file_url
from genblaze_core.exceptions import ProviderError
from genblaze_core.models.enums import ProviderErrorCode
from genblaze_core.runnable.config import RunnableConfig

from toluva_pipeline.media import probe_duration


def _local_path(asset: Asset) -> Path:
    parsed = urlparse(asset.url)
    if parsed.scheme != "file":
        raise ProviderError(
            "Toluva compositor inputs must be materialized as local files.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    path = Path(unquote(parsed.path)).resolve()
    if not path.is_file():
        raise ProviderError(
            f"Compositor input does not exist: {path.name}",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    return path


def _first_asset(inputs: list[Asset], prefix: str) -> Asset | None:
    return next(
        (asset for asset in inputs if asset.media_type.startswith(prefix)),
        None,
    )


def build_composition_command(
    *,
    ffmpeg_path: str,
    video_path: Path,
    audio_path: Path,
    captions_path: Path,
    output_path: Path,
    target_seconds: float,
    subtitle_language: str,
) -> list[str]:
    if target_seconds <= 0:
        raise ValueError("target_seconds must be positive")
    return [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-i",
        str(captions_path),
        "-filter_complex",
        f"[1:a]apad=whole_dur={target_seconds:.6f}[localized_audio]",
        "-map",
        "0:v:0",
        "-map",
        "[localized_audio]",
        "-map",
        "2:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-c:s",
        "mov_text",
        "-t",
        f"{target_seconds:.6f}",
        "-metadata:s:s:0",
        f"language={subtitle_language}",
        "-metadata:s:s:0",
        "title=Localized captions",
        "-disposition:s:0",
        "default",
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        "-flags:a",
        "+bitexact",
        "-threads",
        "1",
        "-movflags",
        "+faststart",
        "-y",
        str(output_path),
    ]


class ToluvaFFmpegCompositor(SyncProvider):
    """Compose three explicit inputs and preserve captions as an MP4 track."""

    name = "toluva-ffmpeg-compositor"

    def __init__(
        self,
        *,
        output_dir: Path | None = None,
        ffmpeg_path: str = "ffmpeg",
        timeout: float = 120,
    ) -> None:
        super().__init__()
        self._output_dir = output_dir
        self._ffmpeg_path = ffmpeg_path
        self._timeout = timeout

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.VIDEO],
            supported_inputs=["video", "audio", "text/vtt"],
            accepts_chain_input=True,
            output_formats=["video/mp4"],
        )

    def generate(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> Step:
        video_asset = _first_asset(step.inputs, "video/")
        audio_asset = _first_asset(step.inputs, "audio/")
        captions_asset = _first_asset(step.inputs, "text/vtt")
        if video_asset is None or audio_asset is None or captions_asset is None:
            raise ProviderError(
                "Composition requires video, audio, and text/vtt inputs.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        target_seconds = float(
            step.params.get("target_seconds")
            or step.expected_duration_sec
            or video_asset.duration
            or 0
        )
        if target_seconds <= 0:
            raise ProviderError(
                "Composition requires a positive target duration.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        ffmpeg_bin = which(self._ffmpeg_path)
        if ffmpeg_bin is None:
            raise ProviderError(
                "ffmpeg is required for composition.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        output_root = self._output_dir or Path(tempfile.gettempdir())
        output_root.mkdir(parents=True, exist_ok=True)
        output_path = output_root / f"{step.step_id}.mp4"
        command = build_composition_command(
            ffmpeg_path=ffmpeg_bin,
            video_path=_local_path(video_asset),
            audio_path=_local_path(audio_asset),
            captions_path=_local_path(captions_asset),
            output_path=output_path,
            target_seconds=target_seconds,
            subtitle_language=str(step.params.get("subtitle_language", "und")),
        )
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self._timeout,
            )
        except subprocess.CalledProcessError as exc:
            raise ProviderError(
                "FFmpeg composition failed; inspect protected worker logs.",
                error_code=ProviderErrorCode.UNKNOWN,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ProviderError(
                "FFmpeg composition exceeded its bounded timeout.",
                error_code=ProviderErrorCode.TIMEOUT,
            ) from exc

        output_bytes = output_path.read_bytes()
        output_duration = probe_duration(output_path)
        output = Asset(
            url=local_file_url(output_path.resolve()),
            media_type="video/mp4",
            sha256=hashlib.sha256(output_bytes).hexdigest(),
            size_bytes=len(output_bytes),
            width=video_asset.width,
            height=video_asset.height,
            duration=output_duration,
            video=VideoMetadata(
                codec=(
                    video_asset.video.codec
                    if video_asset.video is not None
                    else "h264"
                ),
                frame_rate=(
                    video_asset.video.frame_rate
                    if video_asset.video is not None
                    else None
                ),
                resolution=(
                    video_asset.video.resolution
                    if video_asset.video is not None
                    else None
                ),
                has_audio=True,
            ),
            audio=AudioMetadata(codec="aac"),
            tracks=[
                Track(kind="video", codec="h264", label="source-video"),
                Track(kind="audio", codec="aac", label="localized-audio"),
                Track(kind="subtitle", codec="mov_text", label="localized-captions"),
            ],
            metadata={
                "caption_delivery": "embedded-mov_text",
                "audio_fit": "silence-padded-to-source-slot",
            },
        )
        step.assets.append(output)
        step.step_type = StepType.MIX
        return step
