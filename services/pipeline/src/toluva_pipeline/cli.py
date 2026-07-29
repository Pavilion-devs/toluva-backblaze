"""Command-line entry points for safe spike and readiness checks."""

from __future__ import annotations

import argparse
import json
from importlib.metadata import version
from pathlib import Path
from shutil import which

from toluva_pipeline.live_end_to_end import E2E_JOB_ID, run_live_end_to_end
from toluva_pipeline.live_composition import run_live_composition
from toluva_pipeline.live_timing_correction import (
    LIVE_JOB_ID,
    run_live_timing_correction,
)
from toluva_pipeline.live_tts import run_live_tts_spike
from toluva_pipeline.job_queue import (
    process_next_queued_job,
    process_queued_job,
)
from toluva_pipeline.provenance import run_local_provenance_spike
from toluva_pipeline.settings import Settings


def _readiness() -> dict[str, object]:
    settings = Settings.from_env()
    model_root = settings.work_dir / "models"
    return {
        "versions": {
            "argostranslate": version("argostranslate"),
            "faster-whisper": version("faster-whisper"),
            "genblaze-core": version("genblaze-core"),
            "genblaze-s3": version("genblaze-s3"),
            "genblaze-elevenlabs": version("genblaze-elevenlabs"),
        },
        "media_tools": {
            "ffmpeg": which("ffmpeg") is not None,
            "ffprobe": which("ffprobe") is not None,
        },
        "local_models": {
            "argos-en-de-1.3": (
                model_root
                / "argos"
                / "packages"
                / "translate-en_de-1_3"
                / "model"
                / "model.bin"
            ).is_file(),
            "whisper-base-en": (
                model_root / "whisper" / "base-en" / "model.bin"
            ).is_file(),
        },
        "credentials": settings.readiness(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="toluva-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("readiness")
    local = subparsers.add_parser("local-provenance")
    local.add_argument("--work-dir", type=Path)
    live = subparsers.add_parser("live-tts-spike")
    live.add_argument(
        "--confirm-spend",
        action="store_true",
        help="Required acknowledgement that this command spends provider credits.",
    )
    correction = subparsers.add_parser("live-timing-correction")
    correction.add_argument(
        "--confirm-spend",
        action="store_true",
        help="Required acknowledgement that this command spends provider credits.",
    )
    correction.add_argument(
        "--job-id",
        default=LIVE_JOB_ID,
        help="Stable job ID; an existing B2 record blocks duplicate generation.",
    )
    composition = subparsers.add_parser("compose-live-slice")
    composition.add_argument(
        "--confirm-write",
        action="store_true",
        help="Required acknowledgement that this command writes durable B2 records.",
    )
    composition.add_argument(
        "--job-id",
        default=LIVE_JOB_ID,
        help="Stable job ID containing the verified timing-correction result.",
    )
    end_to_end = subparsers.add_parser("live-end-to-end")
    end_to_end.add_argument(
        "--confirm-spend",
        action="store_true",
        help=(
            "Required acknowledgement that transcription and speech generation "
            "spend provider credits."
        ),
    )
    end_to_end.add_argument(
        "--job-id",
        default=E2E_JOB_ID,
        help="Stable job ID; completed stages are safely reused.",
    )
    queue_worker = subparsers.add_parser("queue-worker")
    queue_worker.add_argument(
        "--confirm-spend",
        action="store_true",
        help=(
            "Required acknowledgement that a claimed job may spend "
            "ElevenLabs credits."
        ),
    )
    queue_worker.add_argument(
        "--once",
        action="store_true",
        help="Claim and process at most one oldest unclaimed B2 job.",
    )
    queue_worker.add_argument(
        "--project-id",
        help="Exact intake project ID to resume or process.",
    )
    queue_worker.add_argument(
        "--job-id",
        help="Exact localization job ID to resume or process.",
    )
    args = parser.parse_args()

    if args.command == "readiness":
        result = _readiness()
    elif args.command == "local-provenance":
        settings = Settings.from_env()
        result = run_local_provenance_spike(
            args.work_dir or settings.work_dir
        ).to_dict()
    elif args.command == "live-tts-spike":
        if not args.confirm_spend:
            parser.error("live-tts-spike requires --confirm-spend")
        result = run_live_tts_spike(Settings.from_env()).to_dict()
    elif args.command == "live-timing-correction":
        if not args.confirm_spend:
            parser.error("live-timing-correction requires --confirm-spend")
        result = run_live_timing_correction(
            Settings.from_env(),
            job_id=args.job_id,
        ).to_dict()
    elif args.command == "compose-live-slice":
        if not args.confirm_write:
            parser.error("compose-live-slice requires --confirm-write")
        result = run_live_composition(
            Settings.from_env(),
            job_id=args.job_id,
        ).to_dict()
    elif args.command == "live-end-to-end":
        if not args.confirm_spend:
            parser.error("live-end-to-end requires --confirm-spend")
        result = run_live_end_to_end(
            Settings.from_env(),
            job_id=args.job_id,
        ).to_dict()
    else:
        if not args.confirm_spend:
            parser.error("queue-worker requires --confirm-spend")
        exact_handle = bool(args.project_id or args.job_id)
        if exact_handle and not (args.project_id and args.job_id):
            parser.error(
                "queue-worker requires both --project-id and --job-id"
            )
        if exact_handle and args.once:
            parser.error(
                "queue-worker accepts either --once or an exact job handle"
            )
        if not exact_handle and not args.once:
            parser.error(
                "queue-worker requires --once or an exact job handle"
            )
        settings = Settings.from_env()
        report = (
            process_queued_job(
                settings,
                project_id=args.project_id,
                job_id=args.job_id,
            )
            if exact_handle
            else process_next_queued_job(settings)
        )
        result = (
            {"status": "idle", "message": "No unclaimed B2 job was found."}
            if report is None
            else report.to_dict()
        )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
