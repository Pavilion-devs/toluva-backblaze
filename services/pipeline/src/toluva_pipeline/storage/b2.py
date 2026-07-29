"""Genblaze storage-sink construction for Backblaze B2."""

from __future__ import annotations

from genblaze_core import KeyStrategy, ObjectStorageSink
from genblaze_s3 import S3StorageBackend

from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.keys import StorageScope


class CredentialConfigurationError(RuntimeError):
    pass


def build_b2_sink(
    settings: Settings,
    scope: StorageScope,
    *,
    preflight: bool = True,
) -> ObjectStorageSink:
    """Build a scoped sink without changing bucket-wide lifecycle rules."""

    readiness = settings.readiness()["b2"]
    if not settings.b2_ready:
        missing = ", ".join(readiness["missing"])  # type: ignore[index]
        raise CredentialConfigurationError(
            f"Backblaze B2 is not configured; missing: {missing}"
        )

    backend = S3StorageBackend.for_backblaze(
        bucket=settings.b2_bucket,
        region=settings.b2_region,
        key_id=settings.b2_key_id,
        app_key=settings.b2_app_key,
        auto_lifecycle=False,
        preflight=preflight,
    )
    return ObjectStorageSink(
        backend,
        prefix=scope.genblaze_prefix,
        key_strategy=KeyStrategy.HIERARCHICAL,
    )
