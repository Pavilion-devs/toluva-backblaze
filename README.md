# Toluva

Toluva is a governed video-localization workflow for enterprise training and
communications teams.

> One source. Multiple languages. Every voice authorized, every segment
> time-fit, and every output verifiable.

This repository contains the interactive product scaffold and the first real
pipeline foundation. The UI still uses prepared demonstration data, while the
Python service now enforces voice authorization, evaluates timing drift, and
produces verified Genblaze provenance locally.

## What is implemented

- A source video and its governed language editions
- Consent-bound synthetic-voice authorization
- A pre-generation policy block for an unauthorized language or purpose
- Segment-level timing-drift measurement
- A bounded rewrite/regeneration story
- Backblaze B2 asset-lifecycle visibility
- Genblaze run and provenance visibility
- Tested authorization rules for allowed, expired, revoked, wrong-language,
  wrong-purpose, wrong-voice, and invalid-evidence cases
- Tested timing policy at the exact green/amber/red boundaries
- Append-only B2 object-key construction and a scoped Genblaze B2 sink
- A zero-cost Genblaze run with a canonical manifest and independent media-byte
  hash verification
- A FastAPI boundary for health, authorization, timing, and local spike runs

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` only when beginning the live provider
integration. Never commit credential values.

## Run the pipeline foundation

Prerequisites: Python 3.12 and `uv`.

```bash
UV_CACHE_DIR=.uv-cache uv sync --project services/pipeline
services/pipeline/.venv/bin/python -m pytest services/pipeline
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli local-provenance
```

See `services/pipeline/README.md` for the API and credential-readiness commands.

## Current boundaries

- The dashboard is interactive, but its media/run records remain clearly
  labelled prepared demo data.
- The browser never receives provider or storage credentials.
- Live B2 and ElevenLabs smoke tests require private credentials that are not
  currently present in the environment.
- The timing thresholds are product defaults to be validated through the first
  live speech sample.
- Toluva is evidence-ready and compliance-supporting; it does not guarantee
  legal or regulatory compliance.

Read `AGENTS.md` before making changes. `plan.md` is the full product,
architecture, delivery, and submission source of truth.
