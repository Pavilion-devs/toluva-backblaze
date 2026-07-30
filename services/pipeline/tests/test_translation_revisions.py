import json
from datetime import UTC, datetime

import pytest

from toluva_pipeline.domain.correction import (
    AttemptContext,
    RewriteError,
    TimingCorrectionRequest,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.translation_revisions import (
    B2ApprovedTranslationRewriter,
    RewriteApprovalRequired,
    build_approved_revision_record,
    revision_request_binding_sha256,
)


class MemoryBackend:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def put(self, key: str, data: bytes, *, content_type: str) -> None:
        self.objects[key] = data


def request() -> TimingCorrectionRequest:
    return TimingCorrectionRequest(
        project_id="project-01",
        job_id="job-01",
        segment_id="segment-002",
        source_text="Keep Toluva in time.",
        initial_translation="Toluva muss jederzeit im Zeitrahmen bleiben.",
        source_language="English",
        target_language="German",
        target_seconds=2.0,
        protected_terms=("Toluva",),
    )


def context() -> AttemptContext:
    text = request().initial_translation
    import hashlib

    return AttemptContext(
        attempt_number=2,
        translated_text=text,
        text_sha256=hashlib.sha256(text.encode()).hexdigest(),
        instruction="Shorten the approved German wording to fit 2.00s.",
        requested_action="retry_shorter",
        parent_run_id="run-001",
        idempotency_key="idem-001",
    )


def test_missing_revision_records_request_and_blocks_before_tts() -> None:
    backend = MemoryBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys("project-01")
    rewriter = B2ApprovedTranslationRewriter(
        backend,  # type: ignore[arg-type]
        keys=keys,
        scope=scope,
        clock=lambda: datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
    )

    with pytest.raises(RewriteApprovalRequired) as blocked:
        rewriter.rewrite(request(), context(), context().instruction or "")

    request_key = keys.translation_revision_request(scope, "segment-002", 2)
    payload = json.loads(backend.objects[request_key])
    assert blocked.value.request_key == request_key
    assert payload["record_type"] == "translation_revision_request"
    assert payload["current_translation_sha256"] == context().text_sha256
    assert len(backend.objects) == 1


def test_exact_hash_bound_approval_is_replayed_without_mutating_request() -> None:
    backend = MemoryBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys("project-01")
    rewriter = B2ApprovedTranslationRewriter(
        backend,  # type: ignore[arg-type]
        keys=keys,
        scope=scope,
        clock=lambda: datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
    )
    instruction = context().instruction or ""
    with pytest.raises(RewriteApprovalRequired):
        rewriter.rewrite(request(), context(), instruction)

    request_key = keys.translation_revision_request(scope, "segment-002", 2)
    approval_key = keys.translation_approved_revision(scope, "segment-002", 2)
    request_record = json.loads(backend.objects[request_key])
    approval = build_approved_revision_record(
        request_record,
        revised_text="Toluva bleibt im Takt.",
        approved_by="operator-01",
        approved_at=datetime(2026, 7, 30, 12, 5, tzinfo=UTC),
    )
    backend.objects[approval_key] = (
        json.dumps(approval, indent=2, sort_keys=True) + "\n"
    ).encode()

    assert (
        rewriter.rewrite(request(), context(), instruction)
        == "Toluva bleibt im Takt."
    )
    assert len(backend.objects) == 2


def test_revision_request_binding_is_stable_for_unicode_text() -> None:
    request_record = {
        "record_type": "translation_revision_request",
        "project_id": "project-01",
        "job_id": "job-01",
        "segment_id": "segment-002",
        "attempt_number": 2,
        "source_text_sha256": "a" * 64,
        "current_translation_sha256": "b" * 64,
        "instruction_sha256": "c" * 64,
        "target_seconds": 2.0,
        "requested_action": "retry_shorter",
        "parent_run_id": "run-001",
        "source_language": "English",
        "target_language": "German",
        "protected_terms": ["Toluva", "Stimme"],
        "current_translation": "Toluva hält die Stimme im Takt.",
    }

    assert revision_request_binding_sha256(request_record) == (
        "67a45f5c7577bee8e1dba81390570b2e3b7846f729b9d4d475ac5e4ceb8969bf"
    )


def test_mismatched_or_term_losing_approval_is_rejected() -> None:
    backend = MemoryBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys("project-01")
    rewriter = B2ApprovedTranslationRewriter(
        backend,  # type: ignore[arg-type]
        keys=keys,
        scope=scope,
        clock=lambda: datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
    )
    instruction = context().instruction or ""
    with pytest.raises(RewriteApprovalRequired):
        rewriter.rewrite(request(), context(), instruction)
    request_record = json.loads(
        backend.objects[
            keys.translation_revision_request(scope, "segment-002", 2)
        ]
    )
    with pytest.raises(ValueError, match="protected"):
        build_approved_revision_record(
            request_record,
            revised_text="Die Stimme bleibt im Takt.",
            approved_by="operator-01",
            approved_at=datetime(2026, 7, 30, 12, 5, tzinfo=UTC),
        )

    approval = build_approved_revision_record(
        request_record,
        revised_text="Toluva bleibt im Takt.",
        approved_by="operator-01",
        approved_at=datetime(2026, 7, 30, 12, 5, tzinfo=UTC),
    )
    approval["instruction_sha256"] = "0" * 64
    backend.objects[
        keys.translation_approved_revision(scope, "segment-002", 2)
    ] = json.dumps(approval).encode()
    with pytest.raises(RewriteError, match="does not match"):
        rewriter.rewrite(request(), context(), instruction)
