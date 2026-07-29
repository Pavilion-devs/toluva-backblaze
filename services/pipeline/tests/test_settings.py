from pathlib import Path

from toluva_pipeline.settings import Settings


def test_settings_repr_redacts_secrets() -> None:
    settings = Settings(
        work_dir=Path("work"),
        max_timing_retries=2,
        green_drift_threshold=0.08,
        amber_drift_threshold=0.15,
        b2_key_id="key-id-secret",
        b2_app_key="app-key-secret",
        b2_bucket="bucket",
        b2_region="us-west-004",
        elevenlabs_api_key="eleven-secret",
        assemblyai_api_key="assembly-secret",
        openai_api_key="openai-secret",
    )
    rendered = repr(settings)
    assert "key-id-secret" not in rendered
    assert "app-key-secret" not in rendered
    assert "eleven-secret" not in rendered
    assert settings.readiness()["b2"]["ready"] is True  # type: ignore[index]
