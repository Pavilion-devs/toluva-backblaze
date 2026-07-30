"""Hash-bound, human-approved translation revisions stored in B2."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.correction import (
    AttemptContext,
    RewriteError,
    TimingCorrectionRequest,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable


class RewriteApprovalRequired(RewriteError):
    """Raised before another TTS call when no approved revision exists."""

    def __init__(
        self,
        *,
        segment_id: str,
        attempt_number: int,
        request_key: str,
        approval_key: str,
    ) -> None:
        super().__init__(
            "An approved translation revision is required before another "
            "speech attempt."
        )
        self.segment_id = segment_id
        self.attempt_number = attempt_number
        self.request_key = request_key
        self.approval_key = approval_key


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_approved_revision_record(
    request_record: object,
    *,
    revised_text: str,
    approved_by: str,
    approved_at: datetime,
) -> dict[str, object]:
    """Build an approval that remains bound to one exact rewrite request."""

    if not isinstance(request_record, dict):
        raise ValueError("translation revision request must be a JSON object")
    if request_record.get("record_type") != "translation_revision_request":
        raise ValueError("translation revision request has the wrong record type")
    normalized = revised_text.strip()
    if not normalized:
        raise ValueError("approved translation revision must not be empty")
    if normalized == request_record.get("current_translation"):
        raise ValueError("approved translation revision must change the text")
    protected_terms = tuple(
        str(value) for value in request_record.get("protected_terms", ())
    )
    missing = tuple(term for term in protected_terms if term not in normalized)
    if missing:
        raise ValueError(
            "approved translation revision lost protected terms: "
            + ", ".join(missing)
        )
    if not approved_by.strip():
        raise ValueError("approved_by must not be empty")
    if approved_at.tzinfo is None:
        raise ValueError("approved_at must be timezone-aware")
    return {
        "schema_version": "1.0",
        "record_type": "approved_translation_revision",
        "decision": "approved",
        "project_id": request_record["project_id"],
        "job_id": request_record["job_id"],
        "segment_id": request_record["segment_id"],
        "attempt_number": request_record["attempt_number"],
        "request_sha256": _sha256_text(
            json.dumps(request_record, sort_keys=True, separators=(",", ":"))
        ),
        "source_text_sha256": request_record["source_text_sha256"],
        "current_translation_sha256": request_record[
            "current_translation_sha256"
        ],
        "instruction_sha256": request_record["instruction_sha256"],
        "target_seconds": request_record["target_seconds"],
        "protected_terms": list(protected_terms),
        "revised_text": normalized,
        "revised_text_sha256": _sha256_text(normalized),
        "approved_by": approved_by.strip(),
        "approved_at": approved_at.astimezone(UTC).isoformat(),
    }


class B2ApprovedTranslationRewriter:
    """Read only an exact operator-approved revision after recording the request."""

    def __init__(
        self,
        backend: S3StorageBackend,
        *,
        keys: ToluvaObjectKeys,
        scope: StorageScope,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._backend = backend
        self._keys = keys
        self._scope = scope
        self._clock = clock or (lambda: datetime.now(UTC))

    @property
    def name(self) -> str:
        return "b2-human-approved-translation-memory"

    def rewrite(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
        instruction: str,
    ) -> str:
        if (
            request.project_id != self._scope.project_id
            or request.job_id != self._scope.job_id
        ):
            raise RewriteError(
                "translation rewrite request does not match storage scope"
            )
        request_key = self._keys.translation_revision_request(
            self._scope,
            request.segment_id,
            context.attempt_number,
        )
        approval_key = self._keys.translation_approved_revision(
            self._scope,
            request.segment_id,
            context.attempt_number,
        )
        request_fields = {
            "schema_version": "1.0",
            "record_type": "translation_revision_request",
            "project_id": request.project_id,
            "job_id": request.job_id,
            "segment_id": request.segment_id,
            "attempt_number": context.attempt_number,
            "requested_action": context.requested_action,
            "parent_run_id": context.parent_run_id,
            "source_language": request.source_language,
            "target_language": request.target_language,
            "source_text_sha256": _sha256_text(request.source_text),
            "current_translation": context.translated_text,
            "current_translation_sha256": context.text_sha256,
            "instruction": instruction,
            "instruction_sha256": _sha256_text(instruction),
            "target_seconds": request.target_seconds,
            "protected_terms": list(request.protected_terms),
        }
        if self._backend.exists(request_key):
            request_record = json.loads(self._backend.get(request_key))
            if not isinstance(request_record, dict) or any(
                request_record.get(key) != value
                for key, value in request_fields.items()
            ):
                raise RewriteError(
                    "stored translation revision request does not match"
                )
        else:
            request_record = {
                **request_fields,
                "created_at": self._clock().astimezone(UTC).isoformat(),
            }
            put_immutable(
                self._backend,
                request_key,
                (
                    json.dumps(request_record, indent=2, sort_keys=True) + "\n"
                ).encode("utf-8"),
                content_type="application/json",
            )
        if not self._backend.exists(approval_key):
            raise RewriteApprovalRequired(
                segment_id=request.segment_id,
                attempt_number=context.attempt_number,
                request_key=request_key,
                approval_key=approval_key,
            )
        approval = json.loads(self._backend.get(approval_key))
        self._validate_approval(
            approval,
            request_record=request_record,
            request=request,
            context=context,
        )
        return str(approval["revised_text"]).strip()

    @staticmethod
    def _validate_approval(
        approval: object,
        *,
        request_record: dict[str, object],
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> None:
        if not isinstance(approval, dict):
            raise RewriteError("approved translation revision is malformed")
        expected_request_sha256 = _sha256_text(
            json.dumps(request_record, sort_keys=True, separators=(",", ":"))
        )
        revised_text = str(approval.get("revised_text", "")).strip()
        required_matches = {
            "record_type": "approved_translation_revision",
            "decision": "approved",
            "project_id": request.project_id,
            "job_id": request.job_id,
            "segment_id": request.segment_id,
            "attempt_number": context.attempt_number,
            "request_sha256": expected_request_sha256,
            "source_text_sha256": _sha256_text(request.source_text),
            "current_translation_sha256": context.text_sha256,
            "instruction_sha256": _sha256_text(
                str(request_record["instruction"])
            ),
            "revised_text_sha256": _sha256_text(revised_text),
        }
        if any(approval.get(key) != value for key, value in required_matches.items()):
            raise RewriteError(
                "approved translation revision does not match its request"
            )
        if float(approval.get("target_seconds", 0)) != request.target_seconds:
            raise RewriteError(
                "approved translation revision target duration changed"
            )
        if tuple(approval.get("protected_terms", ())) != request.protected_terms:
            raise RewriteError(
                "approved translation revision protected terms changed"
            )
        if not revised_text or revised_text == context.translated_text:
            raise RewriteError("approved translation revision is unusable")
        if any(term not in revised_text for term in request.protected_terms):
            raise RewriteError(
                "approved translation revision lost a protected term"
            )
