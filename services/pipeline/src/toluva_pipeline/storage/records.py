"""Small immutable application-record writes outside generated media sinks."""

from __future__ import annotations

from genblaze_s3 import S3StorageBackend


def put_immutable(
    backend: S3StorageBackend,
    key: str,
    data: bytes,
    *,
    content_type: str,
) -> None:
    if backend.exists(key):
        if backend.get(key) != data:
            raise RuntimeError(f"Immutable B2 record conflicts with existing key: {key}")
        return
    backend.put(key, data, content_type=content_type)
