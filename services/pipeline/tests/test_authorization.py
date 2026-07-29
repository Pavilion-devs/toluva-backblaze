from datetime import UTC, datetime, timedelta

import pytest

from toluva_pipeline.domain.authorization import (
    AuthorizationBlockedError,
    AuthorizationCode,
    AuthorizationRequest,
    VoiceAuthorization,
    VoiceType,
    authorize_or_raise,
    evaluate_authorization,
)

NOW = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)


def authorization(**overrides: object) -> VoiceAuthorization:
    values: dict[str, object] = {
        "authorization_id": "auth-001",
        "speaker_id": "speaker-001",
        "voice_profile_id": "voice-001",
        "voice_type": VoiceType.CLONED,
        "evidence_asset_id": "evidence-001",
        "evidence_sha256": "a" * 64,
        "allowed_languages": ("de-DE", "es-ES"),
        "allowed_purposes": ("internal-training",),
        "valid_from": NOW - timedelta(days=1),
        "expires_at": NOW + timedelta(days=30),
        "approved_by": "reviewer-001",
        "approved_at": NOW - timedelta(days=1),
        "revoked_at": None,
    }
    values.update(overrides)
    return VoiceAuthorization(**values)


def request(**overrides: object) -> AuthorizationRequest:
    values: dict[str, object] = {
        "voice_profile_id": "voice-001",
        "language": "de-DE",
        "purpose": "internal-training",
        "requested_at": NOW,
    }
    values.update(overrides)
    return AuthorizationRequest(**values)


def test_allows_matching_scope() -> None:
    decision = evaluate_authorization(authorization(), request())
    assert decision.allowed is True
    assert decision.code == AuthorizationCode.ALLOWED


@pytest.mark.parametrize(
    ("record", "requested", "expected"),
    [
        (None, request(), AuthorizationCode.MISSING),
        (
            authorization(expires_at=NOW),
            request(),
            AuthorizationCode.EXPIRED,
        ),
        (
            authorization(),
            request(language="ja-JP"),
            AuthorizationCode.WRONG_LANGUAGE,
        ),
        (
            authorization(),
            request(purpose="public-marketing"),
            AuthorizationCode.WRONG_PURPOSE,
        ),
        (
            authorization(revoked_at=NOW - timedelta(minutes=1)),
            request(),
            AuthorizationCode.REVOKED,
        ),
        (
            authorization(evidence_sha256="not-a-digest"),
            request(),
            AuthorizationCode.INVALID_EVIDENCE,
        ),
    ],
)
def test_blocks_invalid_scope(
    record: VoiceAuthorization | None,
    requested: AuthorizationRequest,
    expected: AuthorizationCode,
) -> None:
    decision = evaluate_authorization(record, requested)
    assert decision.allowed is False
    assert decision.code == expected


def test_gate_raises_before_generation() -> None:
    with pytest.raises(AuthorizationBlockedError) as error:
        authorize_or_raise(authorization(), request(language="ja-JP"))
    assert error.value.decision.code == AuthorizationCode.WRONG_LANGUAGE


def test_rejects_naive_request_timestamp() -> None:
    with pytest.raises(ValueError, match="timezone"):
        evaluate_authorization(
            authorization(),
            request(requested_at=datetime(2026, 7, 29, 12, 0)),
        )
