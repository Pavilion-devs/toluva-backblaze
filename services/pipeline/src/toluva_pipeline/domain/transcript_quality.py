"""Deterministic transcript review before translation or billable speech."""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import asdict, dataclass
from typing import Any

from toluva_pipeline.domain.transcription import parse_scribe_words

POLICY_VERSION = "transcript-quality-v1"
_TRAILING_CONTINUATIONS = frozenset(
    {
        "a",
        "an",
        "and",
        "because",
        "for",
        "if",
        "is",
        "of",
        "or",
        "that",
        "the",
        "to",
        "which",
        "with",
    }
)
_WORD_EDGE = re.compile(r"(^[^\w]+|[^\w]+$)")


class TranscriptQualityBlocked(RuntimeError):
    """Raised before translation when a transcript requires human review."""

    job_state = "blocked"

    def __init__(self, reason_codes: tuple[str, ...]) -> None:
        self.reason_codes = reason_codes
        super().__init__(
            "Transcript quality review is required before localization."
        )


@dataclass(frozen=True)
class TranscriptQualityPolicy:
    min_language_probability: float = 0.80
    min_mean_word_confidence: float = 0.65
    low_word_confidence: float = 0.35
    max_low_confidence_ratio: float = 0.20
    protected_term_min_confidence: float = 0.45
    trailing_window_size: int = 3

    def __post_init__(self) -> None:
        for name, value in (
            ("min_language_probability", self.min_language_probability),
            ("min_mean_word_confidence", self.min_mean_word_confidence),
            ("low_word_confidence", self.low_word_confidence),
            ("max_low_confidence_ratio", self.max_low_confidence_ratio),
            (
                "protected_term_min_confidence",
                self.protected_term_min_confidence,
            ),
        ):
            if not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError(f"{name} must be between 0 and 1")
        if self.trailing_window_size < 1:
            raise ValueError("trailing_window_size must be at least 1")


@dataclass(frozen=True)
class TranscriptQualityReview:
    decision: str
    reason_codes: tuple[str, ...]
    text_sha256: str
    language_probability: float | None
    word_count: int
    known_confidence_count: int
    mean_word_confidence: float | None
    min_word_confidence: float | None
    low_confidence_word_count: int
    low_confidence_ratio: float | None
    trailing_text: str
    protected_terms: tuple[str, ...]
    policy: TranscriptQualityPolicy

    @property
    def requires_human_review(self) -> bool:
        return self.decision == "review_required"

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["requires_human_review"] = self.requires_human_review
        payload["policy_version"] = POLICY_VERSION
        return payload


def _normalized_word(value: str) -> str:
    return _WORD_EDGE.sub("", value.strip().casefold())


def _optional_probability(value: object) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    probability = float(value)
    return probability if math.isfinite(probability) else None


