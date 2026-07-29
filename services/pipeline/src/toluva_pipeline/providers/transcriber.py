"""ElevenLabs Scribe wrapped as a narrow Genblaze text provider."""

from __future__ import annotations

import hashlib
import json
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
from genblaze_core import (
    Asset,
    Modality,
    ProviderCapabilities,
    Step,
    StepType,
    SyncProvider,
)
from genblaze_core._utils import local_file_url
from genblaze_core.exceptions import ProviderError
from genblaze_core.models.enums import ProviderErrorCode
from genblaze_core.runnable.config import RunnableConfig

SCRIBE_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text"
ScribeRequest = Callable[
    [Path, str, str | None, tuple[str, ...], float],
    dict[str, Any],
]
LocalWhisperRequest = Callable[
    [Path, tuple[str, ...]],
    dict[str, Any],
]


def _local_media_path(step: Step) -> tuple[Asset, Path]:
    source = next(
        (
            asset
            for asset in step.inputs
            if asset.media_type.startswith(("audio/", "video/"))
        ),
        None,
    )
    if source is None:
        raise ProviderError(
            "Scribe requires one audio or video input.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    parsed = urlparse(source.url)
    if parsed.scheme != "file":
        raise ProviderError(
            "Scribe input must be materialized as a local worker file.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    path = Path(unquote(parsed.path)).resolve()
    if not path.is_file():
        raise ProviderError(
            "Scribe input file is unavailable.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    return source, path


class ElevenLabsScribeProvider(SyncProvider):
    """Generate a timestamped JSON transcript through Scribe v2."""

    name = "elevenlabs-scribe"

    def __init__(
        self,
        *,
        api_key: str,
        output_dir: Path | None = None,
        timeout: float = 120,
        request: ScribeRequest | None = None,
    ) -> None:
        super().__init__()
        if not api_key.strip():
            raise ValueError("api_key must not be empty")
        self._api_key = api_key
        self._output_dir = output_dir
        self._timeout = timeout
        self._request = request or self._request_scribe

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.TEXT],
            supported_inputs=["audio", "video"],
            accepts_chain_input=True,
            output_formats=["application/json"],
            models=["scribe_v2"],
        )

    def _request_scribe(
        self,
        path: Path,
        model: str,
        language_code: str | None,
        keyterms: tuple[str, ...],
        timeout: float,
    ) -> dict[str, Any]:
        data: dict[str, object] = {
            "model_id": model,
            "tag_audio_events": "false",
            "diarize": "false",
            "no_verbatim": "true",
            "timestamps_granularity": "word",
            "seed": "20260729",
        }
        if language_code:
            data["language_code"] = language_code
        if keyterms:
            data["keyterms"] = list(keyterms)
        try:
            with path.open("rb") as source_file:
                response = httpx.post(
                    SCRIBE_ENDPOINT,
                    headers={"xi-api-key": self._api_key},
                    data=data,
                    files={
                        "file": (
                            path.name,
                            source_file,
                            "application/octet-stream",
                        )
                    },
                    timeout=timeout,
                )
        except httpx.TimeoutException as exc:
            raise ProviderError(
                "Scribe transcription exceeded its bounded timeout.",
                error_code=ProviderErrorCode.TIMEOUT,
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                "Scribe transcription request failed.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            ) from exc
        if response.status_code in (401, 403):
            code = ProviderErrorCode.AUTH_FAILURE
        elif response.status_code == 429:
            code = ProviderErrorCode.RATE_LIMIT
        elif 400 <= response.status_code < 500:
            code = ProviderErrorCode.INVALID_INPUT
        elif response.status_code >= 500:
            code = ProviderErrorCode.SERVER_ERROR
        else:
            code = None
        if code is not None:
            raise ProviderError(
                f"Scribe transcription failed with HTTP {response.status_code}.",
                error_code=code,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError(
                "Scribe returned an invalid JSON response.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            ) from exc
        if not isinstance(payload, dict):
            raise ProviderError(
                "Scribe returned an unexpected response shape.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            )
        return payload

    def generate(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> Step:
        source, path = _local_media_path(step)
        language_code = step.params.get("language_code")
        if language_code is not None and not isinstance(language_code, str):
            raise ProviderError(
                "language_code must be a string.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        raw_keyterms = step.params.get("keyterms", ())
        if not isinstance(raw_keyterms, (list, tuple)):
            raise ProviderError(
                "keyterms must be a list.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        keyterms = tuple(str(term).strip() for term in raw_keyterms)
        if any(not term or len(term) >= 50 for term in keyterms):
            raise ProviderError(
                "Each keyterm must contain between 1 and 49 characters.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        payload = self._request(
            path,
            step.model,
            language_code,
            keyterms,
            self._timeout,
        )
        if not isinstance(payload.get("text"), str) or not payload["text"].strip():
            raise ProviderError(
                "Scribe returned an empty transcript.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            )
        if not isinstance(payload.get("words"), list) or not payload["words"]:
            raise ProviderError(
                "Scribe returned no word timestamps.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            )

        output_root = self._output_dir or Path(tempfile.gettempdir())
        output_root.mkdir(parents=True, exist_ok=True)
        output_path = output_root / f"{step.step_id}.scribe.json"
        output_bytes = (
            json.dumps(payload, indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        output_path.write_bytes(output_bytes)
        step.assets.append(
            Asset(
                url=local_file_url(output_path.resolve()),
                media_type="application/json",
                sha256=hashlib.sha256(output_bytes).hexdigest(),
                size_bytes=len(output_bytes),
                duration=source.duration,
                metadata={
                    "record_type": "timestamped_transcript",
                    "source_asset_sha256": source.sha256,
                    "detected_language": payload.get("language_code"),
                    "word_count": len(payload["words"]),
                },
            )
        )
        step.provider_payload = {
            "detected_language": payload.get("language_code"),
            "language_probability": payload.get("language_probability"),
            "word_count": len(payload["words"]),
        }
        step.step_type = StepType.CUSTOM
        return step


class FasterWhisperProvider(SyncProvider):
    """Generate real word timestamps with a pinned, local Whisper model."""

    name = "faster-whisper-local"

    def __init__(
        self,
        *,
        model_dir: Path,
        model_revision: str,
        output_dir: Path | None = None,
        transcribe: LocalWhisperRequest | None = None,
    ) -> None:
        super().__init__()
        self._model_dir = model_dir.resolve()
        self._model_revision = model_revision
        self._output_dir = output_dir
        self._transcribe = transcribe or self._transcribe_local

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.TEXT],
            supported_inputs=["audio", "video"],
            accepts_chain_input=True,
            output_formats=["application/json"],
            models=["whisper-tiny-en", "whisper-base-en"],
        )

    def _transcribe_local(
        self,
        path: Path,
        keyterms: tuple[str, ...],
    ) -> dict[str, Any]:
        if not (self._model_dir / "model.bin").is_file():
            raise ProviderError(
                "The pinned local Whisper model is not installed.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise ProviderError(
                "The local Whisper runtime is unavailable.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            ) from exc
        try:
            model = WhisperModel(
                str(self._model_dir),
                device="cpu",
                compute_type="int8",
                cpu_threads=4,
                local_files_only=True,
            )
            segments, info = model.transcribe(
                str(path),
                language="en",
                beam_size=5,
                word_timestamps=True,
                condition_on_previous_text=False,
                vad_filter=False,
                hotwords=", ".join(keyterms) or None,
                initial_prompt=", ".join(keyterms) or None,
            )
            materialized = list(segments)
        except Exception as exc:
            raise ProviderError(
                "Local Whisper transcription failed.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            ) from exc

        words: list[dict[str, object]] = []
        text_parts: list[str] = []
        for segment in materialized:
            segment_text = str(segment.text).strip()
            if segment_text:
                text_parts.append(segment_text)
            for word in segment.words or ():
                token = str(word.word).strip()
                if not token:
                    continue
                words.append(
                    {
                        "text": token,
                        "start": float(word.start),
                        "end": float(word.end),
                        "type": "word",
                        "speaker_id": "speaker_0",
                        "confidence": float(word.probability),
                    }
                )
        return {
            "language_code": "eng",
            "language_probability": float(info.language_probability),
            "text": " ".join(text_parts).strip(),
            "words": words,
            "model_revision": self._model_revision,
        }

    def generate(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> Step:
        source, path = _local_media_path(step)
        raw_keyterms = step.params.get("keyterms", ())
        if not isinstance(raw_keyterms, (list, tuple)):
            raise ProviderError(
                "keyterms must be a list.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        keyterms = tuple(str(term).strip() for term in raw_keyterms)
        if any(not term for term in keyterms):
            raise ProviderError(
                "keyterms must not contain empty values.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        payload = self._transcribe(path, keyterms)
        if not isinstance(payload.get("text"), str) or not payload["text"].strip():
            raise ProviderError(
                "Local Whisper returned an empty transcript.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        if not isinstance(payload.get("words"), list) or not payload["words"]:
            raise ProviderError(
                "Local Whisper returned no word timestamps.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        output_root = self._output_dir or Path(tempfile.gettempdir())
        output_root.mkdir(parents=True, exist_ok=True)
        output_path = output_root / f"{step.step_id}.whisper.json"
        output_bytes = (
            json.dumps(payload, indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        output_path.write_bytes(output_bytes)
        model_hash = hashlib.sha256(
            (self._model_dir / "model.bin").read_bytes()
        ).hexdigest()
        step.model_hash = model_hash
        step.model_version = self._model_revision
        step.assets.append(
            Asset(
                url=local_file_url(output_path.resolve()),
                media_type="application/json",
                sha256=hashlib.sha256(output_bytes).hexdigest(),
                size_bytes=len(output_bytes),
                duration=source.duration,
                metadata={
                    "record_type": "timestamped_transcript",
                    "source_asset_sha256": source.sha256,
                    "detected_language": payload.get("language_code"),
                    "word_count": len(payload["words"]),
                    "model_revision": self._model_revision,
                    "model_hash": model_hash,
                },
            )
        )
        step.provider_payload = {
            "detected_language": payload.get("language_code"),
            "language_probability": payload.get("language_probability"),
            "word_count": len(payload["words"]),
            "model_revision": self._model_revision,
        }
        step.step_type = StepType.CUSTOM
        return step
