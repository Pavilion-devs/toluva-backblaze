# Toluva VPS worker

This deployment runs the pinned Toluva worker container as one isolated,
continuously polling system service. It does not host the web application or
accept inbound traffic. The worker needs outbound HTTPS access to Backblaze B2
and ElevenLabs only.

## Isolation contract

- Run exactly one Toluva worker replica.
- Do not publish a container port.
- Do not edit, restart, or depend on unrelated application services.
- Keep the worker environment at `/etc/toluva/worker.env`, owned by root with
  mode `0600`.
- Keep B2 as the durable queue and system of record. The container filesystem
  is replaceable.
- Cap the worker at 1.5 CPUs, 2,000 MB RAM, 256 processes, and three 25 MB log
  files.
- Drop all Linux capabilities and enable `no-new-privileges`.
- Give the worker up to 120 seconds to handle termination before removal.
- Pin the deployed image tag to the verified source revision. Never deploy a
  floating `latest` tag.

The 2,000 MB memory ceiling was exercised with Faster Whisper and Argos loaded
and run in the same process. It keeps capacity reserved for the host and any
pre-existing service.

## Files

- `toluva-worker.service` — systemd unit that owns the one container replica
- `worker.env.example` — secret-free runtime contract

The current deployment image is `toluva-worker:queue-v4-8e21b7e`, built from
the repository's checked-in Dockerfile. It contains Python 3.12.13, the locked
CPU-only Python environment, FFmpeg/FFprobe, the pinned Faster Whisper model,
and the pinned Argos English-to-German model.

The worker polls and publishes its lease every 60 seconds. An idle queue scan
uses one paginated B2 listing snapshot and must not perform per-job `HEAD` or
`GET` requests. Idle state changes remain in process memory between heartbeat
publications.

For a source-only maintenance release, when `Dockerfile`, `pyproject.toml`, and
`uv.lock` are byte-for-byte unchanged from the deployed base,
`services/pipeline/Dockerfile.source-update` may layer the new checked-in source
over that verified image. Do not use that path for dependency, operating-system,
FFmpeg, Python, or model changes; those require a full pinned-image build.

## Pre-deployment checks

Before changing the host, record the state, main process IDs, start timestamps,
and unit hashes of every existing application service. Confirm that:

- the existing application answers on its current local port;
- `/opt/toluva`, `/etc/toluva`, and `toluva-worker.service` do not collide with
  an unrelated deployment;
- at least 8 GB of disk and 2.5 GB of currently available memory remain;
- the host is `linux/amd64`.

Installing or starting Toluva must not require a reboot.

## Install

1. Install Docker from the Ubuntu package repository without upgrading or
   restarting unrelated services.
2. Load the verified `linux/amd64` image and tag it
   `toluva-worker:queue-v4-8e21b7e`.
3. Create `/etc/toluva/worker.env` from `worker.env.example`, insert only the
   scoped B2 credential and ElevenLabs key, and set mode `0600`.
4. Copy `toluva-worker.service` to `/etc/systemd/system/`.
5. Run `systemd-analyze verify` on the unit.
6. Reload systemd, enable the unit, and start only `toluva-worker.service`.

No reverse proxy, firewall, forwarded port, DNS, or Cloudflare change is
required.

## Verify

The deployment is ready only when all of the following are true:

```bash
systemctl is-active toluva-worker.service
docker inspect \
  --format '{{.State.Status}} {{.State.Health.Status}}' \
  toluva-worker
docker logs --tail 20 toluva-worker
```

The container must report `running healthy`, and the logs must show idle worker
ticks without credential values. The hosted Toluva worker-status route must
observe a current B2 heartbeat lease.

Repeat every pre-deployment service check afterward. Existing services must
retain the same unit hashes and main process IDs, proving they were not
restarted or edited.

## First deployment record — July 29, 2026

- Remote image ID matched the verified local image ID:
  `sha256:41e238e088f63c0293667143c8ac8d2ba700ca9c105a6ae8558e4b3b18f620b8`.
- The container reached `running healthy` with zero restarts.
- Enforced limits were 2,000 MB RAM, no swap above that limit, 1.5 CPUs, and
  256 processes. All capabilities were dropped and no ports were published.
