from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from toluva_pipeline.api import app

client = TestClient(app)


def test_health_never_returns_credential_values(monkeypatch) -> None:
    monkeypatch.setenv("B2_KEY_ID", "secret-key-id")
    monkeypatch.setenv("B2_APP_KEY", "secret-app-key")
    response = client.get("/health")
    payload = response.json()
    serialized = response.text
    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["credentials"]["b2"]["ready"] is False
    assert "secret-key-id" not in serialized
    assert "secret-app-key" not in serialized


def test_authorization_endpoint_blocks_wrong_language() -> None:
    now = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    response = client.post(
        "/v1/authorization/check",
        json={
            "authorization": {
                "authorization_id": "auth-001",
                "speaker_id": "speaker-001",
                "voice_profile_id": "voice-001",
                "voice_type": "cloned",
                "evidence_asset_id": "evidence-001",
                "evidence_sha256": "a" * 64,
                "allowed_languages": ["de-DE"],
                "allowed_purposes": ["internal-training"],
                "valid_from": (now - timedelta(days=1)).isoformat(),
                "expires_at": (now + timedelta(days=30)).isoformat(),
                "approved_by": "reviewer-001",
                "approved_at": (now - timedelta(days=1)).isoformat(),
            },
            "voice_profile_id": "voice-001",
            "language": "ja-JP",
            "purpose": "internal-training",
            "requested_at": now.isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["code"] == "wrong_language"


def test_timing_endpoint_selects_retry() -> None:
    response = client.post(
        "/v1/timing/evaluate",
        json={
            "source_start_seconds": 0,
            "source_end_seconds": 10,
            "generated_seconds": 12,
            "attempt_number": 1,
        },
    )
    assert response.status_code == 200
    assert response.json()["action"] == "retry_shorter"
