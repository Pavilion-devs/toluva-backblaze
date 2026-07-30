"""Collision-checked assembly of localized speech segments."""

from __future__ import annotations

import hashlib
import math
import subprocess
import tempfile
from dataclasses import dataclass
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
)
from genblaze_core._utils import local_file_url
from genblaze_core.exceptions import ProviderError
from genblaze_core.models.enums import ProviderErrorCode
from genblaze_core.runnable.config import RunnableConfig

from toluva_pipeline.media import probe_duration


def _local_audio_path(asset: Asset) -> Path:
    parsed = urlparse(asset.url)
    if parsed.scheme != "file":
        raise ProviderError(
            "Segment audio inputs must be materialized as local files.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    path = Path(unquote(parsed.path)).resolve()
    if not path.is_file():
        raise ProviderError(
            f"Segment audio input does not exist: {path.name}",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    return path


@dataclass(frozen=True)
class SegmentAudioPlacement:
    segment_id: str
    start_seconds: float
    end_seconds: float

    def __post_init__(self) -> None:
        if not self.segment_id.strip():
            raise ValueError("segment_id must not be empty")
        if not all(
            math.isfinite(value)
            for value in (self.start_seconds, self.end_seconds)
        ):
            raise ValueError("segment placement timing must be finite")
        if self.start_seconds < 0:
            raise ValueError("segment placement start must be non-negative")
        if self.end_seconds <= self.start_seconds:
            raise ValueError("segment placement end must be greater than start")


def validate_segment_audio_placements(
    placements: tuple[SegmentAudioPlacement, ...],
    audio_durations: tuple[float, ...],
    *,
    target_seconds: float,
    collision_tolerance_seconds: float = 0.04,
) -> None:
    if not placements:
        raise ValueError("at least one segment placement is required")
    if len(placements) != len(audio_durations):
        raise ValueError("every segment placement requires one audio duration")
    if not math.isfinite(target_seconds) or target_seconds <= 0:
        raise ValueError("target_seconds must be positive and finite")
    if (
        not math.isfinite(collision_tolerance_seconds)
        or collision_tolerance_seconds < 0
    ):
        raise ValueError("collision tolerance must be finite and non-negative")

    seen: set[str] = set()
    previous_end = 0.0
    for index, (placement, duration) in enumerate(
        zip(placements, audio_durations, strict=True)
    ):
        if placement.segment_id in seen:
            raise ValueError("segment placement IDs must be unique")
        if placement.start_seconds < previous_end:
            raise ValueError("source segment placements must not overlap")
        if placement.end_seconds > target_seconds:
            raise ValueError("segment placement exceeds target duration")
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("audio durations must be positive and finite")
        next_start = (
            placements[index + 1].start_seconds
            if index + 1 < len(placements)
            else target_seconds
        )
        generated_end = placement.start_seconds + duration
        if generated_end > next_start + collision_tolerance_seconds:
            raise ValueError(
                f"localized speech for {placement.segment_id} collides with "
                "the next segment"
            )
        seen.add(placement.segment_id)
        previous_end = placement.end_seconds


def build_segment_audio_command(
    *,
    ffmpeg_path: str,
    audio_paths: tuple[Path, ...],
    placements: tuple[SegmentAudioPlacement, ...],
    output_path: Path,
    target_seconds: float,
) -> list[str]:
    if len(audio_paths) != len(placements) or not audio_paths:
        raise ValueError("audio paths and placements must be non-empty and aligned")
    command = [ffmpeg_path, "-hide_banner", "-loglevel", "error"]
    for path in audio_paths:
        command.extend(("-i", str(path)))

    filters: list[str] = []
    labels: list[str] = []
    for index, placement in enumerate(placements):
        label = f"segment_audio_{index}"
        delay_ms = round(placement.start_seconds * 1000)
        filters.append(
            f"[{index}:a]aresample=48000,"
            "aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={delay_ms}:all=1[{label}]"
        )
        labels.append(f"[{label}]")
    filters.append(
        "".join(labels)
        + f"amix=inputs={len(labels)}:duration=longest:normalize=0,"
        f"apad=pad_dur={target_seconds:.6f},"
        f"atrim=0:{target_seconds:.6f}[localized_master]"
    )
    command.extend(
        (
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[localized_master]",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-t",
            f"{target_seconds:.6f}",
            "-map_metadata",
            "-1",
            "-fflags",
            "+bitexact",
            "-threads",
            "1",
            "-y",
            str(output_path),
        )
    )
    return command


class ToluvaSegmentAudioAssembler(SyncProvider):
    """Fan accepted segment speech into one source-timed audio master."""

    name = "toluva-segment-audio-assembler"

    def __init__(
        self,
        *,
        output_dir: Path | None = None,
        ffmpeg_path: str = "ffmpeg",
        timeout: float = 120,
        collision_tolerance_seconds: float = 0.04,
    ) -> None:
        super().__init__()
        self._output_dir = output_dir
        self._ffmpeg_path = ffmpeg_path
        self._timeout = timeout
        self._collision_tolerance_seconds = collision_tolerance_seconds

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.AUDIO],
            supported_inputs=["audio"],
            accepts_chain_input=True,
            output_formats=["audio/wav"],
        )

    def generate(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> Step:
        audio_assets = tuple(
            asset
            for asset in step.inputs
            if asset.media_type.startswith("audio/")
        )
        raw_placements = step.params.get("placements")
        if not isinstance(raw_placements, (list, tuple)):
            raise ProviderError(
                "Audio assembly requires segment placements.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        try:
            placements = tuple(
                SegmentAudioPlacement(
                    segment_id=str(item["segment_id"]),
                    start_seconds=float(item["start_seconds"]),
                    end_seconds=float(item["end_seconds"]),
                )
                for item in raw_placements
                if isinstance(item, dict)
            )
            if len(placements) != len(raw_placements):
                raise ValueError("segment placements must be objects")
            target_seconds = float(
                step.params.get("target_seconds")
                or step.expected_duration_sec
                or 0
            )
            durations = tuple(
                float(asset.duration or 0) for asset in audio_assets
            )
            validate_segment_audio_placements(
                placements,
                durations,
                target_seconds=target_seconds,
                collision_tolerance_seconds=self._collision_tolerance_seconds,
            )
            for asset, placement in zip(
                audio_assets,
                placements,
                strict=True,
            ):
                segment_id = asset.metadata.get("segment_id")
                if segment_id != placement.segment_id:
                    raise ValueError(
                        "audio asset order does not match segment placements"
                    )
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderError(
                "Localized segment audio cannot be assembled safely.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            ) from exc

        ffmpeg_bin = which(self._ffmpeg_path)
        if ffmpeg_bin is None:
            raise ProviderError(
                "ffmpeg is required for segment audio assembly.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        output_root = self._output_dir or Path(tempfile.gettempdir())
        output_root.mkdir(parents=True, exist_ok=True)
        output_path = output_root / f"{step.step_id}.wav"
        command = build_segment_audio_command(
            ffmpeg_path=ffmpeg_bin,
            audio_paths=tuple(
                _local_audio_path(asset) for asset in audio_assets
            ),
            placements=placements,
            output_path=output_path,
            target_seconds=target_seconds,
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
                "FFmpeg segment audio assembly failed.",
                error_code=ProviderErrorCode.UNKNOWN,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ProviderError(
                "Segment audio assembly exceeded its bounded timeout.",
                error_code=ProviderErrorCode.TIMEOUT,
            ) from exc

        output_bytes = output_path.read_bytes()
        output_duration = probe_duration(output_path)
        if abs(output_duration - target_seconds) > 0.05:
            raise ProviderError(
                "Segment audio master duration does not match the source.",
                error_code=ProviderErrorCode.UNKNOWN,
            )
        step.assets.append(
            Asset(
                url=local_file_url(output_path.resolve()),
                media_type="audio/wav",
                sha256=hashlib.sha256(output_bytes).hexdigest(),
                size_bytes=len(output_bytes),
                duration=output_duration,
                audio=AudioMetadata(codec="pcm_s16le"),
                tracks=[
                    Track(
                        kind="audio",
                        codec="pcm_s16le",
                        label="localized-segment-master",
                    )
                ],
                metadata={
                    "segment_count": len(placements),
                    "segment_ids": [
                        placement.segment_id for placement in placements
                    ],
                    "placement_policy": "source-timed-collision-checked",
                    "silence_policy": "preserve-source-gaps",
                },
            )
        )
        step.step_type = StepType.MIX
        return step