- Settled idle use measured approximately 66 MB RAM and 0.01% CPU.
- The B2 heartbeat reported `queue-v1`, one replica, a current lease, and
  `idle`. The hosted UI rendered `WORKER ONLINE` and `LIVE B2 RUN`.
- The worker was started only after a read-only B2 scan confirmed the queue was
  empty.
- The pre-existing Dara API and Cloudflare unit hashes remained unchanged. The
  process IDs present immediately before the Toluva service start remained
  unchanged through final verification, and the Dara health endpoint remained
  green.

Ubuntu's one-time Docker package installation triggered a brief managed restart
of the pre-existing services before Toluva was started. They recovered
immediately. Additional orderly restarts happened while separate Dara
regeneration traffic was active; the kernel reported no OOM. Future Toluva
maintenance must not reinstall or remove Docker, reboot the host, or touch the
unrelated service units.

## Queue-v2 maintenance record — July 29, 2026

- A controlled production preflight found that the original five-second idle
  loop exhausted the bucket's configured Class B/download transaction cap.
  The cap blocked a source read before any new ElevenLabs call was made.
- Queue v2 derives claim and terminal state from the existing B2 listing
  snapshot. A final record, completed event, or failed event prevents reclaim
  without a separate object read.
- Polling and heartbeat publication are both fixed at a minimum of 60 seconds.
  The worker no longer uploads heartbeat state twice on every idle poll.
- The local `linux/amd64` image passed secret-safe readiness, both pinned model
  hashes, and the complete 87-test pipeline suite before deployment.
- The deployed image ID exactly matched the local image ID:
  `sha256:6c78a0ef5cedcd38b2a2165fd23c3632dc002a530c536006f38c4065f5c7e4c3`.
  The container returned `running healthy` with zero restarts, no ports, the
  original isolation limits, and root-only environment mode `0600`.
- Consecutive production ticks settled to one idle scan per minute with no
  repeat of the old completed-job failure loop. A new uploaded handshake
  remains intentionally blocked until Backblaze permits object downloads
  again; no ElevenLabs call was made.
- Both unrelated services were active after deployment and the Dara health
  endpoint remained green. The Dara API process ID changed during the long
  model-image transfer without a command targeting its unit; no kernel OOM was
  recorded. The Cloudflare tunnel process remained unchanged.

## Controlled production handshake — July 30, 2026

- The deployed Sites intake queued project
  `intake-a41c94f7088544a08984b17070702388`, job
  `localize-f2c26c2ff9624974a9ca3d495b50654d`, after durably storing the exact
  49,903-byte, four-second source with SHA-256
  `f5872bd6324abd57d5c0a534c11729989a9e3a5f10384783dc49d8a98c6ad41e`.
- Queue v2 claimed the request during its next bounded poll and completed all
  12 status stages. The worker logged one ElevenLabs stage, generated 61
  characters in one speech attempt, and completed without a restart.
- Timing QA measured 3.94449 seconds against the 4.000-second slot
  (-1.38775% drift), classified it green, and accepted the first attempt.
- The project contains 37 B2 objects, exactly one speech manifest, one final
  record, and four Genblaze manifests. All four manifests verified and every
  referenced asset matched its recorded SHA-256.
- The final 76,059-byte MP4 is exactly 4.000 seconds with H.264 video, AAC
  audio, and German `mov_text` subtitles. Its SHA-256 is
  `98c7f2979d7521fe123d9ff01817a1b9105b0fae9bb31a86d11d79259d6419a6`.
  The private hosted player loaded the exact job media to ready state 4, and
  the browser-downloaded bytes matched that hash.
- Replaying the exact project/job handle returned the completed B2 checkpoint.
  The project stayed at 37 objects and one speech manifest, its newest object
  stayed the original `12-completed` event, and worker logs contained no
  second ElevenLabs preflight or generation activity.
- A preceding hosted request failed safely after storing only its source. It
  never published a queue request and never called a provider. The source was
  preserved, not deleted, and an immutable audit record was added at
  `projects/intake-ea29e570c7224b7eb1cbf5d6998e1727/failures/hosted-intake-2026-07-30.json`.
- Commit `22366132f24aeefcdb82aff073c8b65865534424` fixed that boundary by
  reusing one request-scoped upload URL and publishing the immutable queue
  request only after the source, source record, and initial status are durable.
- No Backblaze cap, billing, lifecycle, or application-key setting was changed.
  No command targeted the Dara API, Cloudflare tunnel, their units, or their
  ports.

