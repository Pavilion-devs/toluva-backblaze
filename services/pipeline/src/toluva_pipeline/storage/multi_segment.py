"""Immutable aggregate records for multi-segment localization."""

from __future__ import annotations

import json

from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.multi_segment import (
    MultiSegmentLocalizationOutcome,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable


class B2MultiSegmentJournal:
    """Persist one replay-safe aggregate after segment-level journals finish."""

    def __init__(
        self,
        backend: S3StorageBackend,
        *,
        keys: ToluvaObjectKeys,
        scope: StorageScope,
        version: str,
    ) -> None:
        self._backend = backend
        self._scope = scope
        self._key = keys.multi_segment_summary(scope, version)

    @property
    def key(self) -> str:
        return self._key

    def store(self, outcome: MultiSegmentLocalizationOutcome) -> str:
        if (
            outcome.project_id != self._scope.project_id
            or outcome.job_id != self._scope.job_id
        ):
            raise ValueError(
                "multi-segment outcome does not match the storage scope"
            )
        outcome_payload = outcome.to_dict()
        outcome_payload.pop("resumed_segment_ids", None)
        payload = {
            "schema_version": "1.0",
            "record_type": "multi_segment_localization_summary",
            **outcome_payload,
        }
        data = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode(
            "utf-8"
        )
        put_immutable(
            self._backend,
            self._key,
            data,
            content_type="application/json",
        )
        return self._key

    def load(self) -> dict[str, object] | None:
        if not self._backend.exists(self._key):
            return None
        payload = json.loads(self._backend.get(self._key))
        if (
            not isinstance(payload, dict)
            or payload.get("record_type")
            != "multi_segment_localization_summary"
        ):
            raise RuntimeError("Stored multi-segment summary is malformed")
        return payload
