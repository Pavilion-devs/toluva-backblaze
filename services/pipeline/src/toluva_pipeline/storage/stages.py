"""B2-backed idempotency checkpoints for billable or expensive stages."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable


class IncompleteStageError(RuntimeError):
    """Raised when a prior stage may have spent credits but did not complete."""


class B2StageJournal:
    """Reuse completed stages and block ambiguous duplicate provider calls."""

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

    def completion(self, stage: str) -> dict[str, object] | None:
        key = self._keys.stage_completion(self._scope, stage)
        if not self._backend.exists(key):
            return None
        payload = json.loads(self._backend.get(key))
        if not isinstance(payload, dict):
            raise RuntimeError("Stored stage completion is malformed")
        return payload

    def begin(
        self,
        stage: str,
        *,
        idempotency_key: str,
        provider: str,
        model: str,
    ) -> bool:
        if self.completion(stage) is not None:
            return False
        intent_key = self._keys.stage_intent(self._scope, stage)
        if self._backend.exists(intent_key):
            raise IncompleteStageError(
                f"Stage {stage!r} has an unresolved provider intent; "
                "automatic replay is blocked to prevent duplicate spend."
            )
        payload = {
            "schema_version": "1.0",
            "record_type": "stage_intent",
            "stage": stage,
            "idempotency_key": idempotency_key,
            "provider": provider,
            "model": model,
            "created_at": datetime.now(UTC).isoformat(),
        }
        put_immutable(
            self._backend,
            intent_key,
            (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8"),
            content_type="application/json",
        )
        return True

    def complete(self, stage: str, payload: dict[str, object]) -> None:
        record = {
            "schema_version": "1.0",
            "record_type": "stage_completion",
            "stage": stage,
            "completed_at": datetime.now(UTC).isoformat(),
            **payload,
        }
        put_immutable(
            self._backend,
            self._keys.stage_completion(self._scope, stage),
            (json.dumps(record, indent=2, sort_keys=True) + "\n").encode("utf-8"),
            content_type="application/json",
        )

    def fail(self, stage: str, *, error_type: str) -> None:
        payload = {
            "schema_version": "1.0",
            "record_type": "stage_failure",
            "stage": stage,
            "error_type": error_type,
            "message": "Stage failed; inspect protected worker logs.",
            "failed_at": datetime.now(UTC).isoformat(),
        }
        put_immutable(
            self._backend,
            self._keys.stage_failure(self._scope, stage),
            (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8"),
            content_type="application/json",
        )
