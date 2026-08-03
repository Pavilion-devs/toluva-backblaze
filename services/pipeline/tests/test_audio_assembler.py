import hashlib
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

import pytest
from genblaze_core import (
    Asset,
    AudioMetadata,
    Modality,
    Pipeline,
    VideoMetadata,
)
from genblaze_core._utils import local_file_url

from toluva_pipeline.media import probe_duration, probe_media
from toluva_pipeline.providers.audio_assembler import (
    SegmentAudioPlacement,
    ToluvaSegmentAudioAssembler,
    build_segment_audio_command,
    segment_audio_tempo_factors,
    validate_segment_audio_placements,
)
from toluva_pipeline.providers.compositor import ToluvaFFmpegCompositor


def _tone(path: Path, *, frequency: int, duration: float) -> Asset:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={frequency}:duration={duration}",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-map_metadata",
            "-1",
            "-y",
            str(path),
        ],
        check=True,
    )
    data = path.read_bytes()
    return Asset(
        url=local_file_url(path.resolve()),
        media_type="audio/wav",
        sha256=hashlib.sha256(data).hexdigest(),
        size_bytes=len(data),
        duration=probe_duration(path),
        audio=AudioMetadata(codec="pcm_s16le"),
        metadata={"segment_id": path.stem},
    )


def placements() -> tuple[SegmentAudioPlacement, ...]:
    return (
        SegmentAudioPlacement("segment-001", 0.0, 1.0),
        SegmentAudioPlacement("segment-002", 1.2, 2.2),
        SegmentAudioPlacement("segment-003", 2.4, 3.4),
    )


def test_audio_assembly_command_places_each_segment_on_source_timing(
    tmp_path: Path,
) -> None:
    command = build_segment_audio_command(
        ffmpeg_path="ffmpeg",
        audio_paths=(
            tmp_path / "segment-001.wav",
            tmp_path / "segment-002.wav",
            tmp_path / "segment-003.wav",
        ),
        audio_durations=(0.9, 1.0, 0.8),
        placements=placements(),
        output_path=tmp_path / "master.wav",
        target_seconds=4.0,
    )
    filters = command[command.index("-filter_complex") + 1]
    assert "adelay=0:all=1[segment_audio_0]" in filters
    assert "adelay=1200:all=1[segment_audio_1]" in filters
    assert "adelay=2400:all=1[segment_audio_2]" in filters
    assert "anullsrc=r=48000:cl=stereo:d=4.000000[source_silence]" in filters
    assert "amix=inputs=4" in filters
    assert "atrim=0:4.000000[localized_master]" in filters


def test_audio_assembly_command_tempo_fits_green_overlong_speech(
    tmp_path: Path,
) -> None:
    proof_placements = (
        SegmentAudioPlacement("segment-001", 0.0, 2.58),
        SegmentAudioPlacement("segment-002", 2.58, 5.73),
        SegmentAudioPlacement("segment-003", 5.73, 12.419),
    )
    proof_durations = (2.35102, 3.291429, 5.851429)
    validate_segment_audio_placements(
        proof_placements,
        proof_durations,
        target_seconds=12.418,
    )
    command = build_segment_audio_command(
        ffmpeg_path="ffmpeg",
        audio_paths=(
            tmp_path / "segment-001.wav",
            tmp_path / "segment-002.wav",
            tmp_path / "segment-003.wav",
        ),
        audio_durations=proof_durations,
        placements=proof_placements,
        output_path=tmp_path / "master.wav",
        target_seconds=12.418,
    )
    filters = command[command.index("-filter_complex") + 1]
    assert "[1:a]atempo=1.044898,aresample=48000" in filters
    assert "[0:a]atempo=" not in filters
    assert "[2:a]atempo=" not in filters
    assert segment_audio_tempo_factors(
        proof_placements,
        proof_durations,
    ) == pytest.approx((1.0, 1.044898095238095, 1.0))


def test_collision_check_rejects_speech_that_reaches_next_segment() -> None:
    with pytest.raises(ValueError, match="collides"):
        validate_segment_audio_placements(
            placements(),
            (0.9, 1.30, 0.8),
            target_seconds=4.0,
        )


