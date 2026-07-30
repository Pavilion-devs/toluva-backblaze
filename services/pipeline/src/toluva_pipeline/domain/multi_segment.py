"""Provider-independent orchestration for multi-segment localization."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import StrEnum
from collections.abc import Callable
from typing import Protocol

from toluva_pipeline.domain.correction import (
    CorrectionAttempt,
    CorrectionJournal,
    CorrectionStatus,
    SpeechArtifact,
    SpeechGenerator,
    TimingCorrectionEngine,
    TimingCorrectionOutcome,
    TimingCorrectionRequest,
    TranslationRewriter,
)
from toluva_pipeline.domain.timing import TimingPolicy
from toluva_pipeline.domain.transcript import TimedSegment, TimedTranscript


class MultiSegmentStatus(StrEnum):
    READY_FOR_COMPOSITION = "ready_for_composition"
    HUMAN_REVIEW = "human_review"


class SegmentTranslationError(RuntimeError):
    """Raised before speech generation when a segment translation is unusable."""


@dataclass(frozen=True)
class MultiSegmentLocalizationRequest:
    project_id: str
    job_id: str
    transcript: TimedTranscript
    source_language: str
    target_language: str
    protected_terms: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        required = {
            "project_id": self.project_id,
            "job_id": self.job_id,
            "source_language": self.source_language,
            "target_language": self.target_language,
        }
        for name, value in required.items():
            if not value.strip():
                raise ValueError(f"{name} must not be empty")
        if any(not term.strip() for term in self.protected_terms):
            raise ValueError("protected_terms must not contain empty values")


@dataclass(frozen=True)
class SegmentTranslationArtifact:
    segment_id: str
    source_text: str
    translated_text: str
    provider: str
    model: str
    run_id: str
    asset_key: str
    manifest_key: str
    stored_manifest_valid: bool
    stored_manifest_hash_matches: bool
    stored_asset_hash_matches: bool

    def __post_init__(self) -> None:
        required = {
            "segment_id": self.segment_id,
            "source_text": self.source_text,
            "translated_text": self.translated_text,
            "provider": self.provider,
            "model": self.model,
            "run_id": self.run_id,
            "asset_key": self.asset_key,
            "manifest_key": self.manifest_key,
        }
        for name, value in required.items():
            if not value.strip():
                raise ValueError(f"{name} must not be empty")


class SegmentTranslator(Protocol):
    def translate(
        self,
        request: MultiSegmentLocalizationRequest,
        segment: TimedSegment,
        protected_terms: tuple[str, ...],
    ) -> SegmentTranslationArtifact: ...


@dataclass(frozen=True)
class LocalizedSegmentResult:
    source_segment: TimedSegment
    protected_terms: tuple[str, ...]
    translation: SegmentTranslationArtifact
    timing: TimingCorrectionOutcome

    @property
    def selected_attempt(self) -> CorrectionAttempt:
        selected = next(
            (
                attempt
                for attempt in self.timing.attempts
                if attempt.context.attempt_number
                == self.timing.selected_attempt_number
            ),
            None,
        )
        if selected is None:
            raise RuntimeError("timing outcome has no selected attempt")
        return selected

    @property
    def selected_translation(self) -> str:
        return self.selected_attempt.context.translated_text

    @property
    def selected_speech(self) -> SpeechArtifact:
        return self.selected_attempt.speech

    @property
    def turned_red_to_green(self) -> bool:
        return bool(
            self.timing.attempts
            and self.timing.attempts[0].timing_band == "red"
            and self.selected_attempt.timing_band == "green"
        )

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class MultiSegmentLocalizationOutcome:
    project_id: str
    job_id: str
    target_language: str
    source_asset_sha256: str | None
    status: MultiSegmentStatus
    requested_segment_count: int
    segment_results: tuple[LocalizedSegmentResult, ...]
    stopped_segment_id: str | None
    total_tts_attempts: int
    total_generated_characters: int
    red_to_green_segment_ids: tuple[str, ...]
    resumed_segment_ids: tuple[str, ...]

    @property
    def ready_for_composition(self) -> bool:
        return self.status == MultiSegmentStatus.READY_FOR_COMPOSITION

    def to_localized_transcript(self, *, source: str) -> TimedTranscript:
        if not self.ready_for_composition:
            raise RuntimeError(
                "multi-segment output requires human review before composition"
            )
        if len(self.segment_results) != self.requested_segment_count:
            raise RuntimeError("multi-segment output is incomplete")
        return TimedTranscript(
            language=self.target_language,
            source=source,
            source_asset_sha256=self.source_asset_sha256,
            segments=tuple(
                TimedSegment(
                    segment_id=result.source_segment.segment_id,
                    start_seconds=result.source_segment.start_seconds,
                    end_seconds=result.source_segment.end_seconds,
                    text=result.selected_translation,
                    speaker_id=result.source_segment.speaker_id,
                )
                for result in self.segment_results
            ),
        )

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class MultiSegmentLocalizationEngine:
    """Translate and time-fit each segment without hiding per-segment lineage."""

    def __init__(
        self,
        *,
        translator: SegmentTranslator,
        generator: SpeechGenerator,
        rewriter: TranslationRewriter,
        policy: TimingPolicy | None = None,
        journal: CorrectionJournal | None = None,
        completed_timing_loader: (
            Callable[[str], TimingCorrectionOutcome | None] | None
        ) = None,
        prior_attempts_loader: (
            Callable[[str], tuple[CorrectionAttempt, ...]] | None
        ) = None,
    ) -> None:
        self._translator = translator
        self._generator = generator
        self._rewriter = rewriter
        self._policy = policy or TimingPolicy()
        self._journal = journal
        self._completed_timing_loader = completed_timing_loader
        self._prior_attempts_loader = prior_attempts_loader

    def run(
        self,
        request: MultiSegmentLocalizationRequest,
    ) -> MultiSegmentLocalizationOutcome:
        results: list[LocalizedSegmentResult] = []
        stopped_segment_id: str | None = None
        resumed_segment_ids: list[str] = []

        for segment in request.transcript.segments:
            segment_terms = tuple(
                term
                for term in request.protected_terms
                if term in segment.text
            )
            translation = self._translator.translate(
                request,
                segment,
                segment_terms,
            )
            self._assert_translation(
                segment,
                translation,
                protected_terms=segment_terms,
            )
            correction_request = TimingCorrectionRequest(
                project_id=request.project_id,
                job_id=request.job_id,
                segment_id=segment.segment_id,
                source_text=segment.text,
                initial_translation=translation.translated_text,
                source_language=request.source_language,
                target_language=request.target_language,
                target_seconds=segment.end_seconds - segment.start_seconds,
                protected_terms=segment_terms,
            )
            correction = (
                self._completed_timing_loader(segment.segment_id)
                if self._completed_timing_loader is not None
                else None
            )
            if correction is not None:
                resumed_segment_ids.append(segment.segment_id)
            else:
                prior_attempts = (
                    self._prior_attempts_loader(segment.segment_id)
                    if self._prior_attempts_loader is not None
                    else ()
                )
                if prior_attempts:
                    resumed_segment_ids.append(segment.segment_id)
                correction = TimingCorrectionEngine(
                    generator=self._generator,
                    rewriter=self._rewriter,
                    policy=self._policy,
                    journal=self._journal,
                ).run(
                    correction_request,
                    prior_attempts=prior_attempts,
                )
            self._assert_timing(
                correction_request,
                correction,
            )
            result = LocalizedSegmentResult(
                source_segment=segment,
                protected_terms=segment_terms,
                translation=translation,
                timing=correction,
            )
            results.append(result)
            if correction.status == CorrectionStatus.HUMAN_REVIEW:
                stopped_segment_id = segment.segment_id
                break

        status = (
            MultiSegmentStatus.HUMAN_REVIEW
            if stopped_segment_id is not None
            else MultiSegmentStatus.READY_FOR_COMPOSITION
        )
        return MultiSegmentLocalizationOutcome(
            project_id=request.project_id,
            job_id=request.job_id,
            target_language=request.target_language,
            source_asset_sha256=request.transcript.source_asset_sha256,
            status=status,
            requested_segment_count=len(request.transcript.segments),
            segment_results=tuple(results),
            stopped_segment_id=stopped_segment_id,
            total_tts_attempts=sum(
                len(result.timing.attempts) for result in results
            ),
            total_generated_characters=sum(
                result.timing.total_generated_characters
                for result in results
            ),
            red_to_green_segment_ids=tuple(
                result.source_segment.segment_id
                for result in results
                if result.turned_red_to_green
            ),
            resumed_segment_ids=tuple(resumed_segment_ids),
        )

    @staticmethod
    def _assert_translation(
        segment: TimedSegment,
        translation: SegmentTranslationArtifact,
        *,
        protected_terms: tuple[str, ...],
    ) -> None:
        if translation.segment_id != segment.segment_id:
            raise SegmentTranslationError(
                "translation segment ID does not match the source segment"
            )
        if translation.source_text != segment.text:
            raise SegmentTranslationError(
                "translation source text does not match the source segment"
            )
        missing = tuple(
            term
            for term in protected_terms
            if term not in translation.translated_text
        )
        if missing:
            raise SegmentTranslationError(
                "translation is missing protected terms: "
                + ", ".join(missing)
            )
        if not (
            translation.stored_manifest_valid
            and translation.stored_manifest_hash_matches
            and translation.stored_asset_hash_matches
        ):
            raise SegmentTranslationError(
                "translation asset or manifest did not verify"
            )

    @staticmethod
    def _assert_timing(
        request: TimingCorrectionRequest,
        timing: TimingCorrectionOutcome,
    ) -> None:
        if (
            timing.project_id != request.project_id
            or timing.job_id != request.job_id
            or timing.segment_id != request.segment_id
        ):
            raise RuntimeError(
                "timing correction checkpoint does not match its segment"
            )
        if not timing.attempts:
            raise RuntimeError("timing correction checkpoint has no attempts")
        if (
            timing.attempts[0].context.translated_text
            != request.initial_translation
        ):
            raise RuntimeError(
                "timing correction checkpoint does not match translation"
            )
        selected = next(
            (
                attempt
                for attempt in timing.attempts
                if attempt.context.attempt_number
                == timing.selected_attempt_number
            ),
            None,
        )
        if selected is None:
            raise RuntimeError(
                "timing correction checkpoint has no selected attempt"
            )
        if not (
            selected.speech.stored_manifest_valid
            and selected.speech.stored_manifest_hash_matches
            and selected.speech.stored_asset_hash_matches
        ):
            raise RuntimeError(
                "timing correction checkpoint selected unverified speech"
            )
