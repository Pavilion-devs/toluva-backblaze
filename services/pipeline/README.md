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
- Validated timed-transcript and WebVTT generation
- A deterministic transcript-quality gate between STT and translation that
  checks language probability, confidence distribution, protected terms, and
  suspicious trailing fragments
- A separate immutable, hash-bound human correction that resumes the same job
  from stored transcription without spending TTS credits while blocked
- A Toluva Genblaze FFmpeg compositor that fans in video, localized audio, and
  captions
- Embedded MP4 caption tracks plus durable WebVTT sidecars
- Local Faster Whisper word-timestamp transcription through a custom Genblaze
  provider
- Offline Argos/CTranslate2 English-to-German translation with protected-term
  enforcement through a custom Genblaze provider
- B2-backed stage intents and completions that prevent ambiguous duplicate
  model calls and reuse completed work
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

Install the two pinned local model assets into the ignored work directory:

```bash
export TOLUVA_MODEL_ROOT="$PWD/work/pipeline/models"
export ARGOS_PACKAGES_DIR="$TOLUVA_MODEL_ROOT/argos/packages"
export XDG_DATA_HOME="$TOLUVA_MODEL_ROOT/argos/data"
export XDG_CONFIG_HOME="$TOLUVA_MODEL_ROOT/argos/config"
export XDG_CACHE_HOME="$TOLUVA_MODEL_ROOT/argos/cache"

services/pipeline/.venv/bin/argospm update
services/pipeline/.venv/bin/argospm install translate-en_de
services/pipeline/.venv/bin/hf download \
  Systran/faster-whisper-base.en \
  --revision 88b03866a4066bb4a97c12258abb82b1e9af0121 \
  --local-dir "$TOLUVA_MODEL_ROOT/whisper/base-en"
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

## Captioned composition slice

The zero-new-credit composition command reuses the accepted green TTS attempt:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  compose-live-slice --confirm-write
```

The command:

1. Downloads and re-verifies the selected speech bytes against its stored
   Genblaze manifest.
2. Produces a labelled deterministic source/transcript fixture.
3. Generates WebVTT captions from validated timed segments.
4. Runs a three-input Genblaze fan-in through Toluva's FFmpeg provider.
5. Pads the measured 0.224-second audio gap without stretching speech.
6. Stores and re-verifies the final MP4 and composition manifest.
7. Writes a synthetic-media disclosure and final record without local paths.

The verified output is exactly 3.8 seconds and contains H.264 video, AAC audio,
and a `mov_text` subtitle stream. Its SHA-256 is
`7e3c40a3f685ab57427e6cfa86a32871764ac48b898c65e388769ea0e0d44cf4`.
The job now contains 14 B2 objects, with three additional source/transcript
objects under the project. No new model credits were spent.

## Multi-segment production runtime

The live worker boundary is implemented and verified without a provider call:

- `MultiSegmentLocalizationEngine` preserves the timed transcript as individual
  source slots.
- Each slot receives its own verified translation, bounded TTS attempts,
  objective drift decision, and selected speech lineage.
- A red attempt may rewrite and regenerate with its parent run attached.
- A segment that reaches human review stops all later translation and TTS work.
- `ToluvaSegmentAudioAssembler` places selected speech at the original source
  timestamps, preserves natural gaps, rejects collisions, and emits an
  exact-source-length WAV master through Genblaze.
- The existing compositor then fans source video, the assembled localized-audio
  master, and WebVTT captions into the final MP4.
- Aggregate state has append-only B2 key contracts at
  `qa/multi-segment/{version}.json` and
  `localized-audio/{version}/genblaze/`.
- The production end-to-end path no longer collapses Whisper segments. It runs
  one checkpointed Argos stage and one bounded timing-correction state machine
  per preserved source slot.
- Timing rewrites come only from immutable B2 approvals bound to the exact
  source text, current translation, instruction, target duration, protected
  terms, segment, attempt, job, and parent run.
