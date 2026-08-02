import json
from dataclasses import asdict
from datetime import UTC, datetime

import pytest

from toluva_pipeline.domain.correction import (
    AttemptContext,
    CorrectionAttempt,
    SpeechArtifact,
)
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.tempo_fit import (
    B2ApprovedLocalTempoFitStore,
    LocalTempoFitApprovalError,
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


def attempt() -> CorrectionAttempt:
    return CorrectionAttempt(
        context=AttemptContext(
            attempt_number=2,
            translated_text="Eine geprüfte deutsche Übersetzung.",
            text_sha256="a" * 64,
            instruction="Expand safely.",
            requested_action="retry_expanded",
            parent_run_id="speech-run-1",
            idempotency_key="idempotency-2",
        ),
        speech=SpeechArtifact(
            run_id="speech-run-2",
            parent_run_id="speech-run-1",
            provider="elevenlabs-tts",
            model="eleven-multilingual-v2",
            generated_seconds=10.396735,
            audio_key="speech/segment-002/attempt-2.mp3",
            manifest_key="speech/segment-002/attempt-2/manifest.json",
            manifest_hash="b" * 64,
            word_timing_count=20,
            stored_manifest_valid=True,
            stored_manifest_hash_matches=True,
            stored_asset_hash_matches=True,
        ),
        slot_seconds=9.549,
        drift_seconds=0.847735,
        drift_ratio=0.08877735888574702,
        absolute_drift_ratio=0.08877735888574702,
        timing_band="amber",
        timing_direction="overlong",
        timing_action="retry_shorter",
        reason="Overlong amber speech requires a shorter retry.",
        retry_number=3,
    )


def seeded_store() -> tuple[
    MemoryBackend,
    B2ApprovedLocalTempoFitStore,
    StorageScope,
    ToluvaObjectKeys,
    CorrectionAttempt,
]:
    backend = MemoryBackend()
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys(scope.project_id)
    timing = attempt()
    timing_record = {
        "schema_version": "1.0",
        "record_type": "timing_attempt",
        "project_id": scope.project_id,
        "job_id": scope.job_id,
        "segment_id": "segment-002",
        **asdict(timing),
    }
    backend.objects[keys.timing_attempt(scope, "segment-002", 2)] = (
        json.dumps(timing_record, indent=2, sort_keys=True) + "\n"
    ).encode()
    backend.objects[timing.speech.audio_key] = b"existing-fourth-call-audio"
    backend.objects[
        keys.translation_revision_request(scope, "segment-002", 3)
    ] = json.dumps(
        {
            "record_type": "translation_revision_request",
            "project_id": scope.project_id,
            "job_id": scope.job_id,
            "segment_id": "segment-002",
            "attempt_number": 3,
        }
    ).encode()
    store = B2ApprovedLocalTempoFitStore(
        backend,  # type: ignore[arg-type]
        keys=keys,
        scope=scope,
    )
    return backend, store, scope, keys, timing


def test_local_fit_approval_selects_existing_audio_without_retry_write() -> None:
    backend, store, scope, keys, timing = seeded_store()
    approved = store.approve(
        segment_id="segment-002",
        attempt_number=2,
        approved_max_tempo_factor=1.09,
        approved_by="operator",
        approved_at=datetime(2026, 8, 2, 12, 0, tzinfo=UTC),
    )

    assert approved.outcome.status == "tempo_fit"
    assert approved.outcome.selected_attempt_number == 2
    assert approved.tempo_factor == pytest.approx(
        10.396735 / 9.549
    )
    assert approved.approved_max_tempo_factor == 1.09
    assert keys.translation_approved_revision(
        scope,
        "segment-002",
        3,
    ) not in backend.objects
    assert len(
        [key for key in backend.objects if key == timing.speech.audio_key]
    ) == 1


def test_local_fit_approval_fails_closed_if_audio_bytes_change() -> None:
    backend, store, _, _, timing = seeded_store()
    store.approve(
        segment_id="segment-002",
        attempt_number=2,
        approved_max_tempo_factor=1.09,
        approved_by="operator",
        approved_at=datetime(2026, 8, 2, 12, 0, tzinfo=UTC),
    )
    backend.objects[timing.speech.audio_key] = b"changed-audio"

    with pytest.raises(LocalTempoFitApprovalError, match="immutable evidence"):
        store.load(segment_id="segment-002", attempts=(timing,))


def test_local_fit_approval_cannot_exceed_109() -> None:
    _, store, _, _, _ = seeded_store()
    with pytest.raises(ValueError, match="bounded local limit"):
        store.approve(
            segment_id="segment-002",
            attempt_number=2,
            approved_max_tempo_factor=1.10,
            approved_by="operator",
            approved_at=datetime(2026, 8, 2, 12, 0, tzinfo=UTC),
        )
