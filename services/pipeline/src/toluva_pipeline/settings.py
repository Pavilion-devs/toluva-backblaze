"""Environment-backed settings with secret-safe readiness reporting."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value in (None, "") else float(value)


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value in (None, "") else int(value)


@dataclass(frozen=True)
class Settings:
    """Runtime settings.

    Raw secret values never appear in ``readiness()`` or the dataclass repr.
    """

    work_dir: Path
    max_timing_retries: int
    green_drift_threshold: float
    amber_drift_threshold: float
    b2_key_id: str | None = field(repr=False)
    b2_app_key: str | None = field(repr=False)
    b2_bucket: str | None
    b2_region: str | None
    elevenlabs_api_key: str | None = field(repr=False)
    assemblyai_api_key: str | None = field(repr=False)
    openai_api_key: str | None = field(repr=False)

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            work_dir=Path(os.getenv("TOLUVA_WORK_DIR", "work/pipeline")),
            max_timing_retries=_env_int("TOLUVA_MAX_TIMING_RETRIES", 2),
            green_drift_threshold=_env_float(
                "TOLUVA_GREEN_DRIFT_THRESHOLD", 0.08
            ),
            amber_drift_threshold=_env_float(
                "TOLUVA_AMBER_DRIFT_THRESHOLD", 0.15
            ),
            b2_key_id=os.getenv("B2_KEY_ID"),
            b2_app_key=os.getenv("B2_APP_KEY"),
            b2_bucket=os.getenv("B2_BUCKET"),
            b2_region=os.getenv("B2_REGION"),
            elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY"),
            assemblyai_api_key=os.getenv("ASSEMBLYAI_API_KEY"),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
        )

    @property
    def b2_ready(self) -> bool:
        return all(
            (
                self.b2_key_id,
                self.b2_app_key,
                self.b2_bucket,
                self.b2_region,
            )
        )

    @property
    def elevenlabs_ready(self) -> bool:
        return bool(self.elevenlabs_api_key)

    def readiness(self) -> dict[str, object]:
        """Return booleans and missing variable names, never credential values."""

        b2_fields = {
            "B2_KEY_ID": self.b2_key_id,
            "B2_APP_KEY": self.b2_app_key,
            "B2_BUCKET": self.b2_bucket,
            "B2_REGION": self.b2_region,
        }
        provider_fields = {
            "ELEVENLABS_API_KEY": self.elevenlabs_api_key,
            "ASSEMBLYAI_API_KEY": self.assemblyai_api_key,
            "OPENAI_API_KEY": self.openai_api_key,
        }
        return {
            "b2": {
                "ready": self.b2_ready,
                "missing": [name for name, value in b2_fields.items() if not value],
            },
            "providers": {
                name: {"ready": bool(value)}
                for name, value in provider_fields.items()
            },
        }