## Queue-v3 transcript-gate deployment — July 30, 2026

- Transcript-gate source revision `35465e638cbdf6e37a3bc44db37a3761fa150084`
  passed 100 pipeline tests. The web boundary passed its production build,
  lint, and all eight rendered route tests.
- The worker Dockerfile, `pyproject.toml`, and `uv.lock` were unchanged from
  the verified queue-v2 base. The checked-in source-update Dockerfile therefore
  layered only the new application source over that pinned runtime; it did not
  install packages, download models, change Docker, or alter the host.
- The deployed image is `toluva-worker:queue-v3-35465e6`, with image ID
  `sha256:79846492e41f10616ab21e7c6ebfb761f726f06c95113653ea0223527179bbc8`
  and reported size 1,629,125,534 bytes.
- Secret-safe readiness passed with B2 and ElevenLabs configured, FFmpeg and
  FFprobe present, both pinned models present, provider spend explicitly
  enabled only on the dedicated host, and the 60-second poll/heartbeat
  contract intact.
- Running the exact production hallucinated tail through the deployed image
  returned engine `queue-v3`, decision `review_required`, reason
  `suspicious_trailing_fragment`, mean confidence `0.6908042778571447`, and
  trailing evidence `Languages which is...`.
- The systemd service uses the checked-in unit hash
  `be2f732d116d9ad5db4120a2cf379711a84fb87e6ffb7ff99b45772eab837f0f`.
  The previous Toluva unit is preserved inside the revision deployment
  directory for rollback.
- Final state was `active/running`, container health `healthy`, restart count
  zero, no published ports, all capabilities dropped, 1.5 CPUs, 2,000 MB RAM,
  and 256 processes. The root-only environment remained mode `0600`.
- The B2 heartbeat reported engine `queue-v3`, one replica, and `idle` with a
  current finite lease. Worker logs contained only an idle tick after cutover.
- Sites version 11 deployed privately from commit
  `4ebf5ee61b048f1e11b6001581b13b3ab670bd3e`; its recent production error log
  was empty.
- No localization job was created, no media or review evidence was written,
  and no Whisper, Argos, or ElevenLabs call ran during this deployment. No
  command targeted the Dara API, Cloudflare tunnel, their units, or their
  ports.

## Controlled transcript-block proof — July 30, 2026

- The first controlled job, project
  `intake-b36ed50b988547dfbc696789c1869c43` and job
  `localize-8bb6ad370ec14e659f1a9008cb01dcac`, stored the correct
  `review_required` QA record but failed closed after transcription. The fresh
  in-memory reason codes were a tuple while the same immutable JSON record
  reloads as a list. The integrity boundary stopped before translation or TTS,
  and the failed job remains untouched as defect evidence.
- Commit `e3634e28cbf187c732ee9e936af0728dc1339132` normalizes fresh QA
  records to their exact JSON shape and adds the missing regression test. The
  complete pipeline suite passed 101 tests.
- The corrected worker image is `toluva-worker:queue-v3-e3634e2`, image ID
  `sha256:f1e596beedd2477c81c1d7e872739c14df407e7d92e843f9d2b55d763cbba72d`,
  and reported size 1,629,135,207 bytes. Offline readiness and the exact
  hallucinated transcript check passed before cutover; `reason_codes` was a
  JSON-shaped list.
- The final controlled proof is project
  `intake-eae21f6090ae4ede90070ce422b91e0d`, job
  `localize-304ebb7c451e4db1b8000f7763d6ac60`. It used the exact 49,903-byte,
  four-second source with SHA-256
  `f5872bd6324abd57d5c0a534c11729989a9e3a5f10384783dc49d8a98c6ad41e`.
- The job ended at append-only stage `06-transcript-blocked`. Its QA record
  reports `review_required`, reason `suspicious_trailing_fragment`, mean word
  confidence `0.6908042778571447`, and trailing evidence
  `Languages which is...`.
- The project contains 16 objects: governed intake, six status events, the
  transcription checkpoint and Genblaze evidence, timed transcript and
  segments, and transcript QA. It contains no translation, speech, caption,
  composition, disclosure, authorization, human-review, or final object.
