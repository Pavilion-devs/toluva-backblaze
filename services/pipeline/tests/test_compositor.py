import hashlib
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

from genblaze_core import (
    Asset,
    AudioMetadata,
    Modality,
    Pipeline,
    VideoMetadata,
)
from genblaze_core._utils import local_file_url

from toluva_pipeline.media import probe_duration, probe_media
from toluva_pipeline.providers.compositor import (
    ToluvaFFmpegCompositor,
    build_composition_command,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_inputs(tmp_path: Path) -> tuple[Path, Path, Path]:
    video = tmp_path / "video.mp4"
    audio = tmp_path / "audio.mp3"
    captions = tmp_path / "captions.vtt"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x0B1716:s=320x180:r=24:d=1",
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
            str(video),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=0.7",
            "-c:a",
            "libmp3lame",
            "-map_metadata",
            "-1",
            "-y",
            str(audio),
        ],
        check=True,
    )
    captions.write_text(
        "WEBVTT\n\nsegment-01\n00:00:00.000 --> 00:00:01.000\nToluva.\n",
        encoding="utf-8",
    )
    return video, audio, captions


def test_command_maps_video_audio_and_caption_inputs(tmp_path: Path) -> None:
    command = build_composition_command(
        ffmpeg_path="ffmpeg",
        video_path=tmp_path / "video.mp4",
        audio_path=tmp_path / "audio.mp3",
        captions_path=tmp_path / "captions.vtt",
        output_path=tmp_path / "final.mp4",
        target_seconds=1.0,
        subtitle_language="deu",
    )
    assert command.count("-map") == 3
    assert "2:0" in command
    assert "mov_text" in command
    assert "[1:a]apad=whole_dur=1.000000[localized_audio]" in command


def test_genblaze_compositor_fans_in_three_inputs(tmp_path: Path) -> None:
    video, audio, captions = _create_inputs(tmp_path)
    video_asset = Asset(
        url=local_file_url(video.resolve()),
        media_type="video/mp4",
        sha256=_sha256(video),
        size_bytes=video.stat().st_size,
        width=320,
        height=180,
        duration=1.0,
        video=VideoMetadata(
            frame_rate=24.0,
            codec="h264",
            resolution="320x180",
            has_audio=False,
        ),
    )
    audio_asset = Asset(
        url=local_file_url(audio.resolve()),
        media_type="audio/mpeg",
        sha256=_sha256(audio),
        size_bytes=audio.stat().st_size,
        duration=probe_duration(audio),
        audio=AudioMetadata(codec="mp3"),
    )
    caption_asset = Asset(
        url=local_file_url(captions.resolve()),
        media_type="text/vtt",
        sha256=_sha256(captions),
        size_bytes=captions.stat().st_size,
        duration=1.0,
    )
    result = (
        Pipeline("composition-test", preflight=False)
        .step(
            ToluvaFFmpegCompositor(output_dir=tmp_path / "output"),
            model="ffmpeg-captioned-mp4-v1",
            modality=Modality.VIDEO,
            expected_duration_sec=1.0,
            external_inputs=[video_asset, audio_asset, caption_asset],
            target_seconds=1.0,
            subtitle_language="deu",
        )
        .run(raise_on_failure=True, max_retries=0)
    )

    output_asset = result.run.steps[0].assets[0]
    output_path = Path(unquote(urlparse(output_asset.url).path))
    probe = probe_media(output_path)
    stream_types = {
        stream["codec_type"]
        for stream in probe["streams"]  # type: ignore[index]
    }
    assert stream_types == {"video", "audio", "subtitle"}
    assert abs(probe_duration(output_path) - 1.0) <= 0.05
    assert result.manifest.verify()
    assert output_asset.sha256 == _sha256(output_path)
