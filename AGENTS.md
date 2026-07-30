# Toluva — Agent Operating Guide

This file contains the non-negotiable instructions for every person or coding
agent working in this directory. Read this file and `plan.md` in full before
changing the application.

## Mission

Build Toluva, a production-minded, provenance-first video localization
application for the Backblaze Generative Media Hackathon.

The product promise is:

> One video. Multiple languages. Every voice authorized, every segment
> time-fit, and every output verifiable.

Toluva is not a generic AI dubbing demo. It is a governed localization workflow
for enterprise training and communications teams working with executives,
instructors, brand representatives, and other identifiable speakers.

## Deadline and Competition Facts

- Devpost submission deadline: August 3, 2026 at 5:00 p.m. EDT.
- Nigeria equivalent: August 3, 2026 at 10:00 p.m. WAT.
- Internal target: deploy and submit by August 3 at 6:00 p.m. WAT. The remaining
  four hours are emergency buffer only.
- Judging period: August 5–11, 2026.
- The hosted app must remain functional and freely accessible throughout
  judging.
- The demo video must be under three minutes. Judges are not required to watch
  beyond three minutes.
- A working application URL, repository with setup instructions, provider/model
  list, explanation of B2 and Genblaze usage, and public demo video are required.
- Stage one is a pass/fail check for viability, theme fit, and meaningful use of
  the required technology.
- Stage-two criteria are equally weighted:
  1. Real-world utility
  2. Production readiness
  3. B2 storage and data orchestration
  4. Use of Genblaze
- Real-world utility is the first tie-breaker.
- File useful Genblaze SDK feedback before submission so the project is also
  eligible for the Feedback Prize.

Official references are collected at the end of `plan.md`.

## Product Positioning

Always describe Toluva as a governed localization system, not an all-purpose
creator suite.

Preferred one-line pitch:

> Toluva turns one approved source video into time-aligned, consent-aware,
> verifiable localized editions.

Preferred short value statement:

> Localize the message without losing control of the voice.

Do not claim that Toluva:

- Guarantees legal or regulatory compliance.
- Supports every language.
- Produces perfect lip sync.
- Eliminates the need for human review.
- Can verify the truth of the underlying spoken content.

Use “compliance-supporting,” “evidence-ready,” and “audit-friendly” instead of
“compliant” unless a qualified legal review establishes a narrower claim.

## The Two Signature Differentiators

Every implementation and demo decision should strengthen at least one of these:

### 1. Consent-bound synthetic voice provenance

Voice authorization is an active generation control, not decorative metadata.

- Record whether the voice is stock, designed, or cloned.
- For cloned voices, require a consent record before generation.
- Store allowed languages, permitted uses, owner/speaker, validity period, and a
  hash of the consent evidence.
- Block generation when the requested use, language, or date is outside the
  authorization scope.
- Store the provider, model, prompt/translation inputs, parameters, timestamps,
  output hashes, approver, and disclosure state in the run lineage.
- Add a clear user-facing synthetic-media disclosure to applicable outputs.
- Preserve a machine-readable Genblaze manifest with or alongside each asset.
- Never describe a Genblaze manifest alone as proof of consent or full legal
  compliance. It proves recorded lineage and integrity, not the truth of every
  supplied fact.

### 2. Timing-drift quality control

Timing drift is the primary automated QA metric.

For every translated speech segment:

```text
available_duration = source_end - source_start
drift_ratio = (generated_duration - available_duration) / available_duration
```

Default bands:

- Green: absolute drift is at most 8%.
- Amber: absolute drift is greater than 8% and at most 15%.
- Red: absolute drift is greater than 15%.

The thresholds must be configurable and visible in the UI.

For an overlong segment:

1. Translate while preserving protected terms and meaning.
2. Generate TTS.
3. Measure the actual generated audio duration.
4. If the segment is over the threshold, request a shorter translation with an
   explicit target duration.
5. Regenerate and remeasure.
6. Stop after a bounded retry count.
7. Apply only a small, configured tempo adjustment when safe; otherwise require
   human review.

For a short segment, prefer silence padding or a measured translation expansion.
Do not slow speech enough to make it sound unnatural.

Persist every attempt, measurement, decision, and parent/child run relationship.
Never hide failed attempts from the audit trail.

The implemented correction boundary is:

