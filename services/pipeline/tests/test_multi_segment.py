from dataclasses import dataclass, field

import pytest

from toluva_pipeline.domain.correction import (
    AttemptContext,
    RewriteError,
    SpeechArtifact,
    TimingCorrectionRequest,
)
from toluva_pipeline.domain.multi_segment import (
    MultiSegmentLocalizationEngine,
    MultiSegmentLocalizationRequest,
    MultiSegmentStatus,
    SegmentTranslationArtifact,
    SegmentTranslationError,
)
from toluva_pipeline.domain.transcript import TimedSegment, TimedTranscript
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.multi_segment import B2MultiSegmentJournal


def source_transcript() -> TimedTranscript:
    return TimedTranscript(
        language="eng",
        source="test-transcription",
        source_asset_sha256="a" * 64,
        segments=(
            TimedSegment("segment-001", 0.0, 1.0, "Welcome to Toluva."),
            TimedSegment("segment-002", 1.2, 2.2, "Keep every voice in time."),
            TimedSegment("segment-003", 2.4, 3.4, "Publish with evidence."),
        ),
    )


@dataclass
class FakeTranslator:
    translations: dict[str, str]
    invalid_manifest_segment: str | None = None
    calls: list[str] = field(default_factory=list)

    def translate(
        self,
        request: MultiSegmentLocalizationRequest,
        segment: TimedSegment,
        protected_terms: tuple[str, ...],
    ) -> SegmentTranslationArtifact:
        self.calls.append(segment.segment_id)
        return SegmentTranslationArtifact(
            segment_id=segment.segment_id,
            source_text=segment.text,
            translated_text=self.translations[segment.segment_id],
            provider="fake-translation",
            model="fake-model",
            run_id=f"translation-{segment.segment_id}",
            asset_key=f"translations/{segment.segment_id}.json",
            manifest_key=f"translations/{segment.segment_id}/manifest.json",
            stored_manifest_valid=(
                segment.segment_id != self.invalid_manifest_segment
            ),
            stored_manifest_hash_matches=True,
            stored_asset_hash_matches=True,
        )


