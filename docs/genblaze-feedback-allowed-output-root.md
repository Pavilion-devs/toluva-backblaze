# Genblaze feedback candidate: provider `output_dir` cannot be used by the storage sink

Status: Reproduced and worked around on July 29, 2026; filed upstream as
<https://github.com/backblaze-labs/genblaze/issues/247>

## Environment

- Python 3.12
- `genblaze-core==0.3.8`
- `genblaze-s3==0.3.6`
- `genblaze-elevenlabs==0.3.3`
- ElevenLabs SDK 2.59.0
- Backblaze B2 through `S3StorageBackend.for_backblaze`

## Summary

`ElevenLabsTTSProvider(output_dir=<project-local-directory>)` successfully
generates a local MP3, but an attached `ObjectStorageSink` rejects that file
during finalization because the project directory is outside the transfer
allowlist.

The provider's `output_dir` is explicit and trusted application configuration,
but `ObjectStorageSink` does not expose `AssetTransfer.allowed_roots`, so the
caller cannot connect the provider output root to the sink allowlist.

## Minimal reproduction

```python
from genblaze_core import Modality, ObjectStorageSink, Pipeline
from genblaze_elevenlabs import ElevenLabsTTSProvider

provider = ElevenLabsTTSProvider(output_dir="work/generated")

result = (
    Pipeline("output-root-repro")
    .step(
        provider,
        model="eleven_flash_v2_5",
        prompt="Short test.",
        modality=Modality.AUDIO,
    )
    .run(sink=ObjectStorageSink(backblaze_backend), raise_on_failure=True)
)
```

## Actual behavior

The provider call completes and creates the MP3. Sink finalization then raises
an error equivalent to:

```text
Access denied: local file path is outside allowed directories.
Files must be under temp or output_dir.
```

The run manifest is correctly not uploaded after the asset transfer fails.

## Expected behavior

One of:

1. `ObjectStorageSink` accepts an explicit `allowed_roots` list and passes it to
   `AssetTransfer`.
2. A provider-declared `output_dir` is safely propagated to the sink.
3. The documentation clearly requires file-backed providers to use the system
   temporary directory when paired with object storage.

The first option is the clearest because it preserves the existing
symlink-resolving allowlist while keeping trust configuration explicit.

## Workaround

Leave the ElevenLabs provider `output_dir` unset. It writes to the system
temporary directory, which the transfer guard already permits. Capture the
local file URL through the pipeline's step-complete callback when independent
duration inspection is required.

## Toluva audit handling

Toluva preserved the generated audio through direct B2 application storage,
wrote a sanitized failure record, and linked it to the successful retry. It
does not claim that the failed run has a Genblaze manifest.
