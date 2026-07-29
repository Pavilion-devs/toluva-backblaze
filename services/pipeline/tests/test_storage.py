import pytest

from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys


def test_attempt_keys_are_append_only_and_human_inspectable() -> None:
    keys = ToluvaObjectKeys("project-01")
    scope = StorageScope("project-01", "job-07", "DE_de")
    first = keys.speech_attempt(scope, "segment-03", 1, ".mp3")
    second = keys.speech_attempt(scope, "segment-03", 2, "mp3")
    assert first == (
        "projects/project-01/jobs/job-07/de-de/"
        "speech/segment-03/attempt-1.mp3"
    )
    assert second.endswith("/attempt-2.mp3")
    assert first != second
    assert scope.genblaze_prefix.endswith("/de-de/genblaze")


def test_scope_cannot_cross_projects() -> None:
    keys = ToluvaObjectKeys("project-01")
    scope = StorageScope("project-02", "job-07", "de-DE")
    with pytest.raises(ValueError, match="different project"):
        keys.translation_attempt(scope, "segment-03", 1)


@pytest.mark.parametrize("unsafe_id", ["../escape", "space here", "", "/root"])
def test_unsafe_identifiers_are_rejected(unsafe_id: str) -> None:
    with pytest.raises(ValueError):
        ToluvaObjectKeys(unsafe_id)
