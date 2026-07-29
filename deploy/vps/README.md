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

The current deployment image is `toluva-worker:queue-v2-6c78a0e`, built from
the repository's checked-in Dockerfile. It contains Python 3.12.13, the locked
CPU-only Python environment, FFmpeg/FFprobe, the pinned Faster Whisper model,
and the pinned Argos English-to-German model.

The worker polls and publishes its lease every 60 seconds. An idle queue scan
uses one paginated B2 listing snapshot and must not perform per-job `HEAD` or
`GET` requests. Idle state changes remain in process memory between heartbeat
publications.

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
   `toluva-worker:queue-v2-6c78a0e`.
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

## Rollback

Rollback affects Toluva only:

```bash
systemctl disable --now toluva-worker.service
docker rm --force toluva-worker
```

Do not remove Docker or reboot the host during an incident; either action could
affect unrelated workloads. B2 preserves queued requests and checkpoints while
the worker is offline.
