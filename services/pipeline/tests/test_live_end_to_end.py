from pathlib import Path

import pytest

from toluva_pipeline.live_end_to_end import (
    LiveEndToEndReport,
    run_live_end_to_end,
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


def test_live_end_to_end_requires_tts_key_before_network() -> None:
    with pytest.raises(CredentialConfigurationError, match="ELEVENLABS"):
        run_live_end_to_end(settings())


def test_live_end_to_end_requires_b2_before_provider() -> None:
    with pytest.raises(CredentialConfigurationError, match="Backblaze"):
        run_live_end_to_end(settings(elevenlabs_api_key="configured"))


def test_live_end_to_end_durable_report_excludes_local_path() -> None:
    values = {
        field: (
            True
            if field in {
                "protected_terms_preserved",
                "captions_embedded",
                "live_transcription",
                "live_translation",
                "live_tts",
            }
            else 1
            if field
            in {
                "segment_count",
                "tts_attempt_count",
                "tts_generated_characters",
            }
            else 4.0
            if field in {"source_duration_seconds", "final_duration_seconds"}
            else ()
            if field == "resumed_completed_stages"
            else "/private/path/output.mp4"
            if field == "local_output_path"
            else "value"
        )
        for field in LiveEndToEndReport.__dataclass_fields__
    }
    report = LiveEndToEndReport(**values)
    assert "local_output_path" not in report.to_durable_dict()
