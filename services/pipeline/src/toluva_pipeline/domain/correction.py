"""Bounded, provider-independent timing-correction orchestration."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Protocol

from toluva_pipeline.domain.timing import (
    TimingAction,
    TimingPolicy,
    build_expansion_instruction,
    build_shortening_instruction,
    decide_timing_action,
    measure_timing,
)


class CorrectionStatus(StrEnum):
    ACCEPTED = "accepted"
    PADDED = "padded"
    HUMAN_REVIEW = "human_review"


class ProtectedTermError(ValueError):
    """Raised before a billable call when required terminology is missing."""


class RewriteError(RuntimeError):
    """Raised when a requested translation revision is unusable."""


@dataclass(frozen=True)
class TimingCorrectionRequest:
    project_id: str
    job_id: str
    segment_id: str
    source_text: str
    initial_translation: str
    source_language: str
    target_language: str
    target_seconds: float
    protected_terms: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        required = {
            "project_id": self.project_id,
            "job_id": self.job_id,
            "segment_id": self.segment_id,
            "source_text": self.source_text,
            "initial_translation": self.initial_translation,
            "source_language": self.source_language,
            "target_language": self.target_language,
        }
        for name, value in required.items():
            if not value.strip():
                raise ValueError(f"{name} must not be empty")
        if self.target_seconds <= 0:
            raise ValueError("target_seconds must be positive")
        if any(not term.strip() for term in self.protected_terms):
            raise ValueError("protected_terms must not contain empty values")


@dataclass(frozen=True)
class AttemptContext:
    attempt_number: int
    translated_text: str
    text_sha256: str
    instruction: str | None
    requested_action: str
    parent_run_id: str | None
    idempotency_key: str


@dataclass(frozen=True)
class SpeechArtifact:
    run_id: str
    parent_run_id: str | None
    provider: str
    model: str
    generated_seconds: float
    audio_key: str
    manifest_key: str
    manifest_hash: str
    word_timing_count: int
    stored_manifest_valid: bool
    stored_manifest_hash_matches: bool
    stored_asset_hash_matches: bool


@dataclass(frozen=True)
class CorrectionAttempt:
    context: AttemptContext
    speech: SpeechArtifact
    slot_seconds: float
    drift_seconds: float
    drift_ratio: float
    absolute_drift_ratio: float
    timing_band: str
    timing_direction: str
    timing_action: str
    reason: str
    retry_number: int | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class TimingCorrectionOutcome:
    project_id: str
    job_id: str
    segment_id: str
    status: CorrectionStatus
    selected_attempt_number: int
    attempts: tuple[CorrectionAttempt, ...]
    total_generated_characters: int
    total_generated_seconds: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class SpeechGenerator(Protocol):
    def generate(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> SpeechArtifact: ...


class TranslationRewriter(Protocol):
    @property
    def name(self) -> str: ...

    def rewrite(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        instruction: str,
    ) -> str: ...


class CorrectionJournal(Protocol):
    def before_generation(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> None: ...

    def generation_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_type: str,
    ) -> None: ...

    def attempt_completed(
        self,
        request: TimingCorrectionRequest,
        attempt: CorrectionAttempt,
    ) -> None: ...

    def rewrite_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_code: str,
    ) -> None: ...

    def correction_completed(self, outcome: TimingCorrectionOutcome) -> None: ...


class NullCorrectionJournal:
    def before_generation(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> None:
        return None

    def generation_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_type: str,
    ) -> None:
        return None

    def attempt_completed(
        self,
        request: TimingCorrectionRequest,
        attempt: CorrectionAttempt,
    ) -> None:
        return None

    def rewrite_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_code: str,
    ) -> None:
        return None

    def correction_completed(self, outcome: TimingCorrectionOutcome) -> None:
        return None


def _assert_protected_terms(text: str, protected_terms: tuple[str, ...]) -> None:
    missing = tuple(term for term in protected_terms if term not in text)
    if missing:
        raise ProtectedTermError(
            "Translation is missing protected terms: " + ", ".join(missing)
        )


def _idempotency_key(
    request: TimingCorrectionRequest,
    *,
    attempt_number: int,
    translated_text: str,
) -> str:
    material = "\0".join(
        (
            request.project_id,
            request.job_id,
            request.segment_id,
            str(attempt_number),
            translated_text,
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _terminal_status(action: TimingAction) -> CorrectionStatus:
    if action == TimingAction.ACCEPT:
        return CorrectionStatus.ACCEPTED
    if action == TimingAction.PAD_SILENCE:
        return CorrectionStatus.PADDED
    if action == TimingAction.HUMAN_REVIEW:
        return CorrectionStatus.HUMAN_REVIEW
    raise ValueError(f"{action} is not a terminal timing action")


class TimingCorrectionEngine:
    """Own the measure → rewrite → regenerate loop around provider adapters."""

    def __init__(
        self,
        *,
        generator: SpeechGenerator,
        rewriter: TranslationRewriter,
        policy: TimingPolicy | None = None,
        journal: CorrectionJournal | None = None,
    ) -> None:
        self._generator = generator
        self._rewriter = rewriter
        self._policy = policy or TimingPolicy()
        self._journal = journal or NullCorrectionJournal()

    def run(
        self,
        request: TimingCorrectionRequest,
        *,
        prior_attempts: tuple[CorrectionAttempt, ...] = (),
    ) -> TimingCorrectionOutcome:
        current_text = request.initial_translation.strip()
        _assert_protected_terms(current_text, request.protected_terms)
        instruction: str | None = None
        requested_action = "initial_generation"
        parent_run_id: str | None = None
        attempts = list(prior_attempts)
        first_attempt_number = 1

        if attempts:
            self._validate_prior_attempts(request, prior_attempts)
            last_attempt = attempts[-1]
            retry_number = last_attempt.retry_number
            if retry_number is None:
                raise RuntimeError(
                    "prior timing attempts already contain a terminal decision"
                )
            instruction = self._retry_instruction(
                request,
                last_attempt,
                retry_number=retry_number,
            )
            rewrite_context = AttemptContext(
                attempt_number=retry_number,
                translated_text=last_attempt.context.translated_text,
                text_sha256=last_attempt.context.text_sha256,
                instruction=instruction,
                requested_action=last_attempt.timing_action,
                parent_run_id=last_attempt.speech.run_id,
                idempotency_key=last_attempt.context.idempotency_key,
            )
            current_text = self._rewrite(
                request,
                rewrite_context,
                instruction,
            )
            requested_action = last_attempt.timing_action
            parent_run_id = last_attempt.speech.run_id
            first_attempt_number = retry_number

        for attempt_number in range(
            first_attempt_number,
            self._policy.max_retries + 2,
        ):
            context = AttemptContext(
                attempt_number=attempt_number,
                translated_text=current_text,
                text_sha256=hashlib.sha256(current_text.encode("utf-8")).hexdigest(),
                instruction=instruction,
                requested_action=requested_action,
                parent_run_id=parent_run_id,
                idempotency_key=_idempotency_key(
                    request,
                    attempt_number=attempt_number,
                    translated_text=current_text,
                ),
            )
            self._journal.before_generation(request, context)
            try:
                speech = self._generator.generate(request, context)
            except Exception as exc:
                self._journal.generation_failed(
                    request,
                    context,
                    type(exc).__name__,
                )
                raise

            if speech.parent_run_id != parent_run_id:
                raise RuntimeError("speech artifact parent_run_id does not match context")
            measurement = measure_timing(
                0.0,
                request.target_seconds,
                speech.generated_seconds,
                policy=self._policy,
            )
            decision = decide_timing_action(
                measurement,
                attempt_number=attempt_number,
                policy=self._policy,
            )
            attempt = CorrectionAttempt(
                context=context,
                speech=speech,
                slot_seconds=measurement.slot_seconds,
                drift_seconds=measurement.drift_seconds,
                drift_ratio=measurement.drift_ratio,
                absolute_drift_ratio=measurement.absolute_drift_ratio,
                timing_band=measurement.band.value,
                timing_direction=measurement.direction.value,
                timing_action=decision.action.value,
                reason=decision.reason,
                retry_number=decision.retry_number,
            )
            attempts.append(attempt)
            self._journal.attempt_completed(request, attempt)

            if decision.retry_number is None:
                outcome = TimingCorrectionOutcome(
                    project_id=request.project_id,
                    job_id=request.job_id,
                    segment_id=request.segment_id,
                    status=_terminal_status(decision.action),
                    selected_attempt_number=attempt_number,
                    attempts=tuple(attempts),
                    total_generated_characters=sum(
                        len(item.context.translated_text) for item in attempts
                    ),
                    total_generated_seconds=sum(
                        item.speech.generated_seconds for item in attempts
                    ),
                )
                self._journal.correction_completed(outcome)
                return outcome

            instruction = self._retry_instruction(
                request,
                attempt,
                retry_number=decision.retry_number,
            )

            rewrite_context = AttemptContext(
                attempt_number=decision.retry_number,
                translated_text=current_text,
                text_sha256=context.text_sha256,
                instruction=instruction,
                requested_action=decision.action.value,
                parent_run_id=speech.run_id,
                idempotency_key=context.idempotency_key,
            )
            current_text = self._rewrite(
                request,
                rewrite_context,
                instruction,
            )
            requested_action = decision.action.value
            parent_run_id = speech.run_id

        raise RuntimeError("timing correction loop exceeded its bounded retry budget")

    def _rewrite(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        instruction: str,
    ) -> str:
        try:
            rewritten = self._rewriter.rewrite(
                request,
                context,
                instruction,
            ).strip()
            if not rewritten:
                raise RewriteError("rewriter returned an empty translation")
            if rewritten == context.translated_text:
                raise RewriteError("rewriter returned an unchanged translation")
            _assert_protected_terms(rewritten, request.protected_terms)
            return rewritten
        except Exception as exc:
            self._journal.rewrite_failed(
                request,
                context,
                type(exc).__name__,
            )
            raise

    @staticmethod
    def _retry_instruction(
        request: TimingCorrectionRequest,
        attempt: CorrectionAttempt,
        *,
        retry_number: int,
    ) -> str:
        if attempt.timing_action == TimingAction.RETRY_SHORTER.value:
            return build_shortening_instruction(
                text=attempt.context.translated_text,
                source_language=request.source_language,
                target_language=request.target_language,
                current_seconds=attempt.speech.generated_seconds,
                target_seconds=request.target_seconds,
                protected_terms=request.protected_terms,
                retry_number=retry_number,
            )
        if attempt.timing_action == TimingAction.RETRY_EXPANDED.value:
            return build_expansion_instruction(
                text=attempt.context.translated_text,
                source_language=request.source_language,
                target_language=request.target_language,
                current_seconds=attempt.speech.generated_seconds,
                target_seconds=request.target_seconds,
                protected_terms=request.protected_terms,
                retry_number=retry_number,
            )
        raise RuntimeError("non-terminal decision did not request a rewrite")

    def _validate_prior_attempts(
        self,
        request: TimingCorrectionRequest,
        attempts: tuple[CorrectionAttempt, ...],
    ) -> None:
        if len(attempts) > self._policy.max_retries:
            raise RuntimeError("prior attempts exceed the resumable retry budget")
        for expected_number, attempt in enumerate(attempts, start=1):
            if attempt.context.attempt_number != expected_number:
                raise RuntimeError("prior timing attempts are not contiguous")
            if abs(attempt.slot_seconds - request.target_seconds) > 0.001:
                raise RuntimeError("prior timing attempt slot does not match request")
            expected_parent = (
                attempts[expected_number - 2].speech.run_id
                if expected_number > 1
                else None
            )
            if (
                attempt.context.parent_run_id != expected_parent
                or attempt.speech.parent_run_id != expected_parent
            ):
                raise RuntimeError("prior timing attempt lineage is invalid")
            if not (
                attempt.speech.stored_manifest_valid
                and attempt.speech.stored_manifest_hash_matches
                and attempt.speech.stored_asset_hash_matches
            ):
                raise RuntimeError("prior speech asset or manifest is unverified")
        if attempts[0].context.translated_text != request.initial_translation.strip():
            raise RuntimeError(
                "prior timing attempt does not match the initial translation"
            )
        last = attempts[-1]
        if (
            last.retry_number != len(attempts) + 1
            or last.timing_action
            not in {
                TimingAction.RETRY_SHORTER.value,
                TimingAction.RETRY_EXPANDED.value,
            }
        ):
            raise RuntimeError(
                "prior timing attempts do not end at a resumable rewrite"
            )


def correction_attempt_from_dict(payload: object) -> CorrectionAttempt:
    """Validate one durable timing-attempt record into its domain shape."""

    if not isinstance(payload, dict):
        raise ValueError("timing attempt must be a JSON object")
    context_payload = payload.get("context")
    speech_payload = payload.get("speech")
    if not isinstance(context_payload, dict) or not isinstance(
        speech_payload,
        dict,
    ):
        raise ValueError("timing attempt context or speech is malformed")
    try:
        return CorrectionAttempt(
            context=AttemptContext(**context_payload),
            speech=SpeechArtifact(**speech_payload),
            slot_seconds=float(payload["slot_seconds"]),
            drift_seconds=float(payload["drift_seconds"]),
            drift_ratio=float(payload["drift_ratio"]),
            absolute_drift_ratio=float(payload["absolute_drift_ratio"]),
            timing_band=str(payload["timing_band"]),
            timing_direction=str(payload["timing_direction"]),
            timing_action=str(payload["timing_action"]),
            reason=str(payload["reason"]),
            retry_number=(
                int(payload["retry_number"])
                if payload.get("retry_number") is not None
                else None
            ),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("timing attempt record is malformed") from exc


def timing_correction_outcome_from_dict(
    payload: object,
) -> TimingCorrectionOutcome:
    """Validate a durable correction summary into its domain shape."""

    if not isinstance(payload, dict):
        raise ValueError("timing correction summary must be a JSON object")
    raw_attempts = payload.get("attempts")
    if not isinstance(raw_attempts, (list, tuple)):
        raise ValueError("timing correction summary has no attempts")
    try:
        return TimingCorrectionOutcome(
            project_id=str(payload["project_id"]),
            job_id=str(payload["job_id"]),
            segment_id=str(payload["segment_id"]),
            status=CorrectionStatus(str(payload["status"])),
            selected_attempt_number=int(payload["selected_attempt_number"]),
            attempts=tuple(
                correction_attempt_from_dict(attempt)
                for attempt in raw_attempts
            ),
            total_generated_characters=int(
                payload["total_generated_characters"]
            ),
            total_generated_seconds=float(payload["total_generated_seconds"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("timing correction summary is malformed") from exc


class ScriptedTranslationRewriter:
    """Honest, deterministic rewriter for tests and a reviewed live spike."""

    def __init__(
        self,
        revisions: tuple[str, ...],
        *,
        name: str = "scripted-reviewed-rewrite",
    ) -> None:
        self._revisions = revisions
        self._cursor = 0
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    def rewrite(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        instruction: str,
    ) -> str:
        if self._cursor >= len(self._revisions):
            raise RewriteError("no scripted revision remains")
        revision = self._revisions[self._cursor]
        self._cursor += 1
        return revision
