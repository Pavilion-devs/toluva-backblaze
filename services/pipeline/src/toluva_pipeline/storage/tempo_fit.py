"""Hash-bound approval for reusing one overlong speech attempt locally."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.correction import (
    CorrectionAttempt,
    CorrectionStatus,
    TimingCorrectionOutcome,
    correction_attempt_from_dict,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable

DEFAULT_LOCAL_TEMPO_FACTOR = 1.08
MAX_APPROVABLE_LOCAL_TEMPO_FACTOR = 1.09


class LocalTempoFitApprovalError(RuntimeError):
    """Raised before composition when a local-fit approval does not verify."""


@dataclass(frozen=True)
class ApprovedLocalTempoFit:
    approval_key: str
    segment_id: str
    attempt_number: int
    tempo_factor: float
    approved_max_tempo_factor: float
    outcome: TimingCorrectionOutcome

    def evidence_dict(self) -> dict[str, object]:
        return {
            "approval_key": self.approval_key,
            "segment_id": self.segment_id,
            "attempt_number": self.attempt_number,
            "tempo_factor": self.tempo_factor,
            "approved_max_tempo_factor": self.approved_max_tempo_factor,
        }


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_bytes(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def _tempo_factor(attempt: CorrectionAttempt) -> float:
    if attempt.slot_seconds <= 0:
        raise LocalTempoFitApprovalError("timing attempt has no usable slot")
    factor = attempt.speech.generated_seconds / attempt.slot_seconds
    if not math.isfinite(factor) or factor <= 1:
        raise LocalTempoFitApprovalError(
            "local tempo fit requires an overlong speech attempt"
        )
    return factor


def build_approved_local_tempo_fit_record(
    *,
    timing_record: object,
    timing_record_bytes: bytes,
    timing_attempt_key: str,
    audio_bytes: bytes,
    superseded_revision_request_bytes: bytes,
    superseded_revision_request_key: str,
    approved_max_tempo_factor: float,
    approved_by: str,
    approved_at: datetime,
) -> dict[str, object]:
    """Build one approval without authorizing a provider call or a rewrite."""

    if not isinstance(timing_record, dict):
        raise ValueError("timing attempt must be a JSON object")
    attempt = correction_attempt_from_dict(timing_record)
    factor = _tempo_factor(attempt)
    if attempt.timing_direction != "over":
        raise ValueError("local tempo fit requires overlong timing evidence")
    if attempt.retry_number is None:
        raise ValueError("timing attempt has no outstanding retry to supersede")
    if factor <= DEFAULT_LOCAL_TEMPO_FACTOR + 1e-9:
        raise ValueError("timing attempt does not require an approved cap")
    if (
        not math.isfinite(approved_max_tempo_factor)
        or approved_max_tempo_factor > MAX_APPROVABLE_LOCAL_TEMPO_FACTOR + 1e-9
        or approved_max_tempo_factor < factor - 1e-9
    ):
        raise ValueError("approved tempo cap is outside the bounded local limit")
    if not approved_by.strip():
        raise ValueError("approved_by must not be empty")
    if approved_at.tzinfo is None:
        raise ValueError("approved_at must be timezone-aware")
    if not audio_bytes:
        raise ValueError("approved speech audio must not be empty")
    try:
        revision_request = json.loads(superseded_revision_request_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("superseded revision request is malformed") from exc
    if not isinstance(revision_request, dict):
        raise ValueError("superseded revision request is malformed")
    try:
        revision_attempt_number = int(
            revision_request.get("attempt_number", 0)
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("superseded revision request is malformed") from exc
    if (
        revision_request.get("record_type")
        != "translation_revision_request"
        or revision_attempt_number != attempt.retry_number
        or revision_request.get("segment_id")
        != timing_record.get("segment_id")
    ):
        raise ValueError("superseded revision request does not match the attempt")
    return {
        "schema_version": "1.0",
        "record_type": "approved_local_tempo_fit",
        "decision": "approved",
        "project_id": timing_record["project_id"],
        "job_id": timing_record["job_id"],
        "segment_id": timing_record["segment_id"],
        "attempt_number": attempt.context.attempt_number,
        "timing_attempt_key": timing_attempt_key,
        "timing_attempt_sha256": _sha256(timing_record_bytes),
        "speech_audio_key": attempt.speech.audio_key,
        "speech_audio_sha256": _sha256(audio_bytes),
        "speech_manifest_key": attempt.speech.manifest_key,
        "speech_manifest_hash": attempt.speech.manifest_hash,
        "generated_seconds": attempt.speech.generated_seconds,
        "target_seconds": attempt.slot_seconds,
        "tempo_factor": factor,
        "previous_max_tempo_factor": DEFAULT_LOCAL_TEMPO_FACTOR,
        "approved_max_tempo_factor": approved_max_tempo_factor,
        "superseded_revision_request_key": superseded_revision_request_key,
        "superseded_revision_request_sha256": _sha256(
            superseded_revision_request_bytes
        ),
        "provider_call_authorized": False,
        "review_method": "operator_listened_to_existing_audio_tempo_preview",
        "approved_by": approved_by.strip(),
        "approved_at": approved_at.astimezone(UTC).isoformat(),
    }


class B2ApprovedLocalTempoFitStore:
    """Create and verify exact, immutable local-fit approvals in B2."""

    def __init__(
        self,
        backend: S3StorageBackend,
        *,
        keys: ToluvaObjectKeys,
        scope: StorageScope,
    ) -> None:
        self._backend = backend
        self._keys = keys
        self._scope = scope

    def approve(
        self,
        *,
        segment_id: str,
        attempt_number: int,
        approved_max_tempo_factor: float,
        approved_by: str,
        approved_at: datetime,
    ) -> ApprovedLocalTempoFit:
        timing_key = self._keys.timing_attempt(
            self._scope,
            segment_id,
            attempt_number,
        )
        timing_bytes = self._backend.get(timing_key)
        timing_record = json.loads(timing_bytes)
        attempt = correction_attempt_from_dict(timing_record)
        approval_key = self._keys.local_tempo_fit_approval(
            self._scope,
            segment_id,
            attempt_number,
        )
        if self._backend.exists(approval_key):
            loaded = self.load(
                segment_id=segment_id,
                attempts=(attempt,),
            )
            if loaded is None:
                raise LocalTempoFitApprovalError(
                    "stored local tempo-fit approval could not be reloaded"
                )
            return loaded
        if attempt.retry_number is None:
            raise ValueError("timing attempt has no retry request to supersede")
        revision_key = self._keys.translation_revision_request(
            self._scope,
            segment_id,
            attempt.retry_number,
        )
        revision_bytes = self._backend.get(revision_key)
        audio_bytes = self._backend.get(attempt.speech.audio_key)
        payload = build_approved_local_tempo_fit_record(
            timing_record=timing_record,
            timing_record_bytes=timing_bytes,
            timing_attempt_key=timing_key,
            audio_bytes=audio_bytes,
            superseded_revision_request_bytes=revision_bytes,
            superseded_revision_request_key=revision_key,
            approved_max_tempo_factor=approved_max_tempo_factor,
            approved_by=approved_by,
            approved_at=approved_at,
        )
        put_immutable(
            self._backend,
            approval_key,
            _json_bytes(payload),
            content_type="application/json",
        )
        loaded = self.load(
            segment_id=segment_id,
            attempts=(attempt,),
        )
        if loaded is None:
            raise LocalTempoFitApprovalError(
                "stored local tempo-fit approval could not be reloaded"
            )
        return loaded

    def load(
        self,
        *,
        segment_id: str,
        attempts: tuple[CorrectionAttempt, ...],
    ) -> ApprovedLocalTempoFit | None:
        for attempt in reversed(attempts):
            approval_key = self._keys.local_tempo_fit_approval(
                self._scope,
                segment_id,
                attempt.context.attempt_number,
            )
            if not self._backend.exists(approval_key):
                continue
            return self._validated(
                approval_key=approval_key,
                segment_id=segment_id,
                attempt=attempt,
                attempts=attempts,
            )
        return None

    def _validated(
        self,
        *,
        approval_key: str,
        segment_id: str,
        attempt: CorrectionAttempt,
        attempts: tuple[CorrectionAttempt, ...],
    ) -> ApprovedLocalTempoFit:
        try:
            approval = json.loads(self._backend.get(approval_key))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise LocalTempoFitApprovalError(
                "local tempo-fit approval is malformed"
            ) from exc
        if not isinstance(approval, dict):
            raise LocalTempoFitApprovalError(
                "local tempo-fit approval must be a JSON object"
            )
        timing_key = self._keys.timing_attempt(
            self._scope,
            segment_id,
            attempt.context.attempt_number,
        )
        timing_bytes = self._backend.get(timing_key)
        try:
            stored_attempt = correction_attempt_from_dict(
                json.loads(timing_bytes)
            )
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            raise LocalTempoFitApprovalError(
                "stored timing attempt is malformed"
            ) from exc
        if stored_attempt != attempt:
            raise LocalTempoFitApprovalError(
                "timing summary conflicts with its immutable attempt"
            )
        audio_bytes = self._backend.get(attempt.speech.audio_key)
        if attempt.retry_number is None:
            raise LocalTempoFitApprovalError(
                "approved timing attempt has no retry request"
            )
        revision_key = self._keys.translation_revision_request(
            self._scope,
            segment_id,
            attempt.retry_number,
        )
        revision_bytes = self._backend.get(revision_key)
        factor = _tempo_factor(attempt)
        expected = {
            "schema_version": "1.0",
            "record_type": "approved_local_tempo_fit",
            "decision": "approved",
            "project_id": self._scope.project_id,
            "job_id": self._scope.job_id,
            "segment_id": segment_id,
            "attempt_number": attempt.context.attempt_number,
            "timing_attempt_key": timing_key,
            "timing_attempt_sha256": _sha256(timing_bytes),
            "speech_audio_key": attempt.speech.audio_key,
            "speech_audio_sha256": _sha256(audio_bytes),
            "speech_manifest_key": attempt.speech.manifest_key,
            "speech_manifest_hash": attempt.speech.manifest_hash,
            "generated_seconds": attempt.speech.generated_seconds,
            "target_seconds": attempt.slot_seconds,
            "tempo_factor": factor,
            "previous_max_tempo_factor": DEFAULT_LOCAL_TEMPO_FACTOR,
            "superseded_revision_request_key": revision_key,
            "superseded_revision_request_sha256": _sha256(revision_bytes),
            "provider_call_authorized": False,
            "review_method": (
                "operator_listened_to_existing_audio_tempo_preview"
            ),
        }
        if any(approval.get(key) != value for key, value in expected.items()):
            raise LocalTempoFitApprovalError(
                "local tempo-fit approval does not match immutable evidence"
            )
        try:
            approved_max = float(approval["approved_max_tempo_factor"])
            approved_at = datetime.fromisoformat(str(approval["approved_at"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise LocalTempoFitApprovalError(
                "local tempo-fit approval has invalid approval fields"
            ) from exc
        if (
            approved_at.tzinfo is None
            or not str(approval.get("approved_by", "")).strip()
            or approved_max > MAX_APPROVABLE_LOCAL_TEMPO_FACTOR + 1e-9
            or approved_max < factor - 1e-9
            or factor <= DEFAULT_LOCAL_TEMPO_FACTOR + 1e-9
        ):
            raise LocalTempoFitApprovalError(
                "local tempo-fit approval exceeds its bounded authority"
            )
        selected_number = attempt.context.attempt_number
        outcome = TimingCorrectionOutcome(
            project_id=self._scope.project_id,
            job_id=self._scope.job_id,
            segment_id=segment_id,
            status=CorrectionStatus.TEMPO_FIT,
            selected_attempt_number=selected_number,
            attempts=attempts,
            total_generated_characters=sum(
                len(item.context.translated_text) for item in attempts
            ),
            total_generated_seconds=sum(
                item.speech.generated_seconds for item in attempts
            ),
        )
        return ApprovedLocalTempoFit(
            approval_key=approval_key,
            segment_id=segment_id,
            attempt_number=selected_number,
            tempo_factor=factor,
            approved_max_tempo_factor=approved_max,
            outcome=outcome,
        )
