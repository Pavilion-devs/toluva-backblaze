# Toluva Pipeline Service

This service is the Python execution boundary for Toluva's long-running media
workflow. The hosted web experience remains separate; it never receives B2 or
provider credentials.

The first vertical-slice foundation includes:

- A provider-independent voice-authorization gate
- Timing-drift measurement at the exact 8% and 15% boundaries
- Bounded shorten/expand/pad/review decisions
- Append-only, human-inspectable B2 object keys
- A scoped Genblaze Backblaze sink with lifecycle mutation disabled
- A real Genblaze manifest run over deterministic local audio bytes
- Independent asset-byte hash verification
- FastAPI endpoints for health, authorization, timing, and the local spike

## Bootstrap

From the repository root:

```bash
UV_CACHE_DIR=.uv-cache uv sync --project services/pipeline
```

## Verify

```bash
services/pipeline/.venv/bin/python -m pytest services/pipeline
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli readiness
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli local-provenance
```

The local provenance command is deliberately zero-cost. It uses Genblaze's
mock audio provider with a real deterministic WAV file, writes a canonical
manifest under `work/pipeline`, verifies the manifest, and separately hashes
the referenced bytes. It never presents this fixture as a live provider run.

## Serve the API

```bash
services/pipeline/.venv/bin/uvicorn \
  --app-dir services/pipeline/src \
  toluva_pipeline.api:app \
  --reload
```

Then inspect `http://127.0.0.1:8000/health`.

## Live provider readiness

Copy the repository `.env.example` to a private environment file or inject the
variables through the worker host. Do not expose them to the web app.

Live B2 and ElevenLabs calls remain intentionally disabled until all of these
are configured:

- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_BUCKET`
- `B2_REGION`
- `ELEVENLABS_API_KEY`

The B2 key must be least privilege and restricted to the demo bucket. The
integration uses `auto_lifecycle=False`; the worker will not silently change
bucket-wide lifecycle rules.
