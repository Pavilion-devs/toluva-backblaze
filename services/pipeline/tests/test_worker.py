import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from toluva_pipeline.domain.transcript_quality import TranscriptQualityBlocked
from toluva_pipeline.job_queue import TARGET_LANGUAGE
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.worker import (
    WORKER_HEARTBEAT_KEY,
    HeartbeatPublisher,
    QueueWorkerRuntime,
    WorkerState,
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

    def list(
        self,
        prefix: str,
        *,
        max_keys: int,
        continuation_token: str | None = None,
    ) -> SimpleNamespace:
        assert continuation_token is None
        entries = tuple(
            SimpleNamespace(
                key=key,
                last_modified=datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
            )
            for key in self.objects
            if key.startswith(prefix)
        )
        return SimpleNamespace(entries=entries, next_token=None)


def settings(*, replicas: int = 1) -> Settings:
    return Settings(
        work_dir=Path("work"),
        max_timing_retries=2,
        green_drift_threshold=0.08,
        amber_drift_threshold=0.15,
        b2_key_id="key",
        b2_app_key="secret",
        b2_bucket="bucket",
        b2_region="region",
        elevenlabs_api_key="eleven",
        assemblyai_api_key=None,
        openai_api_key=None,
        worker_replica_count=replicas,
        worker_allow_provider_spend=True,
    )


def queued_request(
    backend: MemoryBackend,
) -> tuple[StorageScope, ToluvaObjectKeys]:
    scope = StorageScope(
        f"intake-{'a' * 32}",
        f"localize-{'b' * 32}",
        TARGET_LANGUAGE,
    )
    keys = ToluvaObjectKeys(scope.project_id)
    source_id = f"source-{'c' * 32}"
    backend.objects[keys.queue_request(scope)] = json.dumps(
        {
            "record_type": "localization_job_request",
            "project_id": scope.project_id,
            "job_id": scope.job_id,
            "source_asset_id": source_id,
            "source_key": keys.source_master(source_id, "mp4"),
            "source_sha256": "d" * 64,
            "source_size_bytes": 1,
            "target_language": "de-DE",
            "purpose": "internal-training",
            "authorization_id": "auth-stock-intake-v1",
            "protected_terms": ["Toluva"],
            "development_sample": False,
            "version": "live-v1",
            "state": "queued",
            "created_at": "2026-07-29T12:00:00+00:00",
        }
    ).encode()
    return scope, keys


def test_heartbeat_is_secret_safe_and_has_a_finite_lease() -> None:
    backend = MemoryBackend()
    publisher = HeartbeatPublisher(
        backend,  # type: ignore[arg-type]
        worker_id="worker-test",
        heartbeat_seconds=30,
        clock=lambda: datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
    )
    publisher.publish(
        WorkerState(
            "processing",
            project_id="intake-project",
            job_id="localize-job",
        )
    )
    payload = json.loads(backend.objects[WORKER_HEARTBEAT_KEY])
    assert payload["state"] == "processing"
    assert payload["lease_expires_at"] == "2026-07-29T12:01:30+00:00"
    assert "secret" not in json.dumps(payload)


def test_runtime_refuses_multiple_replicas() -> None:
    with pytest.raises(RuntimeError, match="exactly one"):
        QueueWorkerRuntime(
            settings(replicas=2),
            backend=MemoryBackend(),  # type: ignore[arg-type]
        )


def test_runtime_processes_one_job_and_returns_to_idle() -> None:
    backend = MemoryBackend()
    scope, _ = queued_request(backend)
    calls: list[tuple[str, str]] = []

    def processor(
        _settings: Settings,
        *,
        project_id: str,
        job_id: str,
    ) -> SimpleNamespace:
        calls.append((project_id, job_id))
        return SimpleNamespace(final_record_key="projects/final.json")

    runtime = QueueWorkerRuntime(
        settings(),
        backend=backend,  # type: ignore[arg-type]
        processor=processor,
        clock=lambda: datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
        worker_id="worker-test",
    )
    result = runtime.run_once()
    assert result["status"] == "completed"
    assert calls == [(scope.project_id, scope.job_id)]
    heartbeat = json.loads(backend.objects[WORKER_HEARTBEAT_KEY])
    assert heartbeat["state"] == "idle"


def test_runtime_reports_transcript_review_as_blocked() -> None:
    backend = MemoryBackend()
    scope, _ = queued_request(backend)

    def processor(
        _settings: Settings,
        *,
        project_id: str,
        job_id: str,
    ) -> object:
        assert (project_id, job_id) == (scope.project_id, scope.job_id)
        raise TranscriptQualityBlocked(("suspicious_trailing_fragment",))

    runtime = QueueWorkerRuntime(
        settings(),
        backend=backend,  # type: ignore[arg-type]
        processor=processor,
        clock=lambda: datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
        worker_id="worker-test",
    )
    result = runtime.run_once()
    assert result["status"] == "blocked"
    assert result["error_type"] == "TranscriptQualityBlocked"


def test_idle_poll_does_not_republish_the_heartbeat() -> None:
    backend = MemoryBackend()
    runtime = QueueWorkerRuntime(
        settings(),
        backend=backend,  # type: ignore[arg-type]
        clock=lambda: datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
        worker_id="worker-test",
    )

    assert runtime.run_once() == {"status": "idle"}
    assert WORKER_HEARTBEAT_KEY not in backend.objects
