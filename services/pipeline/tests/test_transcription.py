from pathlib import Path

import pytest
from genblaze_core import Asset, Modality, Step
from genblaze_core._utils import local_file_url

from toluva_pipeline.domain.transcription import (
    parse_scribe_words,
    timed_transcript_from_scribe,
)
from toluva_pipeline.providers.transcriber import (
    ElevenLabsScribeProvider,
    FasterWhisperProvider,
)


def scribe_payload() -> dict[str, object]:
    return {
        "language_code": "eng",
        "language_probability": 0.99,
        "text": "Welcome to Toluva. One message, many languages.",
        "words": [
            {
                "text": "Welcome",
                "start": 0.1,
                "end": 0.5,
                "type": "word",
                "speaker_id": "speaker_0",
            },
            {
                "text": "to",
                "start": 0.55,
                "end": 0.7,
                "type": "word",
                "speaker_id": "speaker_0",
            },
            {
                "text": "Toluva.",
                "start": 0.75,
                "end": 1.2,
                "type": "word",
                "speaker_id": "speaker_0",
            },
            {
                "text": "One",
                "start": 2.0,
                "end": 2.2,
                "type": "word",
                "speaker_id": "speaker_0",
            },
            {
                "text": "message.",
                "start": 2.25,
                "end": 2.7,
                "type": "word",
                "speaker_id": "speaker_0",
            },
        ],
    }


def test_scribe_words_are_segmented_on_a_real_pause() -> None:
    transcript = timed_transcript_from_scribe(
        scribe_payload(),
        source_asset_sha256="a" * 64,
        media_duration_seconds=3.2,
    )
    assert transcript.language == "eng"
    assert len(transcript.segments) == 2
    assert transcript.segments[0].text == "Welcome to Toluva."
    assert transcript.segments[0].end_seconds == pytest.approx(1.6)
    assert transcript.segments[1].start_seconds == pytest.approx(1.6)
    assert transcript.segments[1].end_seconds == 3.2


def test_sentence_ending_with_a_real_gap_is_a_segment_boundary() -> None:
    payload = scribe_payload()
    payload["words"][3]["start"] = 1.30  # type: ignore[index]
    payload["words"][3]["end"] = 1.50  # type: ignore[index]
    payload["words"][4]["start"] = 1.55  # type: ignore[index]
    payload["words"][4]["end"] = 2.00  # type: ignore[index]

    transcript = timed_transcript_from_scribe(
        payload,
        source_asset_sha256="a" * 64,
        media_duration_seconds=2.4,
    )

    assert [segment.text for segment in transcript.segments] == [
        "Welcome to Toluva.",
        "One message.",
    ]
    assert transcript.segments[0].end_seconds == pytest.approx(1.25)
    assert transcript.segments[1].start_seconds == pytest.approx(1.25)


def test_scribe_words_reject_overlap() -> None:
    payload = scribe_payload()
    payload["words"][1]["start"] = 0.4  # type: ignore[index]
    with pytest.raises(ValueError, match="overlap"):
        parse_scribe_words(payload)


def test_scribe_provider_writes_hashed_timestamped_json(tmp_path: Path) -> None:
    source_path = tmp_path / "source.mp4"
    source_path.write_bytes(b"media")
    captured: dict[str, object] = {}

    def fake_request(
        path: Path,
        model: str,
        language: str | None,
        keyterms: tuple[str, ...],
        timeout: float,
    ) -> dict[str, object]:
        captured.update(
            path=path,
            model=model,
            language=language,
            keyterms=keyterms,
            timeout=timeout,
        )
        return scribe_payload()

    provider = ElevenLabsScribeProvider(
        api_key="configured",
        output_dir=tmp_path,
        request=fake_request,
    )
    source = Asset(
        url=local_file_url(source_path.resolve()),
        media_type="video/mp4",
        sha256="b" * 64,
        size_bytes=5,
        duration=3.2,
    )
    step = Step(
        provider=provider.name,
        model="scribe_v2",
        modality=Modality.TEXT,
        inputs=[source],
        params={"language_code": "eng", "keyterms": ["Toluva"]},
    )
    result = provider.generate(step)
    assert captured["keyterms"] == ("Toluva",)
    assert result.assets[0].media_type == "application/json"
    assert result.assets[0].sha256
    assert result.assets[0].metadata["word_count"] == 5


def test_local_whisper_provider_records_pinned_model_hash(tmp_path: Path) -> None:
    source_path = tmp_path / "source.mp4"
    source_path.write_bytes(b"media")
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "model.bin").write_bytes(b"pinned-model")
    provider = FasterWhisperProvider(
        model_dir=model_dir,
        model_revision="revision-01",
        output_dir=tmp_path,
        transcribe=lambda path, keyterms: scribe_payload(),
    )
    source = Asset(
        url=local_file_url(source_path.resolve()),
        media_type="video/mp4",
        sha256="b" * 64,
        size_bytes=5,
        duration=3.2,
    )
    step = Step(
        provider=provider.name,
        model="whisper-base-en",
        modality=Modality.TEXT,
        inputs=[source],
        params={"keyterms": ["Toluva"]},
    )
    result = provider.generate(step)
    assert result.model_version == "revision-01"
    assert result.model_hash
    assert result.assets[0].metadata["model_hash"] == result.model_hash
