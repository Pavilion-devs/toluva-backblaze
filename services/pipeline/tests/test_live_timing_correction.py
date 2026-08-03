import hashlib
from pathlib import Path

import pytest
from genblaze_core import Asset, AudioMetadata, Pipeline
from genblaze_core._utils import local_file_url

from toluva_pipeline.domain.correction import SpeechArtifact
from toluva_pipeline.live_timing_correction import (
    GenblazeElevenLabsAttemptGenerator,
    LIVE_CORRECTED_TRANSLATION,
    LIVE_INITIAL_TRANSLATION,
    ProviderSpendBudget,
    ProviderSpendBudgetExceeded,
    run_live_timing_correction,
)
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import CredentialConfigurationError
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


def settings(
    *,
    elevenlabs_api_key: str | None = None,
    b2_key_id: str | None = None,
    b2_app_key: str | None = None,
    b2_bucket: str | None = None,
    b2_region: str | None = None,
) -> Settings:
    return Settings(
        work_dir=Path("work"),
        max_timing_retries=2,
        green_drift_threshold=0.08,
        amber_drift_threshold=0.15,
        b2_key_id=b2_key_id,
        b2_app_key=b2_app_key,
        b2_bucket=b2_bucket,
        b2_region=b2_region,
        elevenlabs_api_key=elevenlabs_api_key,
        assemblyai_api_key=None,
        openai_api_key=None,
    )


def test_live_correction_fails_before_network_without_tts_key() -> None:
    with pytest.raises(CredentialConfigurationError, match="ELEVENLABS"):
        run_live_timing_correction(settings())


def test_live_correction_fails_before_provider_without_b2() -> None:
    with pytest.raises(CredentialConfigurationError, match="Backblaze"):
        run_live_timing_correction(settings(elevenlabs_api_key="configured"))


def test_live_correction_fixture_is_small_and_materially_shorter() -> None:
    assert len(LIVE_INITIAL_TRANSLATION) == 133
    assert len(LIVE_CORRECTED_TRANSLATION) == 54


def test_provider_budget_is_idempotent_and_stops_before_overage() -> None:
    budget = ProviderSpendBudget(max_calls=2, max_characters=10)
    budget.reserve("attempt-1", "Toluva")
    budget.reserve("attempt-1", "Toluva")
    assert budget.consumed_calls == 1
    assert budget.consumed_characters == 6

    with pytest.raises(ProviderSpendBudgetExceeded, match="character"):
        budget.reserve("attempt-2", "bleibt")
    assert budget.consumed_calls == 1
    assert budget.consumed_characters == 6


def test_provider_budget_enforces_call_limit_independently() -> None:
    budget = ProviderSpendBudget(max_calls=1, max_characters=400)
    budget.reserve("attempt-1", "Toluva")
    with pytest.raises(ProviderSpendBudgetExceeded, match="call"):
        budget.reserve("attempt-2", "Toluva")


def test_attempt_generator_rehydrates_verified_parent_lineage(
    tmp_path: Path,
) -> None:
    class MemoryBackend:
        def __init__(self) -> None:
            self.objects: dict[str, bytes] = {}

        def get(self, key: str) -> bytes:
            return self.objects[key]

    audio_path = tmp_path / "parent.mp3"
    audio_bytes = b"verified-parent-audio"
    audio_path.write_bytes(audio_bytes)
    asset = Asset(
        url=local_file_url(audio_path.resolve()),
        media_type="audio/mpeg",
        sha256=hashlib.sha256(audio_bytes).hexdigest(),
        size_bytes=len(audio_bytes),
        duration=1.0,
        audio=AudioMetadata(codec="mp3"),
    )
    result = Pipeline.ingest(
        [asset],
        source="test-parent",
        name="parent-lineage",
    )
    backend = MemoryBackend()
    audio_key = "speech/segment-001/attempt-1.mp3"
    manifest_key = "speech/segment-001/attempt-1/manifest.json"
    backend.objects[audio_key] = audio_bytes
    backend.objects[manifest_key] = (
        result.manifest.model_dump_json().encode("utf-8")
    )
    generator = GenblazeElevenLabsAttemptGenerator(
        settings=settings(elevenlabs_api_key="configured"),
        backend=backend,  # type: ignore[arg-type]
        scope=StorageScope("project-01", "job-01", "de-DE"),
        keys=ToluvaObjectKeys("project-01"),
        authorization_id="auth-01",
        authorization_code="allowed",
    )
    speech = SpeechArtifact(
        run_id=result.run.run_id,
        parent_run_id=None,
        provider="test-parent",
        model="test",
        generated_seconds=1.0,
        audio_key=audio_key,
        manifest_key=manifest_key,
        manifest_hash=result.manifest.canonical_hash,
        word_timing_count=0,
        stored_manifest_valid=True,
        stored_manifest_hash_matches=True,
        stored_asset_hash_matches=True,
    )

    generator.restore_parent(speech)
    generator.restore_parent(speech)

    assert result.run.run_id in generator._results
