import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from toluva_pipeline.job_queue import (
    JobStatusWriter,
    QueuedJobRequest,
    find_next_runnable_job,
)
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

    def list(
        self,
        prefix: str,
        *,
        max_keys: int,
    ) -> SimpleNamespace:
        entries = tuple(
            SimpleNamespace(
                key=key,
                last_modified=datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
            )
            for key in self.objects
            if key.startswith(prefix)
        )
        return SimpleNamespace(entries=entries, next_token=None)


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


def test_stale_claim_is_recovered_but_recent_claim_is_not() -> None:
    backend = MemoryBackend()
    payload = request_payload()
    scope = StorageScope(
        str(payload["project_id"]),
        str(payload["job_id"]),
        "de-DE",
    )
    keys = ToluvaObjectKeys(scope.project_id)
    backend.objects[keys.queue_request(scope)] = json.dumps(payload).encode()
    claim_key = keys.status_event(scope, 2, "claimed")
    backend.objects[claim_key] = json.dumps(
        {"created_at": "2026-07-29T12:00:00+00:00"}
    ).encode()

    assert (
        find_next_runnable_job(
            backend,  # type: ignore[arg-type]
            now=datetime(2026, 7, 29, 12, 1, tzinfo=UTC),
            stale_claim_seconds=90,
        )
        is None
    )
    assert find_next_runnable_job(
        backend,  # type: ignore[arg-type]
        now=datetime(2026, 7, 29, 12, 2, tzinfo=UTC),
        stale_claim_seconds=90,
    ) == (scope.project_id, scope.job_id)


def test_completed_or_failed_jobs_are_never_reclaimed() -> None:
    for terminal_sequence, terminal_stage in (
        (12, "completed"),
        (99, "failed"),
    ):
        backend = MemoryBackend()
        payload = request_payload()
        scope = StorageScope(
            str(payload["project_id"]),
            str(payload["job_id"]),
            "de-DE",
        )
        keys = ToluvaObjectKeys(scope.project_id)
        backend.objects[keys.queue_request(scope)] = json.dumps(payload).encode()
        backend.objects[
            keys.status_event(scope, terminal_sequence, terminal_stage)
        ] = b"{}"
        assert (
            find_next_runnable_job(
                backend,  # type: ignore[arg-type]
                now=datetime(2026, 7, 29, 13, 0, tzinfo=UTC),
                stale_claim_seconds=90,
            )
            is None
        )