- A missing approval writes a revision request and exposes `timing-blocked`
  before another ElevenLabs call. The same job can resume after approval by
  reloading its completed timing attempts and verified parent Genblaze
  manifest.
- Audio assembly and final composition have their own provider intents,
  completions, stored assets, manifests, and independent byte verification.
- Final records retain the legacy single-result fields for old evidence while
  adding complete per-segment translation, speech, timing, resume,
  red-to-green, and audio-master lineage.

The deterministic proof uses three segments: a green first attempt, a
red-to-green corrected segment, and an amber silence-padded segment. It also
verifies video, audio, and embedded subtitle streams in the final composition.

Run the focused zero-cost checks with:

```bash
services/pipeline/.venv/bin/pytest -q \
  services/pipeline/tests/test_multi_segment.py \
  services/pipeline/tests/test_audio_assembler.py
```

The full service suite currently collects and passes 121 tests. This production
wiring phase made no B2 write and no provider call. A controlled production
source remains gated behind explicit ElevenLabs spend approval.

## Fixture-free end-to-end proof

The current complete engine proof is:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  live-end-to-end --confirm-spend
```

The explicit flag acknowledges that a fresh job makes one short ElevenLabs TTS
call. Transcription and translation run locally. Completed stages are loaded
from B2 on replay, while an unresolved provider intent blocks automatic replay
to avoid duplicate spend.

The pinned local model assets are:

- `faster-whisper==1.2.1`
- `Systran/faster-whisper-base.en` revision
  `88b03866a4066bb4a97c12258abb82b1e9af0121`
- `argostranslate==1.11.0`
- Argos `translate-en_de` model package `1.3`

The verified `english-to-german-v4` run:

1. Ingested a real speech-bearing four-second development MP4 into B2.
2. Transcribed it to “Welcome to Toluva, One Message, Many Languages.” with
   word timestamps.
3. Translated it to “Willkommen bei Toluva, eine Botschaft, viele Sprachen.”
   while preserving `Toluva`.
4. Generated 3.529433 seconds of German speech for a 4.0-second slot.
5. Classified -11.764175% drift as amber and padded the small gap with silence.
6. Composed an exact 4.0-second H.264/AAC/`mov_text` MP4.
7. Verified all four Genblaze manifests and independently matched the final
   B2 bytes to SHA-256
   `611924ce72726f686ead5cc71ccd131bf85d0a58ba5518605ebccfdc9e52ef2b`.
8. Replayed the completed job from B2 in 1.3 seconds without a provider call.

The configured ElevenLabs key is currently permitted for TTS but returned
HTTP 401 for Scribe STT. That failure is retained as an inspectable checkpoint.
Toluva therefore uses the pinned local Whisper path for the working pipeline
instead of requesting another credential or silently retrying.

## Durable B2 queue worker

The hosted application can create a fresh upload job without holding open a
generation request. It writes an immutable queue request to B2. To claim the
oldest unclaimed request and process at most one job:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  queue-worker --once --confirm-spend
```

To process or safely resume one exact opaque handle:

```bash
PYTHONPATH=services/pipeline/src \
  services/pipeline/.venv/bin/python -m toluva_pipeline.cli \
  queue-worker \
  --project-id intake-00000000000000000000000000000000 \
  --job-id localize-00000000000000000000000000000000 \
  --confirm-spend
```

The explicit flag is still required because an accepted fresh job makes one
ElevenLabs call. Before execution the worker verifies the request contract, B2
source key, byte count, and SHA-256. After Whisper, a questionable transcript
is stored as `blocked` before Argos or ElevenLabs. An operator correction is a
separate immutable B2 record tied to the provider-text hash; once present, the
single worker resumes that exact job without rerunning Whisper. An exact replay
of a completed job returns the final checkpoint without rerunning Whisper,
Argos, ElevenLabs, or FFmpeg.

## Persistent production worker

The production entry point continuously polls the B2 queue:

