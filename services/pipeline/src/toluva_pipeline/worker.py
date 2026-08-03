"""Single-replica persistent worker for the Backblaze-backed Toluva queue."""

from __future__ import annotations

import argparse
import hashlib
import json
import signal
import sys
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from shutil import which
from typing import Callable

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.job_queue import (
    TARGET_LANGUAGE,
    find_next_runnable_job,
    process_queued_job,
)
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import build_b2_storage
from toluva_pipeline.storage.keys import StorageScope

WORKER_HEARTBEAT_KEY = (
    "projects/system-runtime/workers/primary/heartbeat.json"
)
WORKER_ENGINE_VERSION = "queue-v5"
MIN_WORKER_POLL_SECONDS = 60
MIN_WORKER_HEARTBEAT_SECONDS = 60
EXPECTED_WHISPER_SHA256 = (
    "2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef"
)
EXPECTED_ARGOS_SHA256 = (
    "c29ca0fe955386c79197d0fce05b9cec0fa68953e41254a27ca654ee0dfb175a"
)


def _json_bytes(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def worker_readiness(
    settings: Settings,
    *,
    verify_model_hashes: bool,
) -> dict[str, object]:
    model_root = settings.work_dir / "models"
    whisper_path = model_root / "whisper" / "base-en" / "model.bin"
    argos_path = (
        model_root
        / "argos"
        / "packages"
        / "translate-en_de-1_3"
        / "model"
        / "model.bin"
    )
    whisper_ready = whisper_path.is_file()
    argos_ready = argos_path.is_file()
    whisper_hash_matches = (
        _sha256(whisper_path) == EXPECTED_WHISPER_SHA256
        if verify_model_hashes and whisper_ready
        else None
    )
    argos_hash_matches = (
        _sha256(argos_path) == EXPECTED_ARGOS_SHA256
        if verify_model_hashes and argos_ready
        else None
    )
    return {
        "ready": all(
            (
                settings.b2_ready,
                settings.elevenlabs_ready,
                settings.worker_allow_provider_spend,
                settings.worker_replica_count == 1,
                settings.worker_poll_seconds >= MIN_WORKER_POLL_SECONDS,
                settings.worker_heartbeat_seconds
                >= MIN_WORKER_HEARTBEAT_SECONDS,
                settings.worker_stale_claim_seconds >= 30,
                which("ffmpeg"),
                which("ffprobe"),
                whisper_ready,
                argos_ready,
                whisper_hash_matches is not False,
                argos_hash_matches is not False,
            )
        ),
        "credentials": {
            "b2": settings.b2_ready,
            "elevenlabs": settings.elevenlabs_ready,
        },
        "media_tools": {
            "ffmpeg": which("ffmpeg") is not None,
            "ffprobe": which("ffprobe") is not None,
        },
        "models": {
            "argos_en_de_1_3": argos_ready,
            "argos_hash_matches": argos_hash_matches,
            "whisper_base_en": whisper_ready,
            "whisper_hash_matches": whisper_hash_matches,
        },
        "runtime": {
            "allow_provider_spend": settings.worker_allow_provider_spend,
            "heartbeat_seconds": settings.worker_heartbeat_seconds,
            "poll_seconds": settings.worker_poll_seconds,
            "replica_count": settings.worker_replica_count,
            "stale_claim_seconds": settings.worker_stale_claim_seconds,
        },
    }


def assert_worker_ready(settings: Settings) -> None:
    readiness = worker_readiness(settings, verify_model_hashes=True)
    if not readiness["ready"]:
        raise RuntimeError(
            "Worker readiness failed; inspect the secret-safe readiness command"
        )


@dataclass(frozen=True)
class WorkerState:
    state: str
    project_id: str | None = None
    job_id: str | None = None


class HeartbeatPublisher:
    """Publish the one intentionally mutable worker-liveness record."""

    def __init__(
        self,
        backend: S3StorageBackend,
        *,
        worker_id: str,
        heartbeat_seconds: int,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._backend = backend
        self._worker_id = worker_id
        self._heartbeat_seconds = heartbeat_seconds
        self._clock = clock or (lambda: datetime.now(UTC))

    def publish(self, state: WorkerState) -> None:
        observed_at = self._clock()
        if observed_at.tzinfo is None:
            raise ValueError("Worker heartbeat clock must be timezone-aware")
        online = state.state not in {"stopped", "failed-readiness"}
        lease_expires_at = (
            observed_at
            + timedelta(seconds=max(self._heartbeat_seconds * 3, 45))
            if online
            else observed_at
        )
        self._backend.put(
            WORKER_HEARTBEAT_KEY,
            _json_bytes(
                {
                    "schema_version": "1.0",
                    "record_type": "worker_heartbeat",
                    "engine_version": WORKER_ENGINE_VERSION,
                    "worker_id": self._worker_id,
                    "state": state.state,
                    "project_id": state.project_id,
                    "job_id": state.job_id,
                    "observed_at": observed_at.isoformat(),
                    "lease_expires_at": lease_expires_at.isoformat(),
                    "replica_count": 1,
                }
            ),
            content_type="application/json",
        )


class QueueWorkerRuntime:
    """Continuously poll B2 while preserving a strict one-replica contract."""

    def __init__(
        self,
        settings: Settings,
        *,
        backend: S3StorageBackend,
        processor: Callable[..., object] = process_queued_job,
        clock: Callable[[], datetime] | None = None,
        worker_id: str | None = None,
    ) -> None:
        if settings.worker_replica_count != 1:
            raise RuntimeError(
                "Toluva B2 queue currently requires exactly one worker replica"
            )
        self._settings = settings
        self._backend = backend
        self._processor = processor
        self._clock = clock or (lambda: datetime.now(UTC))
        self._worker_id = worker_id or f"worker-{uuid.uuid4().hex}"
        self._publisher = HeartbeatPublisher(
            backend,
            worker_id=self._worker_id,
            heartbeat_seconds=settings.worker_heartbeat_seconds,
            clock=self._clock,
        )
        self._state = WorkerState("starting")
        self._state_lock = threading.Lock()

    def _set_state(
        self,
        state: WorkerState,
        *,
        publish: bool = False,
    ) -> None:
        with self._state_lock:
            self._state = state
        if publish:
            self._publisher.publish(state)

    def _current_state(self) -> WorkerState:
        with self._state_lock:
            return self._state

    def _heartbeat_loop(self, stop: threading.Event) -> None:
        while not stop.wait(self._settings.worker_heartbeat_seconds):
            try:
                self._publisher.publish(self._current_state())
            except Exception as exc:
                print(
                    json.dumps(
                        {
                            "event": "worker_heartbeat_failed",
                            "error_type": type(exc).__name__,
                        },
                        sort_keys=True,
                    ),
                    file=sys.stderr,
                    flush=True,
                )

    def run_once(self) -> dict[str, object]:
        self._set_state(WorkerState("polling"))
        handle = find_next_runnable_job(
            self._backend,
            now=self._clock(),
            stale_claim_seconds=self._settings.worker_stale_claim_seconds,
        )
        if handle is None:
            self._set_state(WorkerState("idle"))
            return {"status": "idle"}
        project_id, job_id = handle
        self._set_state(
            WorkerState(
                "processing",
                project_id=project_id,
                job_id=job_id,
            ),
            publish=True,
        )
        try:
            report = self._processor(
                self._settings,
                project_id=project_id,
                job_id=job_id,
            )
        except Exception as exc:
            self._set_state(WorkerState("idle"), publish=True)
            return {
                "status": (
                    "blocked"
                    if getattr(exc, "job_state", None) == "blocked"
                    else "failed"
                ),
                "project_id": project_id,
                "job_id": job_id,
                "error_type": type(exc).__name__,
            }
        self._set_state(WorkerState("idle"), publish=True)
        return {
            "status": "completed",
            "project_id": project_id,
            "job_id": job_id,
            "final_record_key": getattr(report, "final_record_key", None),
        }

    def run_forever(self, stop: threading.Event) -> None:
        self._set_state(WorkerState("idle"), publish=True)
        heartbeat = threading.Thread(
            target=self._heartbeat_loop,
            args=(stop,),
            daemon=True,
            name="toluva-worker-heartbeat",
        )
        heartbeat.start()
        consecutive_poll_failures = 0
        try:
            while not stop.is_set():
                try:
                    result = self.run_once()
                    consecutive_poll_failures = 0
                    delay = self._settings.worker_poll_seconds
                except Exception as exc:
                    consecutive_poll_failures += 1
                    result = {
                        "status": "poll-failed",
                        "error_type": type(exc).__name__,
                    }
                    delay = min(
                        self._settings.worker_poll_seconds
                        * (2 ** min(consecutive_poll_failures, 4)),
                        60,
                    )
                print(
                    json.dumps(
                        {
                            "event": "worker_tick",
                            **result,
                        },
                        sort_keys=True,
                    ),
                    flush=True,
                )
                stop.wait(delay)
        finally:
            stop.set()
            heartbeat.join(timeout=2)
            self._set_state(WorkerState("stopped"), publish=True)


def build_worker_runtime(settings: Settings) -> QueueWorkerRuntime:
    scanner_scope = StorageScope(
        "queue-scanner",
        "queue-scanner",
        TARGET_LANGUAGE,
    )
    backend = build_b2_storage(
        settings,
        scanner_scope,
        preflight=True,
    ).backend
    return QueueWorkerRuntime(settings, backend=backend)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="toluva-worker")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run a secret-safe local readiness check and exit.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Poll and process at most one runnable B2 job.",
    )
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    if args.check:
        readiness = worker_readiness(settings, verify_model_hashes=False)
        print(json.dumps(readiness, indent=2, sort_keys=True))
        raise SystemExit(0 if readiness["ready"] else 1)

    assert_worker_ready(settings)
    runtime = build_worker_runtime(settings)
    if args.once:
        print(json.dumps(runtime.run_once(), indent=2, sort_keys=True))
        return

    stop = threading.Event()

    def request_stop(_signum: int, _frame: object) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    runtime.run_forever(stop)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            json.dumps(
                {
                    "event": "worker_start_failed",
                    "error_type": type(exc).__name__,
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise
