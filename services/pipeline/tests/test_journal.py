import json

import pytest

from toluva_pipeline.domain.correction import AttemptContext, TimingCorrectionRequest
from toluva_pipeline.storage.journal import (
    B2CorrectionJournal,
    ExistingCorrectionRunError,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


class FakeBackend:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def put(
        self,
        key: str,
        data: bytes,
        *,
        content_type: str | None = None,
    ) -> str:
        self.objects[key] = data
        return f"memory://{key}"


def test_journal_writes_translation_once_and_blocks_overwrite() -> None:
    backend = FakeBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys("project-01")
    journal = B2CorrectionJournal(backend, keys=keys, scope=scope)  # type: ignore[arg-type]
    request = TimingCorrectionRequest(
        project_id="project-01",
        job_id="job-01",
        segment_id="segment-01",
        source_text="Hello Toluva.",
        initial_translation="Hallo Toluva.",
        source_language="English",
        target_language="German",
        target_seconds=2.0,
        protected_terms=("Toluva",),
    )
    context = AttemptContext(
        attempt_number=1,
        translated_text="Hallo Toluva.",
        text_sha256="abc",
        instruction=None,
        requested_action="initial_generation",
        parent_run_id=None,
        idempotency_key="idem-01",
    )

    journal.assert_fresh(request.segment_id)
    journal.before_generation(request, context)
    key = keys.translation_attempt(scope, request.segment_id, 1)
    payload = json.loads(backend.objects[key])
    assert payload["record_type"] == "translation_attempt"
    assert payload["idempotency_key"] == "idem-01"
    with pytest.raises(ExistingCorrectionRunError):
        journal.before_generation(request, context)
    with pytest.raises(ExistingCorrectionRunError):
        journal.assert_fresh(request.segment_id)
