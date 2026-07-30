"""Minimal billable red-to-green timing-correction proof."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from genblaze_core import (
    KeyStrategy,
    Manifest,
    Modality,
    ObjectStorageSink,
    Pipeline,
)
from genblaze_core.pipeline.result import PipelineResult
from genblaze_elevenlabs import ElevenLabsTTSProvider
from genblaze_s3 import S3StorageBackend

from toluva_pipeline.domain.authorization import (
    AuthorizationRequest,
    VoiceAuthorization,
    VoiceType,
    authorize_or_raise,
)
from toluva_pipeline.domain.correction import (
    AttemptContext,
    ScriptedTranslationRewriter,
    SpeechArtifact,
    TimingCorrectionEngine,
    TimingCorrectionOutcome,
    TimingCorrectionRequest,
)
from toluva_pipeline.domain.timing import TimingPolicy
from toluva_pipeline.live_tts import DEFAULT_MODEL, DEFAULT_STOCK_VOICE_ID
from toluva_pipeline.media import probe_duration
from toluva_pipeline.settings import Settings
from toluva_pipeline.storage.b2 import (
    CredentialConfigurationError,
    build_b2_storage,
)
from toluva_pipeline.storage.journal import B2CorrectionJournal
from toluva_pipeline.storage.keys import StorageScope, ToluvaObjectKeys
from toluva_pipeline.storage.records import put_immutable

LIVE_PROJECT_ID = "spike-project"
LIVE_JOB_ID = "timing-red-green-v1"
LIVE_SEGMENT_ID = "segment-001"
LIVE_LANGUAGE = "de-DE"
LIVE_TARGET_SECONDS = 3.8
LIVE_INITIAL_TRANSLATION = (
    "Willkommen bei Toluva. Mit unserer Plattform wird eine einzige "
    "Videobotschaft automatisch in vielen verschiedenen Sprachen verfügbar."
)
LIVE_CORRECTED_TRANSLATION = (
    "Willkommen bei Toluva. Eine Botschaft, viele Sprachen."
)


class AssetIntegrityError(RuntimeError):
    """Raised when stored manifest or asset verification fails."""


@dataclass(frozen=True)
class LiveTimingCorrectionReport:
    outcome: TimingCorrectionOutcome
    rewrite_provider: str
    authorization_code: str
    authorization_record_key: str
    authorization_evidence_key: str
    summary_key: str
    live_provider: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class GenblazeElevenLabsAttemptGenerator:
    """Generate one immutable Genblaze run per explicit correction attempt."""

    def __init__(
        self,
        *,
        settings: Settings,
        backend: S3StorageBackend,
        scope: StorageScope,
        keys: ToluvaObjectKeys,
        authorization_id: str,
        authorization_code: str,
        language: str = LIVE_LANGUAGE,
        language_code: str = "de",
        purpose: str = "internal-training",
    ) -> None:
        self._provider = ElevenLabsTTSProvider(api_key=settings.elevenlabs_api_key)
        self._backend = backend
        self._scope = scope
        self._keys = keys
        self._authorization_id = authorization_id
        self._authorization_code = authorization_code
        self._language = language
        self._language_code = language_code
        self._purpose = purpose
        self._results: dict[str, PipelineResult] = {}

    def restore_parent(self, speech: SpeechArtifact) -> None:
        """Rehydrate verified lineage after a worker restart without TTS."""

        if speech.run_id in self._results:
            return
        manifest_bytes = self._backend.get(speech.manifest_key)
        manifest = Manifest.model_validate_json(manifest_bytes)
        audio_bytes = self._backend.get(speech.audio_key)
        audio_sha256 = hashlib.sha256(audio_bytes).hexdigest()
        if (
            not manifest.verify()
            or manifest.canonical_hash != speech.manifest_hash
            or manifest.run.run_id != speech.run_id
            or not any(
                asset.sha256 == audio_sha256
                for step in manifest.run.steps
                for asset in step.assets
            )
        ):
            raise AssetIntegrityError(
                "Stored parent speech lineage failed verification"
            )
        self._results[speech.run_id] = PipelineResult(
            manifest.run,
            manifest,
        )

    def generate(
        self,
        request: TimingCorrectionRequest,
        context: AttemptContext,
    ) -> SpeechArtifact:
        prefix = self._keys.speech_genblaze_prefix(
            self._scope,
            request.segment_id,
            context.attempt_number,
        )
        sink = ObjectStorageSink(
            self._backend,
            prefix=prefix,
            key_strategy=KeyStrategy.HIERARCHICAL,
        )
        local_asset_urls: list[str] = []

        def capture_local_asset(event: object) -> None:
            step_event = getattr(event, "step", None)
            assets = getattr(step_event, "assets", None)
            if assets:
                local_asset_urls.append(assets[0].url)

        pipeline = Pipeline(
            "toluva-live-timing-correction",
            tenant_id="toluva-demo",
            project_id=request.project_id,
        ).metadata(
            job_id=request.job_id,
            segment_id=request.segment_id,
            attempt_number=context.attempt_number,
            parent_run_id=context.parent_run_id,
            idempotency_key=context.idempotency_key,
            correction_action=context.requested_action,
        )
        if context.parent_run_id is not None:
            parent_result = self._results.get(context.parent_run_id)
            if parent_result is None:
                raise RuntimeError("parent Genblaze result is unavailable")
            pipeline.from_result(parent_result)

        result = (
            pipeline.step(
                self._provider,
                model=DEFAULT_MODEL,
                prompt=context.translated_text,
                modality=Modality.AUDIO,
                expected_duration_sec=request.target_seconds,
                metadata={
                    "authorization_id": self._authorization_id,
                    "authorization_code": self._authorization_code,
                    "language": self._language,
                    "purpose": self._purpose,
                    "synthetic_voice": True,
                    "voice_type": VoiceType.STOCK.value,
                    "segment_id": request.segment_id,
                    "attempt_number": context.attempt_number,
                    "idempotency_key": context.idempotency_key,
                },
                voice_id=DEFAULT_STOCK_VOICE_ID,
                language_code=self._language_code,
                with_timestamps=True,
                output_format="mp3_44100_128",
                seed=20260729,
            ).run(
                sink=sink,
                raise_on_failure=True,
                timeout=120,
                pipeline_timeout=180,
                # An ambiguous retry can double-bill this provider. Toluva's
                # correction attempts are explicit, so provider auto-retry is off.
                max_retries=0,
                on_step_complete=capture_local_asset,
            )
        )

        step = result.run.steps[0]
        asset = step.assets[0]
        if not local_asset_urls:
            raise RuntimeError("Genblaze did not expose the local TTS asset")
        local_url = urlparse(local_asset_urls[0])
        if local_url.scheme != "file":
            raise RuntimeError("Expected the ElevenLabs adapter to return a local file")
        local_audio_path = Path(unquote(local_url.path))
        generated_seconds = probe_duration(local_audio_path)

        audio_key = self._backend.key_from_url(asset.url)
        if audio_key is None:
            raise RuntimeError("Could not resolve the stored B2 audio key")
        stored_audio = self._backend.get(audio_key)
        stored_asset_hash_matches = (
            asset.sha256 is not None
            and hashlib.sha256(stored_audio).hexdigest() == asset.sha256
        )
        stored_manifest = sink.read_manifest(result.run, verify=True)
        stored_manifest_valid = stored_manifest.verify()
        stored_manifest_hash_matches = (
            stored_manifest.canonical_hash == result.manifest.canonical_hash
        )
        if not (
            stored_asset_hash_matches
            and stored_manifest_valid
            and stored_manifest_hash_matches
        ):
            raise AssetIntegrityError(
                "Stored Genblaze manifest or asset hash verification failed"
            )

        word_timing_count = (
            len(asset.audio.word_timings)
            if asset.audio is not None and asset.audio.word_timings is not None
            else 0
        )
        self._results[result.run.run_id] = result
        return SpeechArtifact(
            run_id=result.run.run_id,
            parent_run_id=result.run.parent_run_id,
            provider=step.provider,
            model=step.model,
            generated_seconds=generated_seconds,
            audio_key=audio_key,
            manifest_key=sink.manifest_key_for(result.run),
            manifest_hash=result.manifest.canonical_hash,
            word_timing_count=word_timing_count,
            stored_manifest_valid=stored_manifest_valid,
            stored_manifest_hash_matches=stored_manifest_hash_matches,
            stored_asset_hash_matches=stored_asset_hash_matches,
        )


def run_live_timing_correction(
    settings: Settings,
    *,
    job_id: str = LIVE_JOB_ID,
) -> LiveTimingCorrectionReport:
    """Run the reviewed two-attempt red-to-green proof exactly once per job ID."""

    if not settings.elevenlabs_ready:
        raise CredentialConfigurationError("ELEVENLABS_API_KEY is not configured")
    if not settings.b2_ready:
        raise CredentialConfigurationError("Backblaze B2 is not configured")

    now = datetime.now(UTC)
    authorization_valid_from = datetime(2026, 7, 29, tzinfo=UTC)
    authorization_expires_at = datetime(2026, 8, 12, tzinfo=UTC)
    scope = StorageScope(LIVE_PROJECT_ID, job_id, LIVE_LANGUAGE)
    keys = ToluvaObjectKeys(LIVE_PROJECT_ID)
    storage = build_b2_storage(settings, scope, preflight=True)
    journal = B2CorrectionJournal(storage.backend, keys=keys, scope=scope)
    journal.assert_fresh(LIVE_SEGMENT_ID)

    evidence = (
        b"Toluva timing-correction spike approval: use the configured "
        b"ElevenLabs stock voice for a short German internal-training test."
    )
    evidence_sha256 = hashlib.sha256(evidence).hexdigest()
    authorization = VoiceAuthorization(
        authorization_id="auth-stock-timing-v1",
        speaker_id="elevenlabs-stock-voice",
        voice_profile_id=DEFAULT_STOCK_VOICE_ID,
        voice_type=VoiceType.STOCK,
        evidence_asset_id="stock-voice-timing-policy",
        evidence_sha256=evidence_sha256,
        allowed_languages=(LIVE_LANGUAGE,),
        allowed_purposes=("internal-training",),
        valid_from=authorization_valid_from,
        expires_at=authorization_expires_at,
        approved_by="toluva-spike-operator",
        approved_at=authorization_valid_from,
    )
    authorization_decision = authorize_or_raise(
        authorization,
        AuthorizationRequest(
            voice_profile_id=DEFAULT_STOCK_VOICE_ID,
            language=LIVE_LANGUAGE,
            purpose="internal-training",
            requested_at=now,
        ),
    )
    evidence_key = keys.authorization_evidence(
        authorization.authorization_id,
        authorization.evidence_asset_id,
        "txt",
    )
    authorization_key = keys.authorization_record(authorization.authorization_id)
    authorization_record = {
        **asdict(authorization),
        "voice_type": authorization.voice_type.value,
        "valid_from": authorization.valid_from.isoformat(),
        "expires_at": authorization.expires_at.isoformat(),
        "approved_at": authorization.approved_at.isoformat(),
        "revoked_at": None,
        "evidence_key": evidence_key,
        "disclosure": (
            "Synthetic stock voice used for a Toluva timing-correction spike."
        ),
    }
    put_immutable(
        storage.backend,
        evidence_key,
        evidence,
        content_type="text/plain",
    )
    put_immutable(
        storage.backend,
        authorization_key,
        json.dumps(authorization_record, sort_keys=True).encode("utf-8"),
        content_type="application/json",
    )

    request = TimingCorrectionRequest(
        project_id=LIVE_PROJECT_ID,
        job_id=job_id,
        segment_id=LIVE_SEGMENT_ID,
        source_text="Welcome to Toluva. One message, many languages.",
        initial_translation=LIVE_INITIAL_TRANSLATION,
        source_language="English",
        target_language="German",
        target_seconds=LIVE_TARGET_SECONDS,
        protected_terms=("Toluva",),
    )
    rewriter = ScriptedTranslationRewriter(
        (LIVE_CORRECTED_TRANSLATION,),
        name="human-reviewed-scripted-spike",
    )
    generator = GenblazeElevenLabsAttemptGenerator(
        settings=settings,
        backend=storage.backend,
        scope=scope,
        keys=keys,
        authorization_id=authorization.authorization_id,
        authorization_code=authorization_decision.code.value,
    )
    policy = TimingPolicy(
        green_threshold=settings.green_drift_threshold,
        amber_threshold=settings.amber_drift_threshold,
        max_retries=settings.max_timing_retries,
    )
    outcome = TimingCorrectionEngine(
        generator=generator,
        rewriter=rewriter,
        policy=policy,
        journal=journal,
    ).run(request)
    report = LiveTimingCorrectionReport(
        outcome=outcome,
        rewrite_provider=rewriter.name,
        authorization_code=authorization_decision.code.value,
        authorization_record_key=authorization_key,
        authorization_evidence_key=evidence_key,
        summary_key=keys.timing_summary(scope, LIVE_SEGMENT_ID),
        live_provider=True,
    )
    report_bytes = (
        json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    report_dir = (settings.work_dir / "live-timing-correction" / job_id).resolve()
    report_dir.mkdir(parents=True, exist_ok=False)
    (report_dir / "report.json").write_bytes(report_bytes)
    return report
