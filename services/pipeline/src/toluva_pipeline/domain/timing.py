"""Objective timing-drift measurement and bounded correction policy."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum


class DriftBand(StrEnum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


class DriftDirection(StrEnum):
    UNDERLONG = "underlong"
    FIT = "fit"
    OVERLONG = "overlong"


class TimingAction(StrEnum):
    ACCEPT = "accept"
    RETRY_SHORTER = "retry_shorter"
    RETRY_EXPANDED = "retry_expanded"
    PAD_SILENCE = "pad_silence"
    HUMAN_REVIEW = "human_review"


@dataclass(frozen=True)
class TimingPolicy:
    green_threshold: float = 0.08
    amber_threshold: float = 0.15
    max_retries: int = 2

    def __post_init__(self) -> None:
        if not 0 <= self.green_threshold < self.amber_threshold:
            raise ValueError("thresholds must satisfy 0 <= green < amber")
        if self.max_retries < 0:
            raise ValueError("max_retries must be non-negative")


@dataclass(frozen=True)
class TimingMeasurement:
    slot_seconds: float
    generated_seconds: float
    drift_seconds: float
    drift_ratio: float
    absolute_drift_ratio: float
    band: DriftBand
    direction: DriftDirection


@dataclass(frozen=True)
class TimingDecision:
    measurement: TimingMeasurement
    action: TimingAction
    reason: str
    retry_number: int | None = None


def measure_timing(
    source_start_seconds: float,
    source_end_seconds: float,
    generated_seconds: float,
    *,
    policy: TimingPolicy | None = None,
) -> TimingMeasurement:
    policy = policy or TimingPolicy()
    values = (source_start_seconds, source_end_seconds, generated_seconds)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("timing values must be finite")
    slot_seconds = source_end_seconds - source_start_seconds
    if slot_seconds <= 0:
        raise ValueError("source_end_seconds must be greater than source_start_seconds")
    if generated_seconds < 0:
        raise ValueError("generated_seconds must be non-negative")

    drift_seconds = generated_seconds - slot_seconds
    drift_ratio = drift_seconds / slot_seconds
    absolute_drift_ratio = abs(drift_ratio)
    if absolute_drift_ratio <= policy.green_threshold:
        band = DriftBand.GREEN
    elif absolute_drift_ratio <= policy.amber_threshold:
        band = DriftBand.AMBER
    else:
        band = DriftBand.RED

    if drift_seconds > 0:
        direction = DriftDirection.OVERLONG
    elif drift_seconds < 0:
        direction = DriftDirection.UNDERLONG
    else:
        direction = DriftDirection.FIT

    return TimingMeasurement(
        slot_seconds=slot_seconds,
        generated_seconds=generated_seconds,
        drift_seconds=drift_seconds,
        drift_ratio=drift_ratio,
        absolute_drift_ratio=absolute_drift_ratio,
        band=band,
        direction=direction,
    )


def decide_timing_action(
    measurement: TimingMeasurement,
    *,
    attempt_number: int,
    policy: TimingPolicy | None = None,
) -> TimingDecision:
    """Select a deterministic action for a 1-based attempt number."""

    policy = policy or TimingPolicy()
    if attempt_number < 1:
        raise ValueError("attempt_number must be at least 1")

    if measurement.band == DriftBand.GREEN:
        return TimingDecision(
            measurement,
            TimingAction.ACCEPT,
            "Generated speech fits inside the green timing threshold.",
        )

    retries_used = attempt_number - 1
    retries_available = retries_used < policy.max_retries
    next_retry = attempt_number + 1 if retries_available else None

    if measurement.direction == DriftDirection.OVERLONG:
        if retries_available:
            return TimingDecision(
                measurement,
                TimingAction.RETRY_SHORTER,
                "Speech overruns the slot; preserve meaning and protected terms while shortening.",
                next_retry,
            )
        return TimingDecision(
            measurement,
            TimingAction.HUMAN_REVIEW,
            "Speech still overruns the slot after the bounded retry budget.",
        )

    if measurement.band == DriftBand.AMBER:
        return TimingDecision(
            measurement,
            TimingAction.PAD_SILENCE,
            "Speech is modestly short; preserve natural delivery and pad the remaining gap.",
        )
    if retries_available:
        return TimingDecision(
            measurement,
            TimingAction.RETRY_EXPANDED,
            "Speech is substantially short; request a measured expansion without filler.",
            next_retry,
        )
    return TimingDecision(
        measurement,
        TimingAction.HUMAN_REVIEW,
        "Speech remains substantially short after the bounded retry budget.",
    )


def build_shortening_instruction(
    *,
    text: str,
    source_language: str,
    target_language: str,
    current_seconds: float,
    target_seconds: float,
    protected_terms: tuple[str, ...] = (),
    retry_number: int,
) -> str:
    if target_seconds <= 0 or current_seconds <= 0:
        raise ValueError("current_seconds and target_seconds must be positive")
    protected = ", ".join(protected_terms) if protected_terms else "None"
    return (
        f"Rewrite this {target_language} translation to fit {target_seconds:.2f}s "
        f"instead of {current_seconds:.2f}s. Preserve the complete meaning of the "
        f"{source_language} source and keep protected terms exact or use their "
        f"approved equivalents. Do not add new claims. Retry {retry_number}. "
        f"Protected terms: {protected}. Translation: {text}"
    )


def build_expansion_instruction(
    *,
    text: str,
    source_language: str,
    target_language: str,
    current_seconds: float,
    target_seconds: float,
    protected_terms: tuple[str, ...] = (),
    retry_number: int,
) -> str:
    if target_seconds <= 0 or current_seconds <= 0:
        raise ValueError("current_seconds and target_seconds must be positive")
    protected = ", ".join(protected_terms) if protected_terms else "None"
    return (
        f"Rewrite this {target_language} translation to naturally fill "
        f"{target_seconds:.2f}s instead of {current_seconds:.2f}s. Preserve the "
        f"complete meaning of the {source_language} source and keep protected "
        f"terms exact or use their approved equivalents. Do not add filler or "
        f"new claims. Retry {retry_number}. Protected terms: {protected}. "
        f"Translation: {text}"
    )
