from pathlib import Path

import pytest

from toluva_pipeline.live_composition import (
    LiveCompositionReport,
    run_live_composition,
)
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import CredentialConfigurationError


def test_live_composition_requires_b2_before_any_work() -> None:
    settings = Settings(
        work_dir=Path("work"),
        max_timing_retries=2,
        green_drift_threshold=0.08,
        amber_drift_threshold=0.15,
        b2_key_id=None,
        b2_app_key=None,
        b2_bucket=None,
        b2_region=None,
        elevenlabs_api_key=None,
        assemblyai_api_key=None,
        openai_api_key=None,
    )
    with pytest.raises(CredentialConfigurationError, match="Backblaze"):
        run_live_composition(settings)


def test_durable_report_excludes_private_local_path() -> None:
    report = LiveCompositionReport(
        project_id="project-01",
        job_id="job-01",
        language="de-DE",
        source_key="source",
        transcript_key="transcript",
        segments_key="segments",
        captions_key="captions",
        selected_speech_key="speech",
        selected_speech_manifest_key="speech-manifest",
        selected_speech_hash_matches=True,
        composition_run_id="run-01",
        composition_manifest_key="composition-manifest",
        composition_manifest_hash="hash",
        final_asset_key="final",
        final_asset_sha256="sha",
        final_asset_hash_matches=True,
        final_duration_seconds=3.8,
        stream_types=("video", "audio", "subtitle"),
        captions_embedded=True,
        disclosure_key="disclosure",
        final_record_key="record",
        local_output_path="/private/path/final.mp4",
        live_tts_reused=True,
        new_provider_credits_spent=0,
    )
    assert "local_output_path" not in report.to_durable_dict()
    assert report.to_dict()["local_output_path"] == "/private/path/final.mp4"
