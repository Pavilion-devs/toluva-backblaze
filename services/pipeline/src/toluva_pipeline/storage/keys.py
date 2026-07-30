"""Human-inspectable, append-only B2 object keys."""

from __future__ import annotations

import re
from dataclasses import dataclass

_OPAQUE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_LANGUAGE_RE = re.compile(r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$")
_EXTENSION_RE = re.compile(r"^[a-z0-9]{1,10}$")


def _opaque_id(value: str, field_name: str) -> str:
    if not _OPAQUE_ID_RE.fullmatch(value):
        raise ValueError(f"{field_name} must be an opaque URL-safe identifier")
    return value


def _language(value: str) -> str:
    normalized = value.strip().casefold().replace("_", "-")
    if not _LANGUAGE_RE.fullmatch(normalized):
        raise ValueError("language must be a BCP-47-like language tag")
    return normalized


def _extension(value: str) -> str:
    normalized = value.strip().casefold().lstrip(".")
    if not _EXTENSION_RE.fullmatch(normalized):
        raise ValueError("extension must contain only lowercase letters or digits")
    return normalized


@dataclass(frozen=True)
class StorageScope:
    project_id: str
    job_id: str
    language: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "project_id", _opaque_id(self.project_id, "project_id"))
        object.__setattr__(self, "job_id", _opaque_id(self.job_id, "job_id"))
        object.__setattr__(self, "language", _language(self.language))

    @property
    def job_prefix(self) -> str:
        return f"projects/{self.project_id}/jobs/{self.job_id}/{self.language}"

    @property
    def genblaze_prefix(self) -> str:
        return f"{self.job_prefix}/genblaze"


@dataclass(frozen=True)
class ToluvaObjectKeys:
    project_id: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "project_id", _opaque_id(self.project_id, "project_id"))

    @property
    def root(self) -> str:
        return f"projects/{self.project_id}"

    def source_master(self, asset_id: str, extension: str) -> str:
        return (
            f"{self.root}/source/master/"
            f"{_opaque_id(asset_id, 'asset_id')}.{_extension(extension)}"
        )

    def source_record(self, asset_id: str) -> str:
        return (
            f"{self.root}/source/records/"
            f"{_opaque_id(asset_id, 'asset_id')}.json"
        )

    def transcript(self, version: str = "v1") -> str:
        return f"{self.root}/source/transcript/{_opaque_id(version, 'version')}.json"

    def segments(self, version: str = "v1") -> str:
        return f"{self.root}/source/segments/{_opaque_id(version, 'version')}.json"

    def transcription_genblaze_prefix(self, version: str = "v1") -> str:
        return (
            f"{self.root}/source/transcription/"
            f"{_opaque_id(version, 'version')}/genblaze"
        )

    def authorization_record(self, authorization_id: str) -> str:
        authorization_id = _opaque_id(authorization_id, "authorization_id")
        return f"{self.root}/authorizations/{authorization_id}/record.json"

    def authorization_evidence(
        self,
        authorization_id: str,
        asset_id: str,
        extension: str,
    ) -> str:
        authorization_id = _opaque_id(authorization_id, "authorization_id")
        asset_id = _opaque_id(asset_id, "asset_id")
        return (
            f"{self.root}/authorizations/{authorization_id}/evidence/"
            f"{asset_id}.{_extension(extension)}"
        )

    def translation_attempt(
        self,
        scope: StorageScope,
        segment_id: str,
        attempt_number: int,
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/translations/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"attempt-{self._attempt(attempt_number)}.json"
        )

    def translation_genblaze_prefix(
        self,
        scope: StorageScope,
        segment_id: str,
        version: str = "v1",
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/translations/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"{_opaque_id(version, 'version')}/genblaze"
        )

    def speech_attempt(
        self,
        scope: StorageScope,
        segment_id: str,
        attempt_number: int,
        extension: str,
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/speech/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"attempt-{self._attempt(attempt_number)}.{_extension(extension)}"
        )

    def speech_genblaze_prefix(
        self,
        scope: StorageScope,
        segment_id: str,
        attempt_number: int,
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/speech/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"attempt-{self._attempt(attempt_number)}/genblaze"
        )

    def timing_attempt(
        self,
        scope: StorageScope,
        segment_id: str,
        attempt_number: int,
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/qa/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"attempt-{self._attempt(attempt_number)}.json"
        )

    def timing_summary(self, scope: StorageScope, segment_id: str) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/qa/"
            f"{_opaque_id(segment_id, 'segment_id')}/summary.json"
        )

    def transcript_quality(
        self,
        scope: StorageScope,
        version: str = "v1",
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/qa/transcript/"
            f"{_opaque_id(version, 'version')}.json"
        )

    def transcript_human_review(
        self,
        scope: StorageScope,
        version: str = "v1",
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/qa/transcript/"
            f"{_opaque_id(version, 'version')}-human-review.json"
        )

    def captions(
        self,
        scope: StorageScope,
        version: str = "v1",
        extension: str = "vtt",
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/captions/"
            f"{_opaque_id(version, 'version')}.{_extension(extension)}"
        )

    def composition_genblaze_prefix(
        self,
        scope: StorageScope,
        version: str = "v1",
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/composition/"
            f"{_opaque_id(version, 'version')}/genblaze"
        )

    def final_record(self, scope: StorageScope, version: str = "v1") -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/final/"
            f"{_opaque_id(version, 'version')}.json"
        )

    def attempt_failure(
        self,
        scope: StorageScope,
        segment_id: str,
        attempt_number: int,
        stage: str,
    ) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/failures/"
            f"{_opaque_id(segment_id, 'segment_id')}/"
            f"attempt-{self._attempt(attempt_number)}-"
            f"{_opaque_id(stage, 'stage')}.json"
        )

    def disclosure(self, scope: StorageScope, version: str = "v1") -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/disclosure/"
            f"{_opaque_id(version, 'version')}.json"
        )

    def queue_request(self, scope: StorageScope) -> str:
        self._assert_scope(scope)
        return f"{scope.job_prefix}/queue/request.json"

    def status_event(
        self,
        scope: StorageScope,
        sequence: int,
        stage: str,
    ) -> str:
        self._assert_scope(scope)
        if sequence < 1 or sequence > 99:
            raise ValueError("status event sequence must be between 1 and 99")
        return (
            f"{scope.job_prefix}/status/{sequence:02d}-"
            f"{_opaque_id(stage, 'stage')}.json"
        )

    def status_prefix(self, scope: StorageScope) -> str:
        self._assert_scope(scope)
        return f"{scope.job_prefix}/status/"

    def stage_intent(self, scope: StorageScope, stage: str) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/checkpoints/"
            f"{_opaque_id(stage, 'stage')}/intent.json"
        )

    def stage_completion(self, scope: StorageScope, stage: str) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/checkpoints/"
            f"{_opaque_id(stage, 'stage')}/completed.json"
        )

    def stage_failure(self, scope: StorageScope, stage: str) -> str:
        self._assert_scope(scope)
        return (
            f"{scope.job_prefix}/checkpoints/"
            f"{_opaque_id(stage, 'stage')}/failure.json"
        )

    def _assert_scope(self, scope: StorageScope) -> None:
        if scope.project_id != self.project_id:
            raise ValueError("storage scope belongs to a different project")

    @staticmethod
    def _attempt(attempt_number: int) -> str:
        if attempt_number < 1:
            raise ValueError("attempt_number must be at least 1")
        return str(attempt_number)