def evaluate_transcript_quality(
    payload: dict[str, Any],
    *,
    protected_terms: tuple[str, ...],
    policy: TranscriptQualityPolicy | None = None,
) -> TranscriptQualityReview:
    """Return an auditable decision without rewriting provider output."""

    applied = policy or TranscriptQualityPolicy()
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Transcript quality input is missing text")
    words = parse_scribe_words(payload)
    confidences = tuple(
        word.confidence for word in words if word.confidence is not None
    )
    language_probability = _optional_probability(
        payload.get("language_probability")
    )
    mean_confidence = (
        sum(confidences) / len(confidences) if confidences else None
    )
    min_confidence = min(confidences) if confidences else None
    low_confidence_count = sum(
        value < applied.low_word_confidence for value in confidences
    )
    low_confidence_ratio = (
        low_confidence_count / len(confidences) if confidences else None
    )
    reasons: list[str] = []

    if language_probability is None:
        reasons.append("language_probability_missing")
    elif language_probability < applied.min_language_probability:
        reasons.append("language_probability_below_threshold")

    if mean_confidence is None:
        reasons.append("word_confidence_missing")
    else:
        if mean_confidence < applied.min_mean_word_confidence:
            reasons.append("mean_word_confidence_below_threshold")
        if (
            low_confidence_ratio is not None
            and low_confidence_ratio > applied.max_low_confidence_ratio
        ):
            reasons.append("low_confidence_ratio_above_threshold")

    normalized_terms = {
        _normalized_word(term): term
        for term in protected_terms
        if _normalized_word(term)
    }
    for normalized_term, protected_term in normalized_terms.items():
        if protected_term not in text:
            reasons.append("protected_term_missing")
            continue
        matching_words = tuple(
            word
            for word in words
            if _normalized_word(word.text) == normalized_term
        )
        if any(
            word.confidence is not None
            and word.confidence < applied.protected_term_min_confidence
            for word in matching_words
        ):
            reasons.append("protected_term_confidence_below_threshold")

    trailing_words = words[-applied.trailing_window_size :]
    trailing_text = " ".join(word.text.strip() for word in trailing_words)
    trailing_confidences = tuple(
        word.confidence
        for word in trailing_words
        if word.confidence is not None
    )
    has_ellipsis = bool(re.search(r"(?:\.{3}|…)\s*$", text.strip()))
    last_word = _normalized_word(words[-1].text) if words else ""
    low_trailing_confidence = any(
        value < applied.low_word_confidence
        for value in trailing_confidences
    )
    if has_ellipsis and (
        low_trailing_confidence or last_word in _TRAILING_CONTINUATIONS
    ):
        reasons.append("suspicious_trailing_fragment")
    if words and (
        words[-1].confidence is not None
        and words[-1].confidence < applied.low_word_confidence
    ):
        reasons.append("low_confidence_ending")

    reason_codes = tuple(dict.fromkeys(reasons))
    return TranscriptQualityReview(
        decision="review_required" if reason_codes else "accepted",
        reason_codes=reason_codes,
        text_sha256=hashlib.sha256(text.strip().encode("utf-8")).hexdigest(),
        language_probability=language_probability,
        word_count=len(words),
        known_confidence_count=len(confidences),
        mean_word_confidence=mean_confidence,
        min_word_confidence=min_confidence,
        low_confidence_word_count=low_confidence_count,
        low_confidence_ratio=low_confidence_ratio,
        trailing_text=trailing_text,
        protected_terms=protected_terms,
        policy=applied,
    )


def validated_human_review_text(
    payload: object,
    *,
    original_text_sha256: str,
    protected_terms: tuple[str, ...],
    project_id: str,
    job_id: str,
) -> str:
    """Validate the immutable operator correction used to resume a job."""

    if not isinstance(payload, dict):
        raise ValueError("Transcript human review must be a JSON object")
    if payload.get("record_type") != "transcript_human_review":
        raise ValueError("Transcript human review has the wrong record type")
    if payload.get("decision") != "approved":
        raise ValueError("Transcript human review is not approved")
    if (
        payload.get("project_id") != project_id
        or payload.get("job_id") != job_id
    ):
        raise ValueError("Transcript human review does not match the job")
    if payload.get("original_text_sha256") != original_text_sha256:
        raise ValueError("Transcript human review does not match provider text")
    review_terms = payload.get("protected_terms")
    if (
        not isinstance(review_terms, list)
        or tuple(str(value) for value in review_terms) != protected_terms
    ):
        raise ValueError("Transcript human review changed protected terms")
    corrected_text = payload.get("corrected_text")
    if not isinstance(corrected_text, str):
        raise ValueError("Transcript human review is missing corrected text")
    corrected_text = re.sub(r"\s+", " ", corrected_text).strip()
    if not 1 <= len(corrected_text) <= 1000:
        raise ValueError("Corrected transcript must contain 1 to 1000 characters")
    corrected_hash = hashlib.sha256(corrected_text.encode("utf-8")).hexdigest()
    if payload.get("corrected_text_sha256") != corrected_hash:
        raise ValueError("Corrected transcript hash does not match its text")
    if any(term not in corrected_text for term in protected_terms):
        raise ValueError("Corrected transcript lost a protected term")
    if re.search(r"(?:\.{3}|…)\s*$", corrected_text):
        raise ValueError("Corrected transcript still has a trailing fragment")
    return corrected_text