```bash
PYTHONPATH=services/pipeline/src \
  TOLUVA_WORKER_ALLOW_PROVIDER_SPEND=true \
  services/pipeline/.venv/bin/python -m toluva_pipeline.worker
```

Its production contract is deliberately narrow:

- Run exactly one replica. B2 request discovery and the append-only claim event
  are durable but not an atomic compare-and-swap lock.
- Poll every 120 seconds in production and use bounded backoff after a transient
  queue or heartbeat error.
- Publish a secret-safe B2 heartbeat every 120 seconds with a finite lease.
  This heartbeat is the one intentionally mutable runtime record; job events
  and generated assets remain append-only.
- Refuse startup unless B2, ElevenLabs, FFmpeg, FFprobe, the pinned Whisper
  model, the pinned Argos model, the one-replica setting, and the explicit
  provider-spend opt-in all pass readiness.
- On `SIGTERM` or `SIGINT`, finish the current synchronous step when the host
  permits it and do not claim a new job. If the host kills the process during a
  job, a replacement may resume the same request after the stale-claim window
  by loading its immutable B2 checkpoints.
- Treat an immutable transcript human-review record as an immediate resume
  signal for its blocked job; the old claim timeout must not delay approval.
- Never place provider or B2 credentials in the web container.

The dashboard polls the heartbeat through a server-only route. An expired or
unavailable lease is shown as `QUEUE ONLY`; an upload remains safely queued
instead of being described as actively processing.

## Pinned Linux image

Build the same worker image intended for the external host:

```bash
docker buildx build \
  --load \
  --platform linux/amd64 \
  --file services/pipeline/Dockerfile \
  --tag toluva-worker:local \
  .
```

The image pins Python 3.12.13, `uv` 0.11.12, the locked Python environment, a
CPU-only PyTorch 2.13.0 wheel, the exact Faster Whisper model revision, and the
Argos English-to-German model. The CPU index is explicit so a Linux build
cannot silently pull multi-gigabyte CUDA libraries for this CPU worker. Both
model files and the Argos package archive are checked against hard-coded
SHA-256 values during the build. The image also contains FFmpeg/FFprobe, runs
as non-root UID/GID 10001, and uses `tini` for correct signal forwarding.

Run its secret-safe readiness check with the private worker environment:

```bash
docker run --rm \
  --platform linux/amd64 \
  --env-file .env.local \
  --env TOLUVA_WORK_DIR=/var/lib/toluva \
  --env TOLUVA_WORKER_ALLOW_PROVIDER_SPEND=true \
  --entrypoint python \
  toluva-worker:local \
  -m toluva_pipeline.worker --check
```

The production deployment uses exactly one isolated VPS container managed by
systemd. The container exposes no port: it polls the B2 queue and calls B2 and
ElevenLabs over outbound HTTPS. It is limited to 1.5 CPUs, 2,000 MB RAM, and
256 processes, runs as UID/GID 10001 with all Linux capabilities dropped, and
stores its root-only environment at `/etc/toluva/worker.env`. See
`deploy/vps/README.md`.

The deployed service uses the immutable tag
`toluva-worker:queue-v5-66ba37b`, built from the governed multi-segment,
timing-approval, bounded tempo-fit, public-admission, and provider-budget
source revision. Its verified production image ID is
`sha256:3d8e9e0b4b9d2f447906bbb323597deb2c9d9099311b36f360f8a61725fc79df`.
Its container health, restart count, and heartbeat must be recorded
in `deploy/vps/README.md` after each deployment. No reverse proxy, DNS record,
forwarded port, or public worker endpoint is required.

The verified local `linux/amd64` build has OCI digest
`sha256:41e238e088f63c0293667143c8ac8d2ba700ca9c105a6ae8558e4b3b18f620b8`
and uncompressed size 1,628,957,753 bytes. It reported UID/GID 10001, PyTorch
`2.13.0+cpu` with CUDA unavailable, both model hashes matching, and reproduced
“Willkommen bei Toluva, eine Botschaft, viele Sprachen.” entirely offline.
