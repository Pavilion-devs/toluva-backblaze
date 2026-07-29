"""Offline, protected-term-aware translation wrapped as a Genblaze provider."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path

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

TranslationFunction = Callable[[str, str, str], tuple[str, str, str]]


class ArgosCTranslate2Provider(SyncProvider):
    """Translate one already-segmented text unit with a pinned local model."""

    name = "argos-translate-offline"

    def __init__(
        self,
        *,
        packages_dir: Path,
        output_dir: Path | None = None,
        translate: TranslationFunction | None = None,
    ) -> None:
        super().__init__()
        self._packages_dir = packages_dir.resolve()
        self._output_dir = output_dir
        self._translate = translate or self._translate_local

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.TEXT],
            supported_inputs=["text"],
            output_formats=["application/json"],
            models=["translate-en_de-1_3"],
        )

    def _translate_local(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> tuple[str, str, str]:
        if not self._packages_dir.is_dir():
            raise ProviderError(
                "The offline translation model is not installed.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        model_root = self._packages_dir.parent
        os.environ["ARGOS_PACKAGES_DIR"] = str(self._packages_dir)
        os.environ["XDG_DATA_HOME"] = str(model_root / "data")
        os.environ["XDG_CONFIG_HOME"] = str(model_root / "config")
        os.environ["XDG_CACHE_HOME"] = str(model_root / "cache")
        try:
            import ctranslate2
            from argostranslate import package
        except ImportError as exc:
            raise ProviderError(
                "The offline translation runtime is unavailable.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            ) from exc

        installed = next(
            (
                item
                for item in package.get_installed_packages(
                    path=[self._packages_dir]
                )
                if item.from_code == source_language
                and item.to_code == target_language
            ),
            None,
        )
        if installed is None:
            raise ProviderError(
                f"No offline {source_language}→{target_language} model is installed.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        translator = ctranslate2.Translator(
            str(installed.package_path / "model"),
            device="cpu",
            compute_type="auto",
        )
        result = translator.translate_batch(
            [installed.tokenizer.encode(text)],
            beam_size=4,
            num_hypotheses=1,
            length_penalty=0.2,
            return_scores=True,
        )
        translated = installed.tokenizer.decode(result[0].hypotheses[0]).strip()
        return translated, installed.package_version, installed.package_path.name

    def generate(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> Step:
        source_text = (step.prompt or "").strip()
        if not source_text:
            raise ProviderError(
                "Translation requires non-empty source text.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        source_language = str(step.params.get("source_language", "")).strip()
        target_language = str(step.params.get("target_language", "")).strip()
        if not source_language or not target_language:
            raise ProviderError(
                "Translation requires source_language and target_language.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        raw_terms = step.params.get("protected_terms", ())
        if not isinstance(raw_terms, (list, tuple)):
            raise ProviderError(
                "protected_terms must be a list.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        protected_terms = tuple(str(term) for term in raw_terms)
        try:
            translated, package_version, package_name = self._translate(
                source_text,
                source_language,
                target_language,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                "Offline translation failed.",
                error_code=ProviderErrorCode.UNKNOWN,
            ) from exc
        if not translated:
            raise ProviderError(
                "Offline translation returned empty text.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        missing = tuple(term for term in protected_terms if term not in translated)
        if missing:
            raise ProviderError(
                "Translation did not preserve all protected terms.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )

        payload = {
            "schema_version": "1.0",
            "record_type": "machine_translation",
            "source_language": source_language,
            "target_language": target_language,
            "source_text": source_text,
            "translated_text": translated,
            "protected_terms": list(protected_terms),
            "protected_terms_preserved": True,
            "provider": self.name,
            "model": step.model,
            "model_package": package_name,
            "model_package_version": package_version,
        }
        output_root = self._output_dir or Path(tempfile.gettempdir())
        output_root.mkdir(parents=True, exist_ok=True)
        output_path = output_root / f"{step.step_id}.translation.json"
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
                metadata={
                    "record_type": "machine_translation",
                    "source_language": source_language,
                    "target_language": target_language,
                    "protected_terms_preserved": True,
                },
            )
        )
        step.provider_payload = {
            "model_package": package_name,
            "model_package_version": package_version,
            "protected_terms_preserved": True,
        }
        step.step_type = StepType.CUSTOM
        return step
