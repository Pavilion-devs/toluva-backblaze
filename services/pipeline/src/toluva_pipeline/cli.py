"""Command-line entry points for safe spike and readiness checks."""

from __future__ import annotations

import argparse
import json
from importlib.metadata import version
from pathlib import Path
from shutil import which

from toluva_pipeline.provenance import run_local_provenance_spike
from toluva_pipeline.settings import Settings


def _readiness() -> dict[str, object]:
    settings = Settings.from_env()
    return {
        "versions": {
            "genblaze-core": version("genblaze-core"),
            "genblaze-s3": version("genblaze-s3"),
            "genblaze-elevenlabs": version("genblaze-elevenlabs"),
        },
        "media_tools": {
            "ffmpeg": which("ffmpeg") is not None,
            "ffprobe": which("ffprobe") is not None,
        },
        "credentials": settings.readiness(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="toluva-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("readiness")
    local = subparsers.add_parser("local-provenance")
    local.add_argument("--work-dir", type=Path)
    args = parser.parse_args()

    if args.command == "readiness":
        result = _readiness()
    else:
        settings = Settings.from_env()
        result = run_local_provenance_spike(
            args.work_dir or settings.work_dir
        ).to_dict()
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
