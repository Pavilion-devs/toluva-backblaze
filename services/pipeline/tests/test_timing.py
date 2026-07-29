import pytest

from toluva_pipeline.domain.timing import (
    DriftBand,
    DriftDirection,
    TimingAction,
    TimingPolicy,
    build_expansion_instruction,
    build_shortening_instruction,
    decide_timing_action,
    measure_timing,
)


@pytest.mark.parametrize(
    ("generated", "expected_band"),
    [
        (108.0, DriftBand.GREEN),
        (108.01, DriftBand.AMBER),
        (115.0, DriftBand.AMBER),
        (115.01, DriftBand.RED),
        (92.0, DriftBand.GREEN),
        (84.99, DriftBand.RED),
    ],
)
def test_threshold_boundaries(generated: float, expected_band: DriftBand) -> None:
    measurement = measure_timing(0.0, 100.0, generated)
    assert measurement.band == expected_band


def test_overlong_segment_retries_then_requires_review() -> None:
    measurement = measure_timing(0.0, 10.0, 12.0)
    first = decide_timing_action(measurement, attempt_number=1)
    final = decide_timing_action(measurement, attempt_number=3)
    assert measurement.direction == DriftDirection.OVERLONG
    assert first.action == TimingAction.RETRY_SHORTER
    assert first.retry_number == 2
    assert final.action == TimingAction.HUMAN_REVIEW
    assert final.retry_number is None


def test_modestly_short_segment_uses_silence_padding() -> None:
    measurement = measure_timing(0.0, 10.0, 9.0)
    decision = decide_timing_action(measurement, attempt_number=1)
    assert measurement.band == DriftBand.AMBER
    assert measurement.direction == DriftDirection.UNDERLONG
    assert decision.action == TimingAction.PAD_SILENCE


def test_substantially_short_segment_requests_expansion() -> None:
    measurement = measure_timing(0.0, 10.0, 7.0)
    decision = decide_timing_action(measurement, attempt_number=1)
    assert decision.action == TimingAction.RETRY_EXPANDED


@pytest.mark.parametrize(
    ("start", "end", "generated"),
    [
        (1.0, 1.0, 1.0),
        (2.0, 1.0, 1.0),
        (0.0, 1.0, -0.1),
        (0.0, float("inf"), 1.0),
    ],
)
def test_invalid_durations_are_rejected(
    start: float, end: float, generated: float
) -> None:
    with pytest.raises(ValueError):
        measure_timing(start, end, generated)


def test_policy_validation() -> None:
    with pytest.raises(ValueError):
        TimingPolicy(green_threshold=0.15, amber_threshold=0.08)


def test_shortening_instruction_contains_real_constraints() -> None:
    instruction = build_shortening_instruction(
        text="Willkommen bei Toluva.",
        source_language="English",
        target_language="German",
        current_seconds=6.4,
        target_seconds=5.0,
        protected_terms=("Toluva",),
        retry_number=2,
    )
    assert "6.40s" in instruction
    assert "5.00s" in instruction
    assert "Toluva" in instruction
    assert "Retry 2" in instruction


def test_expansion_instruction_rejects_filler_and_new_claims() -> None:
    instruction = build_expansion_instruction(
        text="Toluva lokalisiert.",
        source_language="English",
        target_language="German",
        current_seconds=3.0,
        target_seconds=4.0,
        protected_terms=("Toluva",),
        retry_number=2,
    )
    assert "naturally fill 4.00s" in instruction
    assert "3.00s" in instruction
    assert "Do not add filler or new claims" in instruction