- Toluva owns the bounded measure/rewrite/regenerate loop.
- Each speech attempt is a separate Genblaze run and canonical manifest.
- A retry uses `Pipeline.from_result()` so the next manifest carries the
  previous attempt's `parent_run_id`.
- Translation and QA records are written before and after each billable call to
  distinct append-only B2 keys.
- A retry translation must come from an immutable, hash-bound,
  human-approved B2 revision. Argos is not represented as an
  instruction-following rewriter.
- When no approved revision exists, store the exact shortening/expansion
  request and block before another TTS call. Resume the same job only after the
  matching approval appears; reuse every completed attempt and rehydrate its
  verified Genblaze parent manifest instead of repeating speech generation.
- The current ElevenLabs adapter path uses `max_retries=0`; a provider retry
  without a supported idempotency header could double-bill. Toluva retries only
  as an explicit, measured correction attempt.
- A stable job/segment record blocks accidental reruns before another provider
  call. A new job ID means an intentional new billable run.

## Architecture Decisions

### Genblaze must own visible orchestration

- Use lower-level transcription, translation, TTS, evaluation, and composition
  stages.
- Do not make the ElevenLabs one-call Dubbing API the core workflow. It would
  hide the main orchestration and weaken the Genblaze story.
- Express meaningful media generation through Genblaze pipelines and providers.
- Use fan-out for per-language work and fan-in when video, localized speech,
  captions, and other tracks are composed.
- Use retries, fallbacks, lineage, manifests, and storage sinks where they solve
  a real workflow requirement.
- If an operation cannot live inside a Genblaze pipeline, document why and keep
  the surrounding inputs, outputs, and lineage visible.
- Avoid provider quantity as a vanity metric. Every provider must have a clear
  operational reason.

The current execution boundary is deliberate:

- The Sites-hosted Next.js/Vinext app is the user experience.
- The Python 3.12 FastAPI service under `services/pipeline` owns Genblaze and
  long-running media work.
- Never move B2 or provider credentials into the browser.
- The Sites server runtime may hold a read/write B2 application key only when
  it is stored as encrypted runtime secrets, restricted to the `projects/`
  prefix, and used behind the governed server bridge. Sites may write validated
  upload, source-record, immutable queue-request, and initial status-event
  objects. Do not put ElevenLabs or generation-provider credentials in Sites.
- The hosted bridge is an observability and private-media boundary. It may read
  verified records, count job objects, proxy byte ranges, replay completed
  state, and create the narrow governed B2 intake contract. It must not execute
  the Python generation pipeline.
- The first verified package pins are `genblaze-core==0.3.8`,
  `genblaze-s3==0.3.6`, and `genblaze-elevenlabs==0.3.3`. Upgrade them only
  through an explicit provider spike and update `plan.md`.
- The verified live transcription path is `faster-whisper==1.2.1` with
  `Systran/faster-whisper-base.en` pinned at revision
  `88b03866a4066bb4a97c12258abb82b1e9af0121`. The model runs locally through
  a Toluva Genblaze `SyncProvider` and records its weights hash in the
  manifest.
- The verified translation path is `argostranslate==1.11.0` with the
  English-to-German package `1.3`, invoked through a Toluva Genblaze
  `SyncProvider`. Protected terms are checked before any TTS call.
- An ElevenLabs Scribe adapter remains available, but the configured key
  returned HTTP 401 for STT while continuing to work for TTS. Preserve that
  failure record and do not retry Scribe under the current key.

### Backblaze B2 must be the system of record

B2 is not a final-file dump. Store:

- Source masters
- Consent evidence
- Transcripts and segment timing
- Translations and revisions
- TTS attempts
- Captions
- Thumbnails/posters when implemented
- Intermediate audio/video
- Final localized renders
- Genblaze provenance manifests
- Approval and disclosure records
- Run logs required for the product experience

Prefer the Genblaze B2/S3 storage sink for generated pipeline assets so storage
and provenance remain connected. Direct B2 access is acceptable for application
records that are outside generated pipeline outputs, but it must be documented.

Use deterministic, human-inspectable object keys. Never expose long-lived B2
credentials to the browser.

The hosted read contract is:

- Authorize with the Backblaze Native API only in server code.
- Validate that the key has `readFiles`, the expected bucket, and a prefix that
  covers `projects/live-localization-project/`.
- Reject any object key outside that exact verified project.
- Resolve source, final, caption, and speech media from the immutable final
  record instead of accepting arbitrary browser-supplied keys.