def test_collision_check_accepts_only_bounded_tempo_fit() -> None:
    validate_segment_audio_placements(
        placements(),
        (0.9, 1.08, 0.8),
        target_seconds=4.0,
    )
    with pytest.raises(ValueError, match="collides"):
        validate_segment_audio_placements(
            placements(),
            (0.9, 1.08001, 0.8),
            target_seconds=4.0,
        )


def test_one_hash_approved_segment_can_use_the_109_local_cap() -> None:
    local_placements = (
        SegmentAudioPlacement("segment-001", 0.0, 1.0),
        SegmentAudioPlacement(
            "segment-002",
            1.0,
            2.0,
            approved_max_tempo_factor=1.09,
        ),
    )
    assert segment_audio_tempo_factors(
        local_placements,
        (0.9, 1.0888),
    ) == pytest.approx((1.0, 1.0888))
    with pytest.raises(ValueError, match="bounded tempo-fit"):
        segment_audio_tempo_factors(
            local_placements,
            (0.9, 1.09001),
        )


def test_placement_end_allows_only_timestamp_rounding_tolerance() -> None:
    rounded_placements = (
        SegmentAudioPlacement("segment-001", 0.0, 1.0),
        SegmentAudioPlacement("segment-002", 1.0, 2.0),
        SegmentAudioPlacement("segment-003", 2.0, 4.001),
    )
    validate_segment_audio_placements(
        rounded_placements,
        (0.9, 0.9, 0.9),
        target_seconds=4.0,
    )
    with pytest.raises(ValueError, match="exceeds target duration"):
        validate_segment_audio_placements(
            (
                *rounded_placements[:2],
                SegmentAudioPlacement("segment-003", 2.0, 4.041),
            ),
            (0.9, 0.9, 0.9),
            target_seconds=4.0,
        )


def test_genblaze_assembler_builds_exact_source_length_master(
    tmp_path: Path,
) -> None:
    assets = (
        _tone(tmp_path / "segment-001.wav", frequency=330, duration=0.90),
        _tone(tmp_path / "segment-002.wav", frequency=440, duration=1.00),
        _tone(tmp_path / "segment-003.wav", frequency=550, duration=0.80),
    )
    result = (
        Pipeline("multi-segment-audio-test", preflight=False)
        .step(
            ToluvaSegmentAudioAssembler(output_dir=tmp_path / "output"),
            model="ffmpeg-segment-audio-v1",
            modality=Modality.AUDIO,
            expected_duration_sec=4.0,
            external_inputs=list(assets),
            placements=[
                {
                    "segment_id": placement.segment_id,
                    "start_seconds": placement.start_seconds,
                    "end_seconds": placement.end_seconds,
                }
                for placement in placements()
            ],
            target_seconds=4.0,
        )
        .run(raise_on_failure=True, max_retries=0)
    )

    output = result.run.steps[0].assets[0]
    output_path = Path(unquote(urlparse(output.url).path))
    assert output.media_type == "audio/wav"
    assert output.metadata["segment_count"] == 3
    assert output.metadata["placement_policy"] == (
        "source-timed-bounded-tempo-fit"
    )
    assert output.metadata["tempo_adjusted_segment_ids"] == []
    assert output.metadata["post_fit_durations"] == pytest.approx(
        {
            "segment-001": 0.9,
            "segment-002": 1.0,
            "segment-003": 0.8,
        }
    )
    assert abs(probe_duration(output_path) - 4.0) <= 0.05
    assert output.sha256 == hashlib.sha256(output_path.read_bytes()).hexdigest()
    assert result.manifest.verify()


def test_genblaze_assembler_executes_bounded_tempo_fit(tmp_path: Path) -> None:
    audio_assets = (
        _tone(tmp_path / "segment-001.wav", frequency=330, duration=0.90),
        _tone(
            tmp_path / "segment-002.wav",
            frequency=440,
            duration=1.044898,
        ),
        _tone(tmp_path / "segment-003.wav", frequency=550, duration=0.80),
    )
    result = (
        Pipeline("bounded-tempo-fit-test", preflight=False)
        .step(
            ToluvaSegmentAudioAssembler(output_dir=tmp_path / "output"),
            model="ffmpeg-segment-audio-v2",
            modality=Modality.AUDIO,
            expected_duration_sec=4.0,
            external_inputs=list(audio_assets),
            placements=[
                {
                    "segment_id": placement.segment_id,
                    "start_seconds": placement.start_seconds,
                    "end_seconds": placement.end_seconds,
                }
                for placement in placements()
            ],
            target_seconds=4.0,
        )
        .run(raise_on_failure=True, max_retries=0)
    )
    output = result.run.steps[0].assets[0]

    assert output.metadata["tempo_adjusted_segment_ids"] == ["segment-002"]
    assert output.metadata["tempo_factors"]["segment-002"] == pytest.approx(
        1.044898,
        abs=2e-5,
    )
    assert output.metadata["post_fit_durations"]["segment-002"] == pytest.approx(
        1.0,
        abs=2e-5,
    )
    output_path = Path(unquote(urlparse(output.url).path))
    assert abs(probe_duration(output_path) - 4.0) <= 0.05
    assert result.manifest.verify()


