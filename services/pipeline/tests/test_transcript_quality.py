import hashlib

import pytest
from toluva_pipeline.domain.transcript_quality import (
    TranscriptQualityBlocked,
    TranscriptQualityPolicy,
    evaluate_transcript_quality,
    validated_human_review_text,
)


def payload(
    *,
    text: str = "Welcome to Toluva. One message, many languages.",
    confidences: tuple[float, ...] = (
        0.96,
        0.98,
        0.91,
        0.94,
        0.93,
        0.95,
        0.97,
    ),
    language_probability: float = 0.99,
) -> dict[str, object]:
    tokens = text.split()
    assert len(tokens) == len(confidences)
    return {
        "language_code": "eng",
        "language_probability": language_probability,
        "text": text,
        "words": [
            {
                "text": token,
                "start": index * 0.3,
                "end": index * 0.3 + 0.25,
                "type": "word",
                "speaker_id": "speaker_0",
                "confidence": confidence,
            }
            for index, (token, confidence) in enumerate(
                zip(tokens, confidences, strict=True)
            )
        ],
    }


def test_clear_transcript_passes_before_translation() -> None:
    review = evaluate_transcript_quality(
        payload(),
        protected_terms=("Toluva",),
    )
    assert review.decision == "accepted"
    assert review.reason_codes == ()
    assert review.requires_human_review is False
    assert review.known_confidence_count == 7


def test_fresh_review_record_is_json_shaped_before_storage() -> None:
    review = evaluate_transcript_quality(
        payload(),
        protected_terms=("Toluva",),
    )
    record = review.to_dict()
    assert record["reason_codes"] == []
    assert isinstance(record["reason_codes"], list)
    assert record["protected_terms"] == ["Toluva"]
    assert isinstance(record["protected_terms"], list)


def test_real_trailing_hallucination_requires_review() -> None:
    review = evaluate_transcript_quality(
        payload(
            text=(
                "Welcome to Toluva, One Message, Many Languages "
                "which is..."
            ),
            confidences=(
                0.9028367400169373,
                0.9915321469306946,
                0.4702831022441387,
                0.5236480236053467,
                0.8567492961883545,
                0.8568519353866577,
                0.9742062091827393,
                0.04843417927622795,
                0.5926968678832054,
            ),
            language_probability=1.0,
        ),
        protected_terms=("Toluva",),
    )
    assert review.decision == "review_required"
    assert "suspicious_trailing_fragment" in review.reason_codes
    assert review.trailing_text == "Languages which is..."


def test_low_overall_confidence_requires_review() -> None:
    review = evaluate_transcript_quality(
        payload(confidences=(0.2,) * 7),
        protected_terms=("Toluva",),
    )
    assert "mean_word_confidence_below_threshold" in review.reason_codes
    assert "low_confidence_ratio_above_threshold" in review.reason_codes


def test_uncertain_protected_term_requires_review() -> None:
    review = evaluate_transcript_quality(
        payload(
            confidences=(0.96, 0.98, 0.2, 0.94, 0.93, 0.95, 0.97)
        ),
        protected_terms=("Toluva",),
    )
    assert (
        "protected_term_confidence_below_threshold"
        in review.reason_codes
    )


def test_missing_protected_term_requires_review() -> None:
    review = evaluate_transcript_quality(
        payload(
            text="Welcome to Toluca. One message, many languages.",
        ),
        protected_terms=("Toluva",),
    )
    assert "protected_term_missing" in review.reason_codes


def test_missing_confidence_requires_review() -> None:
    candidate = payload()
    for word in candidate["words"]:  # type: ignore[union-attr]
        word.pop("confidence")  # type: ignore[union-attr]
    review = evaluate_transcript_quality(
        candidate,
        protected_terms=("Toluva",),
    )
    assert review.reason_codes == ("word_confidence_missing",)


def test_policy_rejects_invalid_threshold() -> None:
    with pytest.raises(ValueError, match="between 0 and 1"):
        TranscriptQualityPolicy(min_mean_word_confidence=1.1)


def test_blocked_error_is_a_terminal_job_state() -> None:
    error = TranscriptQualityBlocked(("suspicious_trailing_fragment",))
    assert error.job_state == "blocked"
    assert error.reason_codes == ("suspicious_trailing_fragment",)


def test_human_review_correction_is_hash_bound_and_preserves_terms() -> None:
    corrected = "Welcome to Toluva. One message, many languages."
    original_hash = "a" * 64

    review = {
        "record_type": "transcript_human_review",
        "decision": "approved",
        "project_id": "intake-project",
        "job_id": "localize-job",
        "original_text_sha256": original_hash,
        "protected_terms": ["Toluva"],
        "corrected_text": corrected,
        "corrected_text_sha256": hashlib.sha256(
            corrected.encode("utf-8")
        ).hexdigest(),
    }
    assert (
        validated_human_review_text(
            review,
            original_text_sha256=original_hash,
            protected_terms=("Toluva",),
            project_id="intake-project",
            job_id="localize-job",
        )
        == corrected
    )


def test_human_review_rejects_an_unresolved_trailing_fragment() -> None:
    corrected = "Welcome to Toluva which is..."

    with pytest.raises(ValueError, match="trailing fragment"):
        validated_human_review_text(
            {
                "record_type": "transcript_human_review",
                "decision": "approved",
                "project_id": "intake-project",
                "job_id": "localize-job",
                "original_text_sha256": "a" * 64,
                "protected_terms": ["Toluva"],
                "corrected_text": corrected,
                "corrected_text_sha256": hashlib.sha256(
                    corrected.encode("utf-8")
                ).hexdigest(),
            },
            original_text_sha256="a" * 64,
            protected_terms=("Toluva",),
            project_id="intake-project",
            job_id="localize-job",
        )