@dataclass
class FakeSpeechGenerator:
    durations: dict[tuple[str, int], float]
    calls: list[tuple[str, int]] = field(default_factory=list)

    def generate(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> SpeechArtifact:
        key = (request.segment_id, context.attempt_number)
        self.calls.append(key)
        return SpeechArtifact(
            run_id=f"speech-{request.segment_id}-{context.attempt_number}",
            parent_run_id=context.parent_run_id,
            provider="fake-tts",
            model="fake-model",
            generated_seconds=self.durations[key],
            audio_key=(
                f"speech/{request.segment_id}/"
                f"attempt-{context.attempt_number}.wav"
            ),
            manifest_key=(
                f"speech/{request.segment_id}/"
                f"attempt-{context.attempt_number}/manifest.json"
            ),
            manifest_hash=f"hash-{request.segment_id}-{context.attempt_number}",
            word_timing_count=3,
            stored_manifest_valid=True,
            stored_manifest_hash_matches=True,
            stored_asset_hash_matches=True,
        )


@dataclass
class MappedRewriter:
    revisions: dict[str, list[str]]
    calls: list[tuple[str, int]] = field(default_factory=list)

    @property
    def name(self) -> str:
        return "mapped-reviewed-rewriter"

    def rewrite(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        instruction: str,
    ) -> str:
        self.calls.append((request.segment_id, context.attempt_number))
        values = self.revisions.get(request.segment_id, [])
        if not values:
            raise RewriteError("no mapped revision remains")
        return values.pop(0)


def request() -> MultiSegmentLocalizationRequest:
    return MultiSegmentLocalizationRequest(
        project_id="project-01",
        job_id="job-01",
        transcript=source_transcript(),
        source_language="English",
        target_language="German",
        protected_terms=("Toluva",),
    )


def test_multi_segment_engine_preserves_slots_and_red_to_green_lineage() -> None:
    translator = FakeTranslator(
        {
            "segment-001": "Willkommen bei Toluva.",
            "segment-002": (
                "Sorgen Sie dafür, dass jede synthetische Stimme jederzeit "
                "perfekt in den vorgesehenen Zeitrahmen passt."
            ),
            "segment-003": "Mit Nachweisen veröffentlichen.",
        }
    )
    generator = FakeSpeechGenerator(
        {
            ("segment-001", 1): 0.96,
            ("segment-002", 1): 1.35,
            ("segment-002", 2): 1.02,
            ("segment-003", 1): 0.90,
        }
    )
    rewriter = MappedRewriter(
        {"segment-002": ["Jede Stimme bleibt im Takt."]}
    )
    outcome = MultiSegmentLocalizationEngine(
        translator=translator,
        generator=generator,
        rewriter=rewriter,
    ).run(request())

    assert outcome.status == MultiSegmentStatus.READY_FOR_COMPOSITION
    assert outcome.ready_for_composition
    assert outcome.requested_segment_count == 3
    assert outcome.total_tts_attempts == 4
    assert outcome.red_to_green_segment_ids == ("segment-002",)
    assert [result.timing.status for result in outcome.segment_results] == [
        "accepted",
        "accepted",
        "padded",
    ]
    assert [
        attempt.timing_band
        for attempt in outcome.segment_results[1].timing.attempts
    ] == ["red", "green"]
    assert (
        outcome.segment_results[1].selected_speech.parent_run_id
        == "speech-segment-002-1"
    )
    assert generator.calls == [
        ("segment-001", 1),
        ("segment-002", 1),
        ("segment-002", 2),
        ("segment-003", 1),
    ]
    localized = outcome.to_localized_transcript(
        source="multi-segment-test"
    )
    assert localized.source_asset_sha256 == "a" * 64
    assert localized.segments[1].start_seconds == 1.2
    assert localized.segments[1].end_seconds == 2.2
    assert localized.segments[1].text == "Jede Stimme bleibt im Takt."


def test_human_review_stops_before_later_segment_spend() -> None:
    translator = FakeTranslator(
        {
            "segment-001": "Willkommen bei Toluva.",
            "segment-002": "Eine lange zweite Übersetzung.",
            "segment-003": "Dieser Abschnitt darf nicht laufen.",
        }
    )
    generator = FakeSpeechGenerator(
        {
            ("segment-001", 1): 0.96,
            ("segment-002", 1): 1.50,
            ("segment-002", 2): 1.35,
            ("segment-002", 3): 1.20,
        }
    )
    outcome = MultiSegmentLocalizationEngine(
        translator=translator,
        generator=generator,
        rewriter=MappedRewriter(
            {
                "segment-002": [
                    "Eine kürzere zweite Übersetzung.",
                    "Noch kürzer.",
                ]
            }
        ),
    ).run(request())

    assert outcome.status == MultiSegmentStatus.HUMAN_REVIEW
    assert not outcome.ready_for_composition
    assert outcome.stopped_segment_id == "segment-002"
    assert translator.calls == ["segment-001", "segment-002"]
    assert not any(
        segment_id == "segment-003"
        for segment_id, _ in generator.calls
    )
    with pytest.raises(RuntimeError, match="human review"):
        outcome.to_localized_transcript(source="must-not-compose")


def test_missing_protected_term_blocks_before_first_tts_call() -> None:
    generator = FakeSpeechGenerator({})
    with pytest.raises(SegmentTranslationError, match="protected"):
        MultiSegmentLocalizationEngine(
            translator=FakeTranslator(
                {
                    "segment-001": "Willkommen.",
                    "segment-002": "Zweiter Abschnitt.",
                    "segment-003": "Dritter Abschnitt.",
                }
            ),
            generator=generator,
            rewriter=MappedRewriter({}),
        ).run(request())
    assert generator.calls == []


def test_unverified_translation_manifest_blocks_before_tts() -> None:
    generator = FakeSpeechGenerator({})
    with pytest.raises(SegmentTranslationError, match="manifest"):
        MultiSegmentLocalizationEngine(
            translator=FakeTranslator(
                {
                    "segment-001": "Willkommen bei Toluva.",
                    "segment-002": "Zweiter Abschnitt.",
                    "segment-003": "Dritter Abschnitt.",
                },
                invalid_manifest_segment="segment-001",
            ),
            generator=generator,
            rewriter=MappedRewriter({}),
        ).run(request())
    assert generator.calls == []


class FakeBackend:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def put(
        self,
        key: str,
        data: bytes,
        *,
        content_type: str | None = None,
    ) -> str:
        self.objects[key] = data
        return f"memory://{key}"


def test_multi_segment_summary_is_immutable_and_replayable() -> None:
    translator = FakeTranslator(
        {
            "segment-001": "Willkommen bei Toluva.",
            "segment-002": "Jede Stimme bleibt im Takt.",
            "segment-003": "Mit Nachweisen veröffentlichen.",
        }
    )
    outcome = MultiSegmentLocalizationEngine(
        translator=translator,
        generator=FakeSpeechGenerator(
            {
                ("segment-001", 1): 0.96,
                ("segment-002", 1): 0.98,
                ("segment-003", 1): 0.90,
            }
        ),
        rewriter=MappedRewriter({}),
    ).run(request())
    backend = FakeBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    journal = B2MultiSegmentJournal(
        backend,  # type: ignore[arg-type]
        keys=ToluvaObjectKeys("project-01"),
        scope=scope,
        version="v1",
    )

    key = journal.store(outcome)
    journal.store(outcome)
    loaded = journal.load()
    assert key.endswith("/qa/multi-segment/v1.json")
    assert loaded is not None
    assert loaded["status"] == "ready_for_composition"
    assert loaded["requested_segment_count"] == 3
    assert len(backend.objects) == 1


def test_multi_segment_summary_rejects_cross_job_write() -> None:
    outcome = MultiSegmentLocalizationEngine(
        translator=FakeTranslator(
            {
                "segment-001": "Willkommen bei Toluva.",
                "segment-002": "Jede Stimme bleibt im Takt.",
                "segment-003": "Mit Nachweisen veröffentlichen.",
            }
        ),
        generator=FakeSpeechGenerator(
            {
                ("segment-001", 1): 0.96,
                ("segment-002", 1): 0.98,
                ("segment-003", 1): 0.90,
            }
        ),
        rewriter=MappedRewriter({}),
    ).run(request())
    journal = B2MultiSegmentJournal(
        FakeBackend(),  # type: ignore[arg-type]
        keys=ToluvaObjectKeys("project-01"),
        scope=StorageScope("project-01", "different-job", "de-DE"),
        version="v1",
    )
    with pytest.raises(ValueError, match="storage scope"):
        journal.store(outcome)
