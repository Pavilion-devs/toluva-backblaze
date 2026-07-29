# Toluva

Toluva is a governed video-localization workflow for enterprise training and
communications teams.

> One source. Multiple languages. Every voice authorized, every segment
> time-fit, and every output verifiable.

This repository contains an interactive product view connected to a verified
live pipeline. The hosted dashboard reads the completed English-to-German run
from Backblaze B2 through a server-only bridge, while the Python service ingests
source media, performs timed transcription and protected-term translation,
enforces voice authorization, evaluates timing drift, calls ElevenLabs through
Genblaze, and stores verified media and provenance in B2.

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
- A server-only Backblaze Native API bridge that exposes only sanitized records
  and an allowlisted, range-capable source/final/caption media proxy
- A dashboard driven by the genuine German transcript, Argos translation,
  authorization scope, timing measurement, B2 object count, and four Genblaze
  manifests
- Source/final playback with WebVTT captions, completed-job replay from B2,
  and an honest verified-snapshot fallback when the live read is unavailable
- A FastAPI boundary for health, authorization, timing, and local spike runs
- A governed 1–8 second MP4 intake that writes source, source record, immutable
  queue request, and first status event directly to Backblaze B2
- A B2 queue consumer that validates the uploaded source hash, runs the real
  Genblaze engine, and appends 12 visible progress stages
- A persistent one-replica worker runtime with leased B2 heartbeats,
  interruption recovery, bounded polling backoff, and graceful shutdown
- A reproducible non-root Linux worker image with pinned CPU-only Python
  dependencies, FFmpeg, Faster Whisper, and Argos model hashes
- An honest dashboard worker indicator that shows online, busy, checking, or
  queue-only state without exposing infrastructure credentials
- Refresh-safe job polling and completed-job playback resolved from the new
  job's immutable final record

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

- The dashboard reads the real `english-to-german-v4` records and private media
  from B2. A visible connection badge distinguishes live B2 data from the last
  verified snapshot.
- The browser never receives provider or storage credentials. The hosted
  server-only bridge receives a read-capable, project-prefix-scoped B2 key as
  encrypted runtime secrets; ElevenLabs remains worker-only.
- Credential values are absent from tracked files.
- The Python generation worker still runs separately from the hosted web app.
  The UI launches a durable B2 job, displays its live status and completed
  media, and reads a finite worker lease. The production worker runtime and
  pinned image are implemented; an always-on external Python host remains
  required for unattended public execution.
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
