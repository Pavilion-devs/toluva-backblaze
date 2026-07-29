import json
from pathlib import Path

from genblaze_core import parse_manifest

from toluva_pipeline.provenance import run_local_provenance_spike


def test_local_spike_verifies_manifest_and_real_asset_bytes(tmp_path: Path) -> None:
    report = run_local_provenance_spike(tmp_path)
    assert report.run_status == "completed"
    assert report.authorization_code == "allowed"
    assert report.timing_band == "green"
    assert report.timing_action == "accept"
    assert report.live_provider is False
    assert report.manifest_hash_valid is True
    assert report.manifest_integrity_valid is True
    assert report.asset_hash_valid is True

    manifest_path = Path(report.manifest_path)
    manifest = parse_manifest(
        json.loads(manifest_path.read_text(encoding="utf-8"))
    )
    assert manifest.verify() is True
    assert manifest.canonical_hash == report.manifest_hash
    stored_report = json.loads(
        (manifest_path.parent / "report.json").read_text(encoding="utf-8")
    )
    assert stored_report["asset_hash_valid"] is True