- Preserve `Range`, `Content-Range`, and media content types through the proxy
  so private MP4 playback remains seekable.
- Return sanitized errors and fall back visibly to a verified record snapshot;
  never label the snapshot as a live B2 response.

The hosted write and uploaded-job contract is:

- Accept only a short MP4 within the configured byte and duration limits.
- Enforce the currently verified German/internal-training authorization lane
  before writing a request.
- Generate opaque project, job, and source IDs on the server.
- Use one request-scoped B2 uploader and write, in order: source, source record,
  initial status event, then immutable queue request. The request is the
  claimable commit marker and must be published last.
- A failure before the queue request exists is inert and must never be retried
  as a job automatically. Preserve any durable source object and attach an
  immutable failure record; do not delete or silently overwrite the evidence.
- Keep B2 as the job-state authority. Browser session storage may hold only an
  opaque pointer used to recover the B2 state after refresh.
- Resolve completed uploaded-job media from the immutable final record and
  exact opaque job namespace; never accept an arbitrary B2 key from the browser.
- Keep the Python worker and every provider credential outside Sites.

The current Genblaze Backblaze adapter uses `B2_REGION` to derive its endpoint.
Keep generated sinks scoped beneath the project/job/language prefix, use the
hierarchical key strategy, and keep `auto_lifecycle=False` unless a separately
reviewed infrastructure decision explicitly authorizes bucket-wide changes.

Genblaze manifest verification and stored-asset verification are separate
checks. `Manifest.verify()` validates the canonical manifest and declared hash
metadata; Toluva must also recompute the stored object's SHA-256 and compare it
with the manifest before describing the asset bytes as verified.

For file-backed Genblaze providers used with `ObjectStorageSink`, keep provider
outputs in the system temporary directory unless the SDK exposes an explicit
allowed-root configuration. The current sink rejects project-local
`output_dir` files even when the provider created them. Preserve the failed
attempt and a sanitized failure record, then retry from an accepted path. See
`docs/genblaze-feedback-allowed-output-root.md`.

The verified composition contract is:

- A Toluva `SyncProvider` owns FFmpeg composition inside a Genblaze pipeline.
- The composition step receives three explicit external inputs: source video,
  selected localized audio, and `text/vtt` captions.
- The final MP4 preserves captions as a `mov_text` track, while the WebVTT
  sidecar remains independently accessible in B2.
- Small underlength gaps are silence-padded to the source slot. Never stretch a
  green speech attempt merely to fill the container.
- Store the generated MP4 and canonical composition manifest through the
  Genblaze sink, then independently download and hash the final bytes.
- Direct B2 records may link source, captions, disclosure, and final output,
  but durable records must never contain local filesystem paths.
- The current source video and timed transcript are labelled fixtures. Do not
  present the older composition proof as live transcription or the final
  licensed demo sample.
- The `english-to-german-v4` source is a real speech-bearing, locally generated
  development sample. Its Whisper transcript and Argos translation are genuine
  model outputs, not scripted fixtures. It is still not the final
  entrant-owned or licensed demo video.

The verified fixture-free execution contract is:

- Write a B2 stage intent before each billable or expensive provider stage.
- Reuse a completed B2 checkpoint without calling the provider again.
- If an intent exists without completion, block automatic replay because the
  upstream request may have spent credits.
- Run source ingest, timed transcription, protected-term translation, voice
  authorization, TTS timing QA, captions, and three-input composition as
  inspectable stages.
- Preserve every provider timed segment. Do not collapse a multi-segment
  transcript into one translation or speech slot.
- Keep transcription, translation, speech, and composition as four separately
  verifiable Genblaze manifests.
- Independently re-hash the final B2 object before reporting success.

The pre-TTS transcript-quality contract is:

- Preserve the provider transcript and word-confidence payload exactly as
  detected. Never overwrite it with an operator correction.
- After transcription and before translation, evaluate language probability,
  mean and low-confidence word ratios, protected-term confidence, and
  suspicious trailing fragments against a versioned deterministic policy.
- Store the decision, reason codes, thresholds, evidence, and original-text
  SHA-256 at the fixed job-scoped B2 transcript-QA key.
- A `review_required` decision is a visible `blocked` state, not a failed job.
  It must stop before translation and ElevenLabs, so no TTS credit can be spent.
- Resume only from a separate immutable human-review record whose original hash
  matches the provider text, whose corrected-text hash matches its contents,
  and whose text preserves every protected term.