def test_multi_segment_master_fans_into_captioned_video(
    tmp_path: Path,
) -> None:
    speech_assets = (
        _tone(tmp_path / "segment-001.wav", frequency=330, duration=0.90),
        _tone(tmp_path / "segment-002.wav", frequency=440, duration=1.00),
        _tone(tmp_path / "segment-003.wav", frequency=550, duration=0.80),
    )
    assembled = (
        Pipeline("multi-segment-master-test", preflight=False)
        .step(
            ToluvaSegmentAudioAssembler(output_dir=tmp_path / "audio-output"),
            model="ffmpeg-segment-audio-v1",
            modality=Modality.AUDIO,
            expected_duration_sec=4.0,
            external_inputs=list(speech_assets),
            placements=[
                {
                    "segment_id": placement.segment_id,
                    "start_seconds": placement.start_seconds,
                    "end_seconds": placement.end_seconds,
                }
                for placement in placements()
            ],
            target_seconds=4.0,
        )
        .run(raise_on_failure=True, max_retries=0)
    )
    master_audio = assembled.run.steps[0].assets[0]

    video_path = tmp_path / "source.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x0B1716:s=320x180:r=24:d=4",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "1",
            "-map_metadata",
            "-1",
            "-y",
            str(video_path),
        ],
        check=True,
    )
    video_bytes = video_path.read_bytes()
    video = Asset(
        url=local_file_url(video_path.resolve()),
        media_type="video/mp4",
        sha256=hashlib.sha256(video_bytes).hexdigest(),
        size_bytes=len(video_bytes),
        width=320,
        height=180,
        duration=4.0,
        video=VideoMetadata(
            frame_rate=24.0,
            codec="h264",
            resolution="320x180",
            has_audio=False,
        ),
    )
    captions_path = tmp_path / "captions.vtt"
    captions_path.write_text(
        (
            "WEBVTT\n\n"
            "segment-001\n00:00:00.000 --> 00:00:01.000\n"
            "Willkommen bei Toluva.\n\n"
            "segment-002\n00:00:01.200 --> 00:00:02.200\n"
            "Jede Stimme bleibt im Takt.\n\n"
            "segment-003\n00:00:02.400 --> 00:00:03.400\n"
            "Mit Nachweisen veröffentlichen.\n"
        ),
        encoding="utf-8",
    )
    caption_bytes = captions_path.read_bytes()
    captions = Asset(
        url=local_file_url(captions_path.resolve()),
        media_type="text/vtt",
        sha256=hashlib.sha256(caption_bytes).hexdigest(),
        size_bytes=len(caption_bytes),
        duration=4.0,
    )
    composed = (
        Pipeline("multi-segment-composition-test", preflight=False)
        .step(
            ToluvaFFmpegCompositor(output_dir=tmp_path / "video-output"),
            model="ffmpeg-captioned-mp4-v1",
            modality=Modality.VIDEO,
            expected_duration_sec=4.0,
            external_inputs=[video, master_audio, captions],
            target_seconds=4.0,
            subtitle_language="deu",
        )
        .run(raise_on_failure=True, max_retries=0)
    )
    final_asset = composed.run.steps[0].assets[0]
    final_path = Path(unquote(urlparse(final_asset.url).path))
    stream_types = {
        stream["codec_type"]
        for stream in probe_media(final_path)["streams"]  # type: ignore[index]
    }
    assert stream_types == {"video", "audio", "subtitle"}
    assert abs(probe_duration(final_path) - 4.0) <= 0.05
    assert assembled.manifest.verify()
    assert composed.manifest.verify()
