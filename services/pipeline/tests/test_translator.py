import json
from pathlib import Path

import pytest
from genblaze_core import Modality, Step
from genblaze_core.exceptions import ProviderError

from toluva_pipeline.providers.translator import ArgosCTranslate2Provider


def test_argos_provider_records_model_and_protected_terms(tmp_path: Path) -> None:
    provider = ArgosCTranslate2Provider(
        packages_dir=tmp_path,
        output_dir=tmp_path,
        translate=lambda text, source, target: (
            "Willkommen bei Toluva.",
            "1.3",
            "translate-en_de-1_3",
        ),
    )
    step = Step(
        provider=provider.name,
        model="translate-en_de-1_3",
        prompt="Welcome to Toluva.",
        modality=Modality.TEXT,
        params={
            "source_language": "en",
            "target_language": "de",
            "protected_terms": ["Toluva"],
        },
    )
    result = provider.generate(step)
    output_path = Path(result.assets[0].url.removeprefix("file://"))
    payload = json.loads(output_path.read_bytes())
    assert payload["translated_text"] == "Willkommen bei Toluva."
    assert payload["protected_terms_preserved"] is True
    assert payload["model_package_version"] == "1.3"


def test_argos_provider_blocks_lost_protected_term(tmp_path: Path) -> None:
    provider = ArgosCTranslate2Provider(
        packages_dir=tmp_path,
        output_dir=tmp_path,
        translate=lambda text, source, target: (
            "Willkommen.",
            "1.3",
            "translate-en_de-1_3",
        ),
    )
    step = Step(
        provider=provider.name,
        model="translate-en_de-1_3",
        prompt="Welcome to Toluva.",
        modality=Modality.TEXT,
        params={
            "source_language": "en",
            "target_language": "de",
            "protected_terms": ["Toluva"],
        },
    )
    with pytest.raises(ProviderError, match="protected"):
        provider.generate(step)
