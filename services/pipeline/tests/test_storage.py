from pathlib import Path

import pytest

from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import build_b2_storage
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


def test_attempt_keys_are_append_only_and_human_inspectable() -> None:
    keys = ToluvaObjectKeys("project-01")
    scope = StorageScope("project-01", "job-07", "DE_de")
    first = keys.speech_attempt(scope, "segment-03", 1, ".mp3")
    second = keys.speech_attempt(scope, "segment-03", 2, "mp3")
    assert first == (
        "projects/project-01/jobs/job-07/de-de/"
        "speech/segment-03/attempt-1.mp3"
    )
    assert second.endswith("/attempt-2.mp3")
    assert first != second
    assert scope.genblaze_prefix.endswith("/de-de/genblaze")


def test_scope_cannot_cross_projects() -> None:
    keys = ToluvaObjectKeys("project-01")
    scope = StorageScope("project-02", "job-07", "de-DE")
    with pytest.raises(ValueError, match="different project"):
        keys.translation_attempt(scope, "segment-03", 1)


def test_timing_and_speech_prefixes_are_attempt_scoped() -> None:
    scope = StorageScope("project-01", "job-01", "de-DE")
    keys = ToluvaObjectKeys("project-01")
    assert keys.speech_genblaze_prefix(scope, "segment-01", 2).endswith(
        "/speech/segment-01/attempt-2/genblaze"
    )
    assert keys.timing_attempt(scope, "segment-01", 2).endswith(
        "/qa/segment-01/attempt-2.json"
    )
    assert keys.timing_summary(scope, "segment-01").endswith(
        "/qa/segment-01/summary.json"
    )
    assert keys.multi_segment_summary(scope, "v2").endswith(
        "/qa/multi-segment/v2.json"
    )
    assert keys.captions(scope, "v2").endswith("/captions/v2.vtt")
    assert keys.localized_audio_genblaze_prefix(scope, "v2").endswith(
        "/localized-audio/v2/genblaze"
    )
    assert keys.composition_genblaze_prefix(scope, "v2").endswith(
        "/composition/v2/genblaze"
    )
    assert keys.final_record(scope, "v2").endswith("/final/v2.json")
    assert keys.queue_request(scope).endswith("/queue/request.json")
    assert keys.status_event(scope, 2, "claimed").endswith(
        "/status/02-claimed.json"
    )
    assert keys.status_prefix(scope).endswith("/status/")


@pytest.mark.parametrize("unsafe_id", ["../escape", "space here", "", "/root"])
def test_unsafe_identifiers_are_rejected(unsafe_id: str) -> None:
    with pytest.raises(ValueError):
        ToluvaObjectKeys(unsafe_id)


def test_b2_storage_can_be_constructed_without_network_preflight() -> None:
    settings = Settings(
        work_dir=Path("work"),
        max_timing_retries=2,
        green_drift_threshold=0.08,
        amber_drift_threshold=0.15,
        b2_key_id="placeholder-key-id",
        b2_app_key="placeholder-app-key",
        b2_bucket="placeholder-bucket",
        b2_region="us-east-005",
        elevenlabs_api_key=None,
        assemblyai_api_key=None,
        openai_api_key=None,
    )
    storage = build_b2_storage(
        settings,
        StorageScope("project-01", "job-01", "de-DE"),
        preflight=False,
    )
    assert storage.sink is not None
    assert storage.backend is not None