- Resume the same job immediately after that record appears. Reuse the stored
  transcription checkpoint and never repeat STT merely because review occurred.

The persistent worker contract is:

- Deploy exactly one worker replica. The current B2 claim is durable and
  append-only, but it is not an atomic distributed lock.
- Keep queue scans transaction-budgeted. Derive queued, claimed, failed,
  completed, and immutable-final state from one paginated B2 listing snapshot;
  an idle scan must not issue per-job `HEAD` or `GET` requests.
- Keep production polling and heartbeat intervals at 60 seconds or slower
  unless a measured B2 transaction budget supports a reviewed change. Do not
  publish mutable heartbeats on every idle state transition.
- Keep `TOLUVA_WORKER_ALLOW_PROVIDER_SPEND=false` by default. Only the
  dedicated worker host may set it to `true`.
- Publish the single mutable heartbeat at
  `projects/system-runtime/workers/primary/heartbeat.json`. Its lease must be
  finite, secret-safe, and consumed only by the server bridge.
- Treat every other job status event, provider intent/completion, manifest, and
  media object as immutable.
- Resume an ordinary stale claim only after the configured stale-claim window.
  An immutable transcript human-review record is an explicit resume signal and
  may wake its blocked job immediately through the existing checkpoints.
- On termination, do not claim a new job. A hard kill may interrupt the current
  synchronous step; the replacement worker must recover from B2 rather than
  local process memory.
- Keep runtime logs structured and secret-safe. Error types are acceptable;
  credential values and provider response bodies are not.
- The checked-in Docker image is the deployment artifact. Keep Python, `uv`,
  the explicit CPU-only PyTorch source, model revisions, model hashes, and the
  non-root runtime pinned. Do not allow Linux resolution to reintroduce CUDA
  packages unless the architecture deliberately moves to GPU execution.
- A source-only VPS maintenance build may use
  `services/pipeline/Dockerfile.source-update` only when the main Dockerfile,
  `pyproject.toml`, and `uv.lock` are unchanged from the verified base image.
  Any dependency, tool, operating-system, or model change requires a full
  pinned-image build.
- The production worker is the one systemd-managed `toluva-worker` container on
  the selected VPS. It exposes no port and is capped at 1.5 CPUs, 2,000 MB RAM,
  and 256 processes. Preserve the controls in `deploy/vps/`.
- That VPS also runs an unrelated Dara API and Cloudflare tunnel. Never edit,
  restart, stop, inspect secrets from, or reuse paths and ports owned by those
  services. Do not reinstall/remove Docker or reboot the host. Toluva owns only
  its image, `/etc/toluva/worker.env`, `toluva-worker.service`, and its named
  container.
- Do not describe uploads as automatically processing unless the heartbeat
  lease is currently valid. Offline uploads remain queued.

### The app must fail honestly

- A failed provider call must produce a visible failed/retryable state.
- A blocked consent check must not be bypassed silently.
- Never present placeholder, cached, or seeded media as newly generated.
- Clearly label demo/sample projects.
- Timeouts and retry budgets must be finite.
- Preserve the last known state so jobs can be inspected or resumed.

## TTS Cost and Provider Discipline

Current planning facts, verified July 28–29, 2026:

- ElevenLabs API access is included on the free plan.
- Free includes 10,000 shared credits.
- Starter is listed at $6/month and includes 30,000 credits and instant voice
  cloning.
- Creator is listed at $22/month, with a promotional first-month price shown by
  ElevenLabs at the time of planning, and includes 121,000 credits.
- Multilingual v2 generally charges one credit per character.
- Flash/Turbo API generation can cost roughly 0.5–1 credit per character.
- Credits are shared across ElevenLabs products.
- Voice Library API access is restricted on the free tier.
- Genblaze v0.6.0 improved compatibility for timestamped ElevenLabs TTS.

Treat prices, limits, language support, and plan features as changeable external
facts. Recheck them before purchasing or changing architecture.

Cost rules:

- Run the first integration spike before committing to a paid plan.
- Develop with 15–30-second clips.
- Cache and reuse successful immutable outputs from B2.
- Never regenerate unchanged media during normal page loads or tests.
- Record estimated and actual credit usage per job when possible.
- Use a dedicated cost ceiling for retries.
- Reserve full-length, multi-language runs for final validation and recording.
- Do not promise a demo language until the chosen model and voice have been
  tested through the exact API path.

