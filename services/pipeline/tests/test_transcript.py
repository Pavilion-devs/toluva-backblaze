import pytest

from toluva_pipeline.domain.transcript import (
    TimedSegment,
    TimedTranscript,
    to_webvtt,
)


def test_webvtt_is_deterministic_and_uses_full_timestamps() -> None:
    transcript = TimedTranscript(
        language="de-DE",
        source="unit-test",
        segments=(
            TimedSegment(
                segment_id="segment-01",
                start_seconds=0.0,
                end_seconds=3.8,
                text="Willkommen bei Toluva.",
            ),
            TimedSegment(
                segment_id="segment-02",
                start_seconds=3601.25,
                end_seconds=3602.0,
                text="Fertig.",
            ),
        ),
    )
    captions = to_webvtt(transcript)
    assert captions.startswith("WEBVTT\n\nNOTE source=unit-test")
    assert "00:00:00.000 --> 00:00:03.800" in captions
    assert "01:00:01.250 --> 01:00:02.000" in captions


@pytest.mark.parametrize(
    "segments",
    [
        (
            TimedSegment("segment-01", 0.0, 2.0, "First"),
            TimedSegment("segment-02", 1.9, 3.0, "Overlap"),
        ),
        (
            TimedSegment("same", 0.0, 1.0, "First"),
            TimedSegment("same", 1.0, 2.0, "Duplicate"),
        ),
    ],
)
def test_transcript_rejects_overlap_and_duplicate_ids(
    segments: tuple[TimedSegment, ...],
) -> None:
    with pytest.raises(ValueError):
        TimedTranscript(language="en-US", source="test", segments=segments)


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (-0.1, 1.0),
        (1.0, 1.0),
        (2.0, 1.0),
        (0.0, float("inf")),
    ],
)
def test_segment_rejects_invalid_timing(start: float, end: float) -> None:
    with pytest.raises(ValueError):
        TimedSegment("segment-01", start, end, "Text")
