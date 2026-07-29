# Toluva

Toluva is a governed video-localization workflow for enterprise training and
communications teams.

> One source. Multiple languages. Every voice authorized, every segment
> time-fit, and every output verifiable.

This repository contains the interactive product scaffold and a verified live
pipeline foundation. The UI still uses prepared demonstration data, while the
Python service now ingests source media, performs timed transcription and
protected-term translation, enforces voice authorization, evaluates timing
drift, calls ElevenLabs through Genblaze, and stores verified media and
provenance in Backblaze B2.

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
- A provider-independent, bounded timing-correction engine with protected-term
  enforcement, shorten/expand rewrites, silence-padding decisions, and human
  review after retry exhaustion
- Append-only B2 object-key construction and a scoped Genblaze B2 sink
- A zero-cost Genblaze run with a canonical manifest and independent media-byte
  hash verification
- A live 54-character German ElevenLabs TTS run with word timestamps, B2-backed
  audio, a canonical Genblaze manifest, and downloaded-byte verification
- A live red-to-green timing proof: 8.126984 seconds against a 3.8-second slot
  was shortened and regenerated to 3.575873 seconds, moving from +113.868%
  red drift to -5.898079% green drift
- Separate Genblaze manifests, verified audio hashes, parent/child run lineage,
  translation revisions, QA records, and deterministic spend guards for every
  correction attempt
- Validated timed-transcript and segmentation records with deterministic
  WebVTT caption generation
- A real Genblaze composition fan-in over source video, the selected localized
  audio, and captions
- A verified 3.8-second H.264/AAC/`mov_text` MP4, B2-backed caption sidecar,
  synthetic-media disclosure, and final publication record
- A fixture-free English-to-German development slice: real local Whisper
  word timestamps, real offline neural translation, one live ElevenLabs speech
  attempt, timing QA, WebVTT captions, and a verified Genblaze composition
- B2-backed provider intents and completions that reuse finished stages and
  block ambiguous retries before they can duplicate provider spend
- A verified 4.0-second H.264/AAC/`mov_text` German output whose four
  transcription, translation, speech, and composition manifests all validate
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
- B2 and ElevenLabs credentials are configured only in the ignored local
  environment; they are absent from tracked files.
- The first live worker path runs locally and is not connected to the hosted UI
  yet.
- The new transcript and German translation are genuine model outputs, not
  scripted fixtures. The source video is a clearly labelled, locally generated
  development sample; an entrant-owned or licensed final demo video is still
  required.
- The timing thresholds remain configurable product defaults; the first live
  red-to-green German sample has now validated the complete correction path.
- Toluva is evidence-ready and compliance-supporting; it does not guarantee
  legal or regulatory compliance.

Read `AGENTS.md` before making changes. `plan.md` is the full product,
architecture, delivery, and submission source of truth.
