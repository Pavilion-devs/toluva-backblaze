# Toluva Pipeline Service

This service is the Python execution boundary for Toluva's long-running media
workflow. The hosted web experience remains separate; it never receives B2 or
provider credentials.

The first vertical-slice foundation includes:

- A provider-independent voice-authorization gate
- Timing-drift measurement at the exact 8% and 15% boundaries
- Bounded shorten/expand/pad/review decisions
- A provider-independent correction loop that preserves protected terms and
  stops after a configured retry budget
- One Genblaze run and manifest per speech attempt with parent/child lineage
- Append-only B2 translation, timing, failure, and summary records
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

Live B2 and ElevenLabs calls require all of these to be configured:

- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_BUCKET`
- `B2_REGION`
- `ELEVENLABS_API_KEY`

The B2 key must be least privilege and restricted to the demo bucket. The
integration uses `auto_lifecycle=False`; the worker will not silently change
bucket-wide lifecycle rules.

After both providers pass readiness, the deliberately small billable spike is:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  live-tts-spike --confirm-spend
```

The explicit flag prevents an ordinary test or page load from spending credits.
The command generates one short German stock-voice sample, stores the
authorization record, audio, and Genblaze manifest in B2, measures duration
with `ffprobe`, and downloads the stored object to verify its SHA-256.

The first verified live run produced 3.668753 seconds of speech for a
4.0-second slot, returned seven word timings, and selected amber/silence
padding at -8.281175% drift.

## Live timing-correction proof

The explicit billable red-to-green proof is:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  live-timing-correction --confirm-spend
```

The default job ID is stable. If its first translation or summary already
exists in B2, the command stops before another provider call. Use a new
`--job-id` only for an intentional new run.

The verified July 29 run used a human-reviewed scripted rewrite because a
translation-provider credential is not configured yet. It does not represent
the rewrite as model-generated.

- Attempt 1: 133 characters, 8.126984 seconds for a 3.8-second slot,
  +113.868% drift, red, `retry_shorter`
- Attempt 2: 54 characters, 3.575873 seconds, -5.898079% drift, green,
  `accept`
- Both audio objects matched their declared SHA-256 values.
- Both Genblaze manifests verified and the second manifest points to the first
  run as its parent.
- Nine job-scoped B2 objects preserve two translations, two audio files, two
  manifests, two timing records, and the final summary.
- Provider auto-retry is disabled for this adapter path because an ambiguous
  retry could double-bill. The Toluva engine owns explicit correction attempts.
