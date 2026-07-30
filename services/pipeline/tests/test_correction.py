from dataclasses import dataclass, field

import pytest

from toluva_pipeline.domain.correction import (
    AttemptContext,
    CorrectionAttempt,
    CorrectionStatus,
    ProtectedTermError,
    RewriteError,
    ScriptedTranslationRewriter,
    SpeechArtifact,
    TimingCorrectionEngine,
    TimingCorrectionOutcome,
    TimingCorrectionRequest,
)
from toluva_pipeline.domain.timing import TimingPolicy


def request(
    *,
    initial_translation: str = "Toluva ist eine ausführliche Plattform.",
    protected_terms: tuple[str, ...] = ("Toluva",),
) -> TimingCorrectionRequest:
    return TimingCorrectionRequest(
        project_id="project-01",
        job_id="job-01",
        segment_id="segment-01",
        source_text="Toluva is a platform.",
        initial_translation=initial_translation,
        source_language="English",
        target_language="German",
        target_seconds=10.0,
        protected_terms=protected_terms,
    )


class FakeGenerator:
    def __init__(
        self,
        durations: list[float],
        *,
        error: Exception | None = None,
    ) -> None:
        self.durations = durations
        self.error = error
        self.contexts: list[AttemptContext] = []

    def generate(
        self,
        correction_request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> SpeechArtifact:
        self.contexts.append(context)
        if self.error is not None:
            raise self.error
        duration = self.durations[len(self.contexts) - 1]
        run_id = f"run-{context.attempt_number}"
        return SpeechArtifact(
            run_id=run_id,
            parent_run_id=context.parent_run_id,
            provider="fake-tts",
            model="fake-model",
            generated_seconds=duration,
            audio_key=f"speech/attempt-{context.attempt_number}.mp3",
            manifest_key=f"manifests/{run_id}.json",
            manifest_hash=f"hash-{run_id}",
            word_timing_count=3,
            stored_manifest_valid=True,
            stored_manifest_hash_matches=True,
            stored_asset_hash_matches=True,
        )


@dataclass
class RecordingJournal:
    prepared: list[AttemptContext] = field(default_factory=list)
    completed: list[CorrectionAttempt] = field(default_factory=list)
    generation_failures: list[tuple[int, str]] = field(default_factory=list)
    rewrite_failures: list[tuple[int, str]] = field(default_factory=list)
    outcomes: list[TimingCorrectionOutcome] = field(default_factory=list)

    def before_generation(
        self,
        correction_request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> None:
        self.prepared.append(context)

    def generation_failed(
        self,
        correction_request: TimingCorrectionRequest,
        context: AttemptContext,
        error_type: str,
    ) -> None:
        self.generation_failures.append((context.attempt_number, error_type))

    def attempt_completed(
        self,
        correction_request: TimingCorrectionRequest,
        attempt: CorrectionAttempt,
    ) -> None:
        self.completed.append(attempt)

    def rewrite_failed(
        self,
        correction_request: TimingCorrectionRequest,
        context: AttemptContext,
        error_code: str,
    ) -> None:
        self.rewrite_failures.append((context.attempt_number, error_code))

    def correction_completed(self, outcome: TimingCorrectionOutcome) -> None:
        self.outcomes.append(outcome)


def test_red_attempt_rewrites_then_turns_green_with_parent_lineage() -> None:
    generator = FakeGenerator([13.0, 10.4])
    journal = RecordingJournal()
    outcome = TimingCorrectionEngine(
        generator=generator,
        rewriter=ScriptedTranslationRewriter(("Toluva passt gut.",)),
        journal=journal,
    ).run(request())

    assert outcome.status == CorrectionStatus.ACCEPTED
    assert outcome.selected_attempt_number == 2
    assert [attempt.timing_band for attempt in outcome.attempts] == ["red", "green"]
    assert outcome.attempts[0].timing_action == "retry_shorter"
    assert outcome.attempts[1].timing_action == "accept"
    assert outcome.attempts[1].speech.parent_run_id == "run-1"
    assert generator.contexts[1].instruction is not None
    assert "13.00s" in generator.contexts[1].instruction
    assert generator.contexts[0].idempotency_key != generator.contexts[1].idempotency_key
    assert len(journal.prepared) == 2
    assert len(journal.completed) == 2
    assert journal.outcomes == [outcome]


def test_red_attempts_stop_at_retry_budget_and_require_review() -> None:
    outcome = TimingCorrectionEngine(
        generator=FakeGenerator([13.0, 12.0, 11.6]),
        rewriter=ScriptedTranslationRewriter(
            ("Toluva ist kürzer.", "Toluva ist sehr kurz.")
        ),
        policy=TimingPolicy(max_retries=2),
    ).run(request())

    assert outcome.status == CorrectionStatus.HUMAN_REVIEW
    assert outcome.selected_attempt_number == 3
    assert len(outcome.attempts) == 3
    assert outcome.attempts[-1].timing_action == "human_review"


def test_amber_underlong_attempt_pads_without_rewriting() -> None:
    outcome = TimingCorrectionEngine(
        generator=FakeGenerator([9.0]),
        rewriter=ScriptedTranslationRewriter(()),
    ).run(request())

    assert outcome.status == CorrectionStatus.PADDED
    assert outcome.selected_attempt_number == 1
    assert outcome.attempts[0].timing_action == "pad_silence"


def test_red_underlong_attempt_requests_natural_expansion() -> None:
    generator = FakeGenerator([7.0, 9.5])
    outcome = TimingCorrectionEngine(
        generator=generator,
        rewriter=ScriptedTranslationRewriter(
            ("Toluva ist eine hilfreiche und klare Plattform.",)
        ),
    ).run(request())

    assert outcome.status == CorrectionStatus.ACCEPTED
    assert outcome.attempts[0].timing_action == "retry_expanded"
    assert "naturally fill 10.00s" in generator.contexts[1].instruction


def test_generation_failure_is_journaled_without_leaking_message() -> None:
    journal = RecordingJournal()
    engine = TimingCorrectionEngine(
        generator=FakeGenerator([], error=RuntimeError("secret upstream detail")),
        rewriter=ScriptedTranslationRewriter(()),
        journal=journal,
    )
    with pytest.raises(RuntimeError, match="secret upstream detail"):
        engine.run(request())
    assert journal.generation_failures == [(1, "RuntimeError")]
    assert journal.completed == []


def test_missing_initial_protected_term_blocks_before_generation() -> None:
    generator = FakeGenerator([10.0])
    with pytest.raises(ProtectedTermError):
        TimingCorrectionEngine(
            generator=generator,
            rewriter=ScriptedTranslationRewriter(()),
        ).run(request(initial_translation="Eine ausführliche Plattform."))
    assert generator.contexts == []


def test_rewrite_missing_protected_term_blocks_second_tts_call() -> None:
    generator = FakeGenerator([13.0])
    journal = RecordingJournal()
    with pytest.raises(ProtectedTermError):
        TimingCorrectionEngine(
            generator=generator,
            rewriter=ScriptedTranslationRewriter(("Eine kurze Plattform.",)),
            journal=journal,
        ).run(request())
    assert len(generator.contexts) == 1
    assert journal.rewrite_failures == [(2, "ProtectedTermError")]


def test_correction_resumes_after_approved_rewrite_without_repeating_tts() -> None:
    class ApprovalMissingRewriter:
        @property
        def name(self) -> str:
            return "approval-missing"

        def rewrite(
            self,
            correction_request: TimingCorrectionRequest,
            context: AttemptContext,
            instruction: str,
        ) -> str:
            raise RewriteError("approval required")

    first_generator = FakeGenerator([13.0])
    first_journal = RecordingJournal()
    with pytest.raises(RewriteError, match="approval required"):
        TimingCorrectionEngine(
            generator=first_generator,
            rewriter=ApprovalMissingRewriter(),
            journal=first_journal,
        ).run(request())

    assert [context.attempt_number for context in first_generator.contexts] == [1]
    assert len(first_journal.completed) == 1
    resumed_generator = FakeGenerator([9.8])
    resumed = TimingCorrectionEngine(
        generator=resumed_generator,
        rewriter=ScriptedTranslationRewriter(("Toluva passt gut.",)),
    ).run(
        request(),
        prior_attempts=tuple(first_journal.completed),
    )

    assert resumed.status == CorrectionStatus.ACCEPTED
    assert [attempt.context.attempt_number for attempt in resumed.attempts] == [
        1,
        2,
    ]
    assert [context.attempt_number for context in resumed_generator.contexts] == [2]
    assert resumed.attempts[1].speech.parent_run_id == "run-1"
    assert resumed.total_generated_characters == (
        len(request().initial_translation) + len("Toluva passt gut.")
    )
