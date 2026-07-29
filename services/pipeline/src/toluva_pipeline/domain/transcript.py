"""Validated timed transcripts and deterministic WebVTT captions."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class TimedSegment:
    segment_id: str
    start_seconds: float
    end_seconds: float
    text: str
    speaker_id: str | None = None

    def __post_init__(self) -> None:
        if not self.segment_id.strip():
            raise ValueError("segment_id must not be empty")
        if not self.text.strip():
            raise ValueError("segment text must not be empty")
        if not all(
            math.isfinite(value)
            for value in (self.start_seconds, self.end_seconds)
        ):
            raise ValueError("segment timing values must be finite")
        if self.start_seconds < 0:
            raise ValueError("segment start_seconds must be non-negative")
        if self.end_seconds <= self.start_seconds:
            raise ValueError("segment end_seconds must be greater than start_seconds")


@dataclass(frozen=True)
class TimedTranscript:
    language: str
    source: str
    segments: tuple[TimedSegment, ...]
    source_asset_sha256: str | None = None

    def __post_init__(self) -> None:
        if not self.language.strip():
            raise ValueError("transcript language must not be empty")
        if not self.source.strip():
            raise ValueError("transcript source must not be empty")
        if not self.segments:
            raise ValueError("transcript must contain at least one segment")
        seen: set[str] = set()
        previous_end = 0.0
        for segment in self.segments:
            if segment.segment_id in seen:
                raise ValueError("segment IDs must be unique")
            if segment.start_seconds < previous_end:
                raise ValueError("transcript segments must not overlap")
            seen.add(segment.segment_id)
            previous_end = segment.end_seconds

    @property
    def duration_seconds(self) -> float:
        return self.segments[-1].end_seconds

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _webvtt_timestamp(seconds: float) -> str:
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("caption timestamp must be finite and non-negative")
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"


def to_webvtt(transcript: TimedTranscript) -> str:
    lines = ["WEBVTT", "", f"NOTE source={transcript.source}", ""]
    for segment in transcript.segments:
        safe_text = segment.text.strip().replace("-->", "→")
        lines.extend(
            (
                segment.segment_id,
                (
                    f"{_webvtt_timestamp(segment.start_seconds)} --> "
                    f"{_webvtt_timestamp(segment.end_seconds)}"
                ),
                safe_text,
                "",
            )
        )
    return "\n".join(lines)
