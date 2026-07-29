"""Append-only B2 records for timing-correction attempts."""

from __future__ import annotations

import json
from dataclasses import asdict

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.correction import (
    AttemptContext,
    CorrectionAttempt,
    TimingCorrectionOutcome,
    TimingCorrectionRequest,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


class ExistingCorrectionRunError(RuntimeError):
    """Raised before generation when a job/segment already has durable state."""


class B2CorrectionJournal:
    """Write each translation, QA decision, and failure to a distinct B2 key."""

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

    def assert_fresh(self, segment_id: str) -> None:
        first_translation = self._keys.translation_attempt(
            self._scope,
            segment_id,
            1,
        )
        summary = self._keys.timing_summary(self._scope, segment_id)
        if self._backend.exists(first_translation) or self._backend.exists(summary):
            raise ExistingCorrectionRunError(
                "This job and segment already have durable timing-correction state."
            )

    def before_generation(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> None:
        key = self._keys.translation_attempt(
            self._scope,
            request.segment_id,
            context.attempt_number,
        )
        self._put_new_json(
            key,
            {
                "schema_version": "1.0",
                "record_type": "translation_attempt",
                "project_id": request.project_id,
                "job_id": request.job_id,
                "segment_id": request.segment_id,
                "source_language": request.source_language,
                "target_language": request.target_language,
                "target_seconds": request.target_seconds,
                "protected_terms": list(request.protected_terms),
                **asdict(context),
            },
        )

    def generation_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_type: str,
    ) -> None:
        key = self._keys.attempt_failure(
            self._scope,
            request.segment_id,
            context.attempt_number,
            "generation",
        )
        self._put_new_json(
            key,
            {
                "schema_version": "1.0",
                "record_type": "generation_failure",
                "project_id": request.project_id,
                "job_id": request.job_id,
                "segment_id": request.segment_id,
                "attempt_number": context.attempt_number,
                "idempotency_key": context.idempotency_key,
                "parent_run_id": context.parent_run_id,
                "error_type": error_type,
                "message": "Speech generation failed; inspect protected worker logs.",
            },
        )

    def attempt_completed(
        self,
        request: TimingCorrectionRequest,
        attempt: CorrectionAttempt,
    ) -> None:
        key = self._keys.timing_attempt(
            self._scope,
            request.segment_id,
            attempt.context.attempt_number,
        )
        self._put_new_json(
            key,
            {
                "schema_version": "1.0",
                "record_type": "timing_attempt",
                **attempt.to_dict(),
            },
        )

    def rewrite_failed(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        error_code: str,
    ) -> None:
        key = self._keys.attempt_failure(
            self._scope,
            request.segment_id,
            context.attempt_number,
            "rewrite",
        )
        self._put_new_json(
            key,
            {
                "schema_version": "1.0",
                "record_type": "rewrite_failure",
                "project_id": request.project_id,
                "job_id": request.job_id,
                "segment_id": request.segment_id,
                "attempt_number": context.attempt_number,
                "parent_run_id": context.parent_run_id,
                "error_code": error_code,
                "message": "Translation rewrite failed validation before TTS.",
            },
        )

    def correction_completed(self, outcome: TimingCorrectionOutcome) -> None:
        key = self._keys.timing_summary(self._scope, outcome.segment_id)
        self._put_new_json(
            key,
            {
                "schema_version": "1.0",
                "record_type": "timing_correction_summary",
                **outcome.to_dict(),
            },
        )

    def _put_new_json(self, key: str, payload: dict[str, object]) -> None:
        if self._backend.exists(key):
            raise ExistingCorrectionRunError(
                f"Refusing to overwrite append-only correction record: {key}"
            )
        data = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
        self._backend.put(key, data, content_type="application/json")
