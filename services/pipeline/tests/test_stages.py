import json

import pytest

from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.stages import B2StageJournal, IncompleteStageError


class MemoryBackend:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def put(self, key: str, data: bytes, *, content_type: str) -> None:
        self.objects[key] = data


def journal() -> tuple[B2StageJournal, MemoryBackend]:
    backend = MemoryBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    return (
        B2StageJournal(
            backend,  # type: ignore[arg-type]
            keys=ToluvaObjectKeys("project-01"),
            scope=scope,
        ),
        backend,
    )


def test_stage_completion_is_reusable() -> None:
    stages, backend = journal()
    assert stages.begin(
        "transcription",
        idempotency_key="stable",
        provider="scribe",
        model="v2",
    )
    stages.complete("transcription", {"asset_key": "stored"})
    assert stages.begin(
        "transcription",
        idempotency_key="stable",
        provider="scribe",
        model="v2",
    ) is False
    assert stages.completion("transcription")["asset_key"] == "stored"
    assert all(
        json.loads(value)["record_type"].startswith("stage_")
        for value in backend.objects.values()
    )


def test_unresolved_intent_blocks_duplicate_spend() -> None:
    stages, _ = journal()
    stages.begin(
        "transcription",
        idempotency_key="stable",
        provider="scribe",
        model="v2",
    )
    with pytest.raises(IncompleteStageError, match="duplicate spend"):
        stages.begin(
            "transcription",
            idempotency_key="stable",
            provider="scribe",
            model="v2",
        )