## Scope Guard

The minimum winning product is:

- Upload one source video.
- Transcribe it into timed segments.
- Define or select a valid voice authorization.
- Select supported target languages.
- Translate each segment with protected terminology.
- Generate localized speech through Genblaze.
- Measure timing drift and retry overlong segments.
- Generate captions.
- Compose at least one complete localized output.
- Store inputs, intermediates, outputs, and manifests in B2.
- Show a job timeline, segment-level QA, consent state, and provenance details.
- Play and download the final output.
- Provide a stable hosted judge experience.

Non-goals until the core is reliable:

- Pixel-perfect lip sync
- Mobile applications
- Real-time dubbing
- Multi-speaker voice diarization beyond what the tested pipeline supports
- Billing
- Team invitations or complex role-based access
- A general-purpose video editor
- A marketplace for voices
- Supporting every provider
- Supporting every language

Do not add a non-goal while any core workflow remains unreliable.

## Demo-First Interface Requirements

The primary journey must be obvious without documentation:

1. Upload or open the approved sample.
2. Inspect speaker/voice authorization.
3. Choose languages.
4. Start localization.
5. Watch the pipeline and segment QA.
6. Compare source and localized outputs.
7. Inspect disclosure and provenance.

The UI must make these two moments unmistakable:

- An overlong translated segment moves from red to green after a bounded
  rewrite/regeneration loop.
- A requested generation is blocked when the voice authorization does not cover
  that language or use.

Use clear, plain language. Technical provider details belong in an expandable
inspector, not as the primary product vocabulary.

## Security, Rights, and Privacy

- Never commit secrets, access tokens, API keys, private bucket details, or real
  consent documents.
- Keep secrets on the server in environment variables.
- Use least-privilege B2 application keys.
- Use short-lived signed URLs or a controlled proxy for protected assets.
- Validate upload type and size.
- Sanitize filenames and user-controlled metadata.
- Prevent arbitrary server-side URL fetching unless it has explicit SSRF
  protection.
- Obtain permission for every demo voice, face, video, image, logo, song, and
  other third-party asset.
- Use an entrant-owned or properly licensed demo video.
- If demonstrating voice cloning, use a team member who has explicitly consented
  and retain the demo consent record.
- The demo video must not contain unlicensed music or trademarks.
- Never log raw credentials, complete consent documents, or unnecessary
  personal data.

## Engineering Standards

- Optimize for a reliable end-to-end vertical slice before breadth.
- Keep provider adapters behind narrow interfaces.
- Make long-running jobs resumable or at least inspectable.
- Use idempotency keys for generation jobs and uploads.
- Separate job state from ephemeral web processes.
- Measure media duration from the generated file, not from character count.
- Preserve structured error codes and human-readable messages.
- Add structured logs with job, language, segment, run, and parent-run IDs.
- Use deterministic fixtures for unit tests and a small real-provider smoke test.
- Mock external providers in ordinary automated tests.
- Pin dependency versions before final submission.
- Document every provider and exact model used.
- Keep setup reproducible from the repository README.
- Record architecture deviations in `plan.md` under the Decision Log.

## Required Verification Before Calling a Feature Done

For each core workflow:

- Happy path works from a fresh browser session.
- A failed provider call is handled.
- A repeated request does not create accidental duplicate billable jobs.
- B2 contains the expected asset and manifest objects.
- The application can recover state after a page refresh.
- Secrets are absent from browser responses and repository history.
- The UI clearly distinguishes queued, running, retrying, blocked, failed, and
  completed states.
- Timing calculations have unit tests around threshold boundaries.
- Consent rules have tests for allowed, expired, wrong-language, and
  wrong-purpose cases.

Before submission:

- Test the public URL in a private/incognito browser.
- Test with the exact judge account or no-auth flow described on Devpost.
- Run the complete sample workflow.
- Verify every media link.
- Verify manifests and hashes.
- Verify repository setup instructions from a clean environment.
- Confirm the app will stay online through August 11.
- Submit before the internal deadline.

## Documentation Discipline

- `plan.md` is the product and delivery source of truth.
- Update the plan when a provider spike changes feasibility, scope, cost, or
  language coverage.
- Add consequential decisions to the Decision Log with a date and rationale.
- Do not silently change the core pitch, audience, signature differentiators, or
  required technologies.
- When in doubt, prioritize judge-visible reliability and clarity over feature
  count.
