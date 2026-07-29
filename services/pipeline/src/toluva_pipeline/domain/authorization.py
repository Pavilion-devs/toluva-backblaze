"""Consent-bound voice authorization rules.

This module deliberately has no provider imports: policy must run before a
billable generation client is constructed or called.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class VoiceType(StrEnum):
    STOCK = "stock"
    DESIGNED = "designed"
    CLONED = "cloned"


class AuthorizationCode(StrEnum):
    ALLOWED = "allowed"
    MISSING = "missing_authorization"
    INVALID_EVIDENCE = "invalid_evidence"
    NOT_YET_VALID = "not_yet_valid"
    EXPIRED = "expired"
    REVOKED = "revoked"
    WRONG_LANGUAGE = "wrong_language"
    WRONG_PURPOSE = "wrong_purpose"
    WRONG_VOICE = "wrong_voice"


@dataclass(frozen=True)
class VoiceAuthorization:
    authorization_id: str
    speaker_id: str
    voice_profile_id: str
    voice_type: VoiceType
    evidence_asset_id: str
    evidence_sha256: str
    allowed_languages: tuple[str, ...]
    allowed_purposes: tuple[str, ...]
    valid_from: datetime
    expires_at: datetime
    approved_by: str
    approved_at: datetime
    revoked_at: datetime | None = None


@dataclass(frozen=True)
class AuthorizationRequest:
    voice_profile_id: str
    language: str
    purpose: str
    requested_at: datetime


@dataclass(frozen=True)
class AuthorizationDecision:
    allowed: bool
    code: AuthorizationCode
    message: str
    authorization_id: str | None = None


class AuthorizationBlockedError(RuntimeError):
    def __init__(self, decision: AuthorizationDecision) -> None:
        super().__init__(decision.message)
        self.decision = decision


def _normalized(value: str) -> str:
    return value.strip().casefold().replace("_", "-")


def _require_aware(value: datetime, field_name: str) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone")


def evaluate_authorization(
    authorization: VoiceAuthorization | None,
    request: AuthorizationRequest,
) -> AuthorizationDecision:
    """Evaluate scope in a stable order before any provider call."""

    _require_aware(request.requested_at, "requested_at")
    if authorization is None:
        return AuthorizationDecision(
            allowed=False,
            code=AuthorizationCode.MISSING,
            message="A voice authorization record is required before generation.",
        )

    for field_name, value in (
        ("valid_from", authorization.valid_from),
        ("expires_at", authorization.expires_at),
        ("approved_at", authorization.approved_at),
    ):
        _require_aware(value, field_name)
    if authorization.revoked_at is not None:
        _require_aware(authorization.revoked_at, "revoked_at")

    decision_base = {"authorization_id": authorization.authorization_id}
    if not _SHA256_RE.fullmatch(authorization.evidence_sha256):
        return AuthorizationDecision(
            False,
            AuthorizationCode.INVALID_EVIDENCE,
            "The authorization evidence is missing a valid SHA-256 digest.",
            **decision_base,
        )
    if request.voice_profile_id != authorization.voice_profile_id:
        return AuthorizationDecision(
            False,
            AuthorizationCode.WRONG_VOICE,
            "The authorization does not cover the requested voice profile.",
            **decision_base,
        )
    if request.requested_at < authorization.valid_from:
        return AuthorizationDecision(
            False,
            AuthorizationCode.NOT_YET_VALID,
            "The voice authorization is not valid yet.",
            **decision_base,
        )
    if request.requested_at >= authorization.expires_at:
        return AuthorizationDecision(
            False,
            AuthorizationCode.EXPIRED,
            "The voice authorization has expired.",
            **decision_base,
        )
    if (
        authorization.revoked_at is not None
        and request.requested_at >= authorization.revoked_at
    ):
        return AuthorizationDecision(
            False,
            AuthorizationCode.REVOKED,
            "The voice authorization was revoked before this request.",
            **decision_base,
        )

    languages = {_normalized(value) for value in authorization.allowed_languages}
    if _normalized(request.language) not in languages:
        return AuthorizationDecision(
            False,
            AuthorizationCode.WRONG_LANGUAGE,
            f"The authorization does not permit language {request.language!r}.",
            **decision_base,
        )

    purposes = {_normalized(value) for value in authorization.allowed_purposes}
    if _normalized(request.purpose) not in purposes:
        return AuthorizationDecision(
            False,
            AuthorizationCode.WRONG_PURPOSE,
            f"The authorization does not permit purpose {request.purpose!r}.",
            **decision_base,
        )

    return AuthorizationDecision(
        True,
        AuthorizationCode.ALLOWED,
        "The requested voice, language, purpose, and date are authorized.",
        **decision_base,
    )


def authorize_or_raise(
    authorization: VoiceAuthorization | None,
    request: AuthorizationRequest,
) -> AuthorizationDecision:
    decision = evaluate_authorization(authorization, request)
    if not decision.allowed:
        raise AuthorizationBlockedError(decision)
    return decision
