"""Validated live-transcription output and deterministic speech segmentation."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

from toluva_pipeline.domain.transcript import TimedSegment, TimedTranscript

_NO_SPACE_BEFORE = frozenset(".,!?;:%)]}”’")
_NO_SPACE_AFTER = frozenset("([{“‘")
_SENTENCE_TERMINATORS = frozenset(".!?…")
_SENTENCE_CLOSERS = "\"'”’)]}"


@dataclass(frozen=True)
class TranscriptionWord:
    text: str
    start_seconds: float
    end_seconds: float
    speaker_id: str | None = None
    confidence: float | None = None

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("transcription word text must not be empty")
        if not all(
            math.isfinite(value)
            for value in (self.start_seconds, self.end_seconds)
        ):
            raise ValueError("transcription word timing must be finite")
        if self.start_seconds < 0 or self.end_seconds < self.start_seconds:
            raise ValueError("transcription word timing is invalid")
        if self.confidence is not None and not 0 <= self.confidence <= 1:
            raise ValueError("transcription confidence must be between 0 and 1")


def parse_scribe_words(payload: dict[str, Any]) -> tuple[TranscriptionWord, ...]:
    """Normalize Scribe word tokens without trusting provider response shape."""

    raw_words = payload.get("words")
    if not isinstance(raw_words, list):
        raise ValueError("Scribe response is missing word timestamps")
    words: list[TranscriptionWord] = []
    for item in raw_words:
        if not isinstance(item, dict) or item.get("type", "word") != "word":
            continue
        text = item.get("text")
        start = item.get("start")
        end = item.get("end")
        if not isinstance(text, str) or not isinstance(start, (int, float)):
            raise ValueError("Scribe word token is malformed")
        if not isinstance(end, (int, float)):
            raise ValueError("Scribe word token is malformed")
        confidence = item.get("confidence")
        if confidence is None:
            logprob = item.get("logprob")
            if isinstance(logprob, (int, float)) and math.isfinite(logprob):
                confidence = max(0.0, min(1.0, math.exp(float(logprob))))
        words.append(
            TranscriptionWord(
                text=text,
                start_seconds=float(start),
                end_seconds=float(end),
                speaker_id=(
                    str(item["speaker_id"])
                    if item.get("speaker_id") is not None
                    else None
                ),
                confidence=(
                    float(confidence)
                    if isinstance(confidence, (int, float))
                    else None
                ),
            )
        )
    if not words:
        raise ValueError("Scribe response contains no timed words")
    previous_end = 0.0
    for word in words:
        if word.start_seconds < previous_end:
            raise ValueError("Scribe word timestamps overlap or are unsorted")
        previous_end = word.end_seconds
    return tuple(words)


def _join_words(words: list[TranscriptionWord]) -> str:
    text = ""
    for word in words:
        token = word.text.strip()
        if not text:
            text = token
        elif token[0] in _NO_SPACE_BEFORE or text[-1] in _NO_SPACE_AFTER:
            text += token
        else:
            text += " " + token
    return re.sub(r"\s+", " ", text).strip()


def _ends_sentence(text: str) -> bool:
    candidate = text.strip().rstrip(_SENTENCE_CLOSERS)
    return bool(candidate and candidate[-1] in _SENTENCE_TERMINATORS)


def timed_transcript_from_scribe(
    payload: dict[str, Any],
    *,
    source_asset_sha256: str,
    media_duration_seconds: float,
    source: str = "elevenlabs-scribe-v2-live",
    pause_threshold_seconds: float = 0.65,
    sentence_gap_seconds: float = 0.075,
    max_segment_seconds: float = 8.0,
) -> TimedTranscript:
    """Create non-overlapping speech slots from real provider word timestamps."""

    if not source_asset_sha256.strip():
        raise ValueError("source_asset_sha256 must not be empty")
    if not math.isfinite(media_duration_seconds) or media_duration_seconds <= 0:
        raise ValueError("media_duration_seconds must be positive and finite")
    if (
        pause_threshold_seconds <= 0
        or sentence_gap_seconds < 0
        or max_segment_seconds <= 0
    ):
        raise ValueError("segmentation thresholds must be positive")

    words = parse_scribe_words(payload)
    if words[-1].end_seconds > media_duration_seconds + 0.05:
        raise ValueError("transcription exceeds the source media duration")

    groups: list[list[TranscriptionWord]] = []
    current: list[TranscriptionWord] = []
    for word in words:
        gap_seconds = (
            word.start_seconds - current[-1].end_seconds if current else 0.0
        )
        should_split = bool(
            current
            and (
                gap_seconds >= pause_threshold_seconds
                or (
                    gap_seconds >= sentence_gap_seconds
                    and _ends_sentence(current[-1].text)
                )
                or word.speaker_id != current[-1].speaker_id
                or word.end_seconds - current[0].start_seconds
                > max_segment_seconds
            )
        )
        if should_split:
            groups.append(current)
            current = []
        current.append(word)
    groups.append(current)

    boundaries = [0.0]
    for previous, following in zip(groups, groups[1:], strict=False):
        boundaries.append(
            (previous[-1].end_seconds + following[0].start_seconds) / 2
        )
    boundaries.append(media_duration_seconds)

    segments = tuple(
        TimedSegment(
            segment_id=f"segment-{index:03d}",
            start_seconds=boundaries[index - 1],
            end_seconds=boundaries[index],
            text=_join_words(group),
            speaker_id=group[0].speaker_id,
        )
        for index, group in enumerate(groups, start=1)
    )
    language = payload.get("language_code")
    if not isinstance(language, str) or not language.strip():
        raise ValueError("Scribe response is missing its detected language")
    return TimedTranscript(
        language=language,
        source=source,
        source_asset_sha256=source_asset_sha256,
        segments=segments,
    )
