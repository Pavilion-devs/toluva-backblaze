"""Backblaze-backed durable queue consumption for uploaded localization jobs."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Callable

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.live_end_to_end import LiveEndToEndReport, run_live_end_to_end
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import build_b2_storage
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable

QUEUE_PATTERN = re.compile(
    r"^projects/(?P<project>intake-[a-f0-9]{32})/"
    r"jobs/(?P<job>localize-[a-f0-9]{32})/"
    r"de-de/queue/request\.json$"
)
JOB_VERSION = "live-v1"
TARGET_LANGUAGE = "de-DE"
PURPOSE = "internal-training"

STAGES: dict[str, tuple[int, str, str]] = {
    "claimed": (2, "running", "Claimed by the Python worker"),
    "source-ready": (3, "running", "Source verified"),
    "transcribing": (4, "running", "Transcribing timed speech"),
    "transcribed": (5, "running", "Transcript stored"),
    "translating": (6, "running", "Translating protected terms"),
    "translated": (7, "running", "Translation verified"),
    "authorized": (8, "running", "Voice authorization passed"),
    "synthesizing": (9, "running", "Generating localized speech"),
    "timing-qa": (10, "running", "Measuring timing drift"),
    "composing": (11, "running", "Composing final media"),
    "completed": (12, "completed", "Localization completed"),
    "failed": (99, "failed", "Localization stopped safely"),
}


def _json_bytes(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")


@dataclass(frozen=True)
class QueuedJobRequest:
    authorization_id: str
    created_at: str
    development_sample: bool
    job_id: str
    project_id: str
    protected_terms: tuple[str, ...]
    purpose: str
    source_asset_id: str
    source_key: str
    source_sha256: str
    source_size_bytes: int
    target_language: str
    version: str

    @classmethod
    def from_payload(cls, payload: object) -> "QueuedJobRequest":
        if not isinstance(payload, dict):
            raise ValueError("Queued job request must be a JSON object")
        if payload.get("record_type") != "localization_job_request":
            raise ValueError("Queued job request has the wrong record type")
        project_id = str(payload.get("project_id", ""))
        job_id = str(payload.get("job_id", ""))
        scope = StorageScope(project_id, job_id, TARGET_LANGUAGE)
        keys = ToluvaObjectKeys(project_id)
        source_asset_id = str(payload.get("source_asset_id", ""))
        source_key = str(payload.get("source_key", ""))
        if source_key != keys.source_master(source_asset_id, "mp4"):
            raise ValueError("Queued source key does not match its immutable handle")
        if str(payload.get("target_language", "")) != TARGET_LANGUAGE:
            raise ValueError("Queued target language is not authorized")
        if str(payload.get("purpose", "")) != PURPOSE:
            raise ValueError("Queued purpose is not authorized")
        if str(payload.get("version", "")) != JOB_VERSION:
            raise ValueError("Queued engine version is unsupported")
        if payload.get("state") != "queued":
            raise ValueError("Queued job request is not in the queued state")
        protected_terms = tuple(
            str(value) for value in payload.get("protected_terms", ())
        )
        if protected_terms != ("Toluva",):
            raise ValueError("Queued protected-term contract is unsupported")
        source_sha256 = str(payload.get("source_sha256", ""))
        if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
            raise ValueError("Queued source SHA-256 is invalid")
        source_size_bytes = int(payload.get("source_size_bytes", 0))
        if source_size_bytes < 1 or source_size_bytes > 12 * 1024 * 1024:
            raise ValueError("Queued source size is outside the intake limit")
        expected_request_key = keys.queue_request(scope)
        if not QUEUE_PATTERN.fullmatch(expected_request_key):
            raise ValueError("Queued job handle is outside the intake namespace")
        return cls(
            authorization_id=str(payload.get("authorization_id", "")),
            created_at=str(payload.get("created_at", "")),
            development_sample=bool(payload.get("development_sample", False)),
            job_id=job_id,
            project_id=project_id,
            protected_terms=protected_terms,
            purpose=PURPOSE,
            source_asset_id=source_asset_id,
            source_key=source_key,
            source_sha256=source_sha256,
            source_size_bytes=source_size_bytes,
            target_language=TARGET_LANGUAGE,
            version=JOB_VERSION,
        )


class JobStatusWriter:
    """Append one deterministic event per pipeline stage."""

    def __init__(
        self,
        backend: S3StorageBackend,
        *,
        scope: StorageScope,
        keys: ToluvaObjectKeys,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._backend = backend
        self._scope = scope
        self._keys = keys
        self._clock = clock or (lambda: datetime.now(UTC))

    def emit(self, stage: str, message: str) -> None:
        if stage not in STAGES:
            raise ValueError(f"Unknown queue stage: {stage}")
        sequence, state, label = STAGES[stage]
        key = self._keys.status_event(self._scope, sequence, stage)
        if self._backend.exists(key):
            return
        put_immutable(
            self._backend,
            key,
            _json_bytes(
                {
                    "schema_version": "1.0",
                    "record_type": "job_status_event",
                    "project_id": self._scope.project_id,
                    "job_id": self._scope.job_id,
                    "sequence": sequence,
                    "stage": stage,
                    "state": state,
                    "label": label,
                    "message": message,
                    "created_at": self._clock().isoformat(),
                }
            ),
            content_type="application/json",
        )


def _load_request(
    backend: S3StorageBackend,
    *,
    project_id: str,
    job_id: str,
) -> tuple[QueuedJobRequest, StorageScope, ToluvaObjectKeys]:
    scope = StorageScope(project_id, job_id, TARGET_LANGUAGE)
    keys = ToluvaObjectKeys(project_id)
    request_key = keys.queue_request(scope)
    payload = json.loads(backend.get(request_key))
    request = QueuedJobRequest.from_payload(payload)
    if request.project_id != project_id or request.job_id != job_id:
        raise ValueError("Queue request handle mismatch")
    return request, scope, keys


def process_queued_job(
    settings: Settings,
    *,
    project_id: str,
    job_id: str,
) -> LiveEndToEndReport:
    """Claim and execute one exact B2 job using the real Genblaze pipeline."""

    scope = StorageScope(project_id, job_id, TARGET_LANGUAGE)
    storage = build_b2_storage(settings, scope, preflight=True)
    request, scope, keys = _load_request(
        storage.backend,
        project_id=project_id,
        job_id=job_id,
    )
    source_bytes = storage.backend.get(request.source_key)
    if len(source_bytes) != request.source_size_bytes:
        raise ValueError("Queued source byte count changed")
    if hashlib.sha256(source_bytes).hexdigest() != request.source_sha256:
        raise ValueError("Queued source SHA-256 changed")

    status = JobStatusWriter(storage.backend, scope=scope, keys=keys)
    status.emit(
        "claimed",
        "A single worker claimed the immutable B2 request; provider stages are checkpointed.",
    )
    try:
        return run_live_end_to_end(
            settings,
            job_id=request.job_id,
            project_id=request.project_id,
            source_asset_id=request.source_asset_id,
            authorization_id=request.authorization_id,
            protected_terms=request.protected_terms,
            create_development_source_if_missing=False,
            development_sample=request.development_sample,
            source_kind="user-uploaded-engine-test",
            version=request.version,
            on_progress=status.emit,
        )
    except Exception:
        status.emit(
            "failed",
            "The worker preserved every completed checkpoint and stopped before an unsafe replay.",
        )
        raise


def find_next_queued_job(settings: Settings) -> tuple[str, str] | None:
    """Return the oldest unclaimed intake request from B2."""

    scanner_scope = StorageScope("queue-scanner", "queue-scanner", TARGET_LANGUAGE)
    backend = build_b2_storage(
        settings,
        scanner_scope,
        preflight=True,
    ).backend
    page = backend.list("projects/intake-", max_keys=1000)
    candidates = sorted(
        entry.key
        for entry in page.entries
        if QUEUE_PATTERN.fullmatch(entry.key)
    )
    for key in candidates:
        match = QUEUE_PATTERN.fullmatch(key)
        assert match is not None
        project_id = match.group("project")
        job_id = match.group("job")
        scope = StorageScope(project_id, job_id, TARGET_LANGUAGE)
        keys = ToluvaObjectKeys(project_id)
        if backend.exists(keys.status_event(scope, 12, "completed")):
            continue
        if backend.exists(keys.status_event(scope, 99, "failed")):
            continue
        if backend.exists(keys.status_event(scope, 2, "claimed")):
            continue
        return project_id, job_id
    return None


def process_next_queued_job(settings: Settings) -> LiveEndToEndReport | None:
    handle = find_next_queued_job(settings)
    if handle is None:
        return None
    return process_queued_job(
        settings,
        project_id=handle[0],
        job_id=handle[1],
    )