- After refreshing the already-open tab onto Sites version 11, the production
  UI rendered `PRE-TTS QUALITY GATE`, `NO TTS SPEND`, the reason, confidence,
  trailing evidence, corrected-text field, and approval control. The approval
  control was intentionally not used.
- Worker logs recorded `TranscriptQualityBlocked` followed by idle ticks. The
  corrected container remained healthy with zero restarts. No Argos,
  ElevenLabs, captions, composition, or final-publication stage ran, and no
  command targeted the Dara API or Cloudflare tunnel.

## Controlled transcript-resume proof — July 30, 2026

- The production review panel approved “Welcome to Toluva, One Message, Many
  Languages.” for the same project
  `intake-eae21f6090ae4ede90070ce422b91e0d` and job
  `localize-304ebb7c451e4db1b8000f7763d6ac60`.
- B2 stores the correction as one immutable human-review record whose original
  hash matches the preserved transcript-QA record. The final record lists the
  source, transcription, transcript-quality, and human-review checkpoints as
  resumed, and the project contains only one transcription manifest.
- The worker ran Argos locally, passed the voice authorization boundary, and
  made one 54-character ElevenLabs speech attempt. Its -10.5306% drift was
  amber, so the engine padded silence and did not make a second TTS call.
- The completed project contains 41 objects and 14 ordered status events:
  exactly one human review, speech asset, speech manifest, and final record,
  plus the four expected Genblaze manifests.
- The 69,022-byte final MP4 is 4.0 seconds. Its B2 bytes independently matched
  SHA-256
  `7eb71111fa8e3004f241865669624b32fad2886c68c8226fb3df831b852284c1`,
  and the production player loaded it to ready state 4.
- Subsequent worker ticks remained idle. A later B2 listing stayed at 41
  objects and one speech manifest, with `14-completed.json` still newest, so
  replay created no new artifact or provider call.
- Only the Toluva container and its own logs were inspected. No command
  targeted the Dara API, Cloudflare tunnel, their units, secrets, paths, or
  ports.

## Queue-v4 multi-segment deployment — July 30, 2026

- Source revision `8e21b7e9c53bfa86d0d928944ccf431c9885d684`
  passed 119 pipeline tests and the production Sites build.
- The main worker Dockerfile, `pyproject.toml`, and `uv.lock` were unchanged
  from the deployed queue-v3 base. The source-only Dockerfile replaced only
  `/app/services/pipeline/src`; it did not install dependencies, download
  models, change Docker, or alter the host.
- The deployed image is `toluva-worker:queue-v4-8e21b7e`, image ID
  `sha256:0fac65bd5114ed41329266e4ddbb029593393cae49837cd2a7b9f2d70e3a4976`,
  and reported size 1,629,192,452 bytes.
- Network-disabled imports confirmed queue-v4, multi-segment orchestration,
  approved translation revisions, and source-timed audio assembly. A second
  network-disabled readiness run confirmed the scoped credentials, pinned
  models, FFmpeg/FFprobe, one-replica setting, 60-second poll/heartbeat, and
  provider-spend gate without calling any service.
- The checked-in Toluva unit hash is
  `2cd5b2ab5a2a48c9ba455c893f763d86e12b22c49ff894ccf3ca78d5fc32fc53`.
  The previous Toluva unit is preserved beneath
  `/opt/toluva/releases/e265982/` for rollback.
- Final state was `active/running`, container health `healthy`, restart count
  zero, no published ports, 1.5 CPUs, 2,000 MB RAM, 256 processes, and root-only
  environment mode `0600`. Idle use measured approximately 60 MB and 0.01% CPU.
- The B2 heartbeat reported `queue-v4`, one replica, `idle`, and a finite
  lease. The deployment created no localization job and made no Whisper,
  Argos, ElevenLabs, audio-assembly, or composition call.
- Sites version 12 deployed privately from commit
  `e26598277dc9718627b48d5e3df0fa252c0c7a02`; recent production error logs
  were empty.
- The Dara API, Dara web service, and both Cloudflare tunnel services retained
  the exact process IDs and unit hashes captured before cutover. Dara's health
  endpoint stayed green.

## Rollback

Rollback affects Toluva only:

```bash
systemctl disable --now toluva-worker.service
docker rm --force toluva-worker
```

Do not remove Docker or reboot the host during an incident; either action could
affect unrelated workloads. B2 preserves queued requests and checkpoints while
the worker is offline.
