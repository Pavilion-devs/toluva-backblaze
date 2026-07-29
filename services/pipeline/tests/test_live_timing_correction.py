from pathlib import Path

import pytest

from toluva_pipeline.live_timing_correction import (
    LIVE_CORRECTED_TRANSLATION,
    LIVE_INITIAL_TRANSLATION,
    run_live_timing_correction,
)
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import CredentialConfigurationError


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
