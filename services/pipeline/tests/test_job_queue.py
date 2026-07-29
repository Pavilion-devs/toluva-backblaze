import json
from datetime import UTC, datetime

import pytest

from toluva_pipeline.job_queue import JobStatusWriter, QueuedJobRequest
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


class MemoryBackend:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def put(self, key: str, data: bytes, *, content_type: str) -> None:
        self.objects[key] = data


def request_payload() -> dict[str, object]:
    project_id = f"intake-{'a' * 32}"
    job_id = f"localize-{'b' * 32}"
    source_id = f"source-{'c' * 32}"
    return {
        "schema_version": "1.0",
        "record_type": "localization_job_request",
        "project_id": project_id,
        "job_id": job_id,
        "source_asset_id": source_id,
        "source_key": (
            f"projects/{project_id}/source/master/{source_id}.mp4"
        ),
        "source_sha256": "d" * 64,
        "source_size_bytes": 1024,
        "target_language": "de-DE",
        "purpose": "internal-training",
        "authorization_id": "auth-stock-intake-v1",
        "protected_terms": ["Toluva"],
        "development_sample": False,
        "version": "live-v1",
        "state": "queued",
        "created_at": "2026-07-29T12:00:00+00:00",
    }


def test_queue_request_accepts_only_the_exact_governed_contract() -> None:
    request = QueuedJobRequest.from_payload(request_payload())
    assert request.target_language == "de-DE"
    assert request.protected_terms == ("Toluva",)
    assert request.source_key.endswith(".mp4")


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("target_language", "fr-FR"),
        ("purpose", "public-marketing"),
        ("protected_terms", []),
        ("source_sha256", "invalid"),
    ],
)
def test_queue_request_rejects_contract_changes(
    field: str,
    value: object,
) -> None:
    payload = request_payload()
    payload[field] = value
    with pytest.raises(ValueError):
        QueuedJobRequest.from_payload(payload)


def test_status_writer_is_append_only_and_idempotent() -> None:
    backend = MemoryBackend()
    scope = StorageScope(
        f"intake-{'a' * 32}",
        f"localize-{'b' * 32}",
        "de-DE",
    )
    keys = ToluvaObjectKeys(scope.project_id)
    writer = JobStatusWriter(
        backend,  # type: ignore[arg-type]
        scope=scope,
        keys=keys,
        clock=lambda: datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
    )
    writer.emit("claimed", "Claimed once.")
    writer.emit("claimed", "A replay must not overwrite the first event.")
    key = keys.status_event(scope, 2, "claimed")
    payload = json.loads(backend.objects[key])
    assert payload["sequence"] == 2
    assert payload["state"] == "running"
    assert payload["message"] == "Claimed once."
    assert len(backend.objects) == 1
