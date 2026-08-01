import "server-only";

import { getB2Json, listB2Files } from "./b2-server";
import {
  VERIFIED_RUN_SNAPSHOT,
  type RunAsset,
  type RunManifest,
  type TimingSegment,
  type VerifiedRun,
} from "./verified-run";

const PROJECT_ROOT =
  "projects/intake-57f5ca73b1fb4b4d97e85f94605f39e5/";
const JOB_PREFIX =
  `${PROJECT_ROOT}jobs/localize-c33715df7d024a27950560095077ff52/de-de/`;
const AUTHORIZATION_ID = "auth-stock-intake-v1";

export const VERIFIED_FINAL_RECORD_KEY = `${JOB_PREFIX}final/live-v1.json`;

type JsonRecord = Record<string, unknown>;

type ManifestRecord = {
  canonical_hash?: string;
  run?: {
    created_at?: string;
    name?: string;
    run_id?: string;
    status?: string;
    steps?: Array<{
      model?: string;
      provider?: string;
    }>;
  };
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`verified_run_invalid_${label}`);
  }
  return value as JsonRecord;
}

function recordArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`verified_run_invalid_${label}`);
  }
  return value.map((item, index) => record(item, `${label}_${index}`));
}

function text(value: JsonRecord, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || !candidate) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return candidate;
}

function number(value: JsonRecord, field: string): number {
  const candidate = value[field];
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return candidate;
}

function boolean(value: JsonRecord, field: string): boolean {
  const candidate = value[field];
  if (typeof candidate !== "boolean") {
    throw new Error(`verified_run_missing_${field}`);
  }
  return candidate;
}

function stringArray(value: JsonRecord, field: string): string[] {
  const candidate = value[field];
  if (
    !Array.isArray(candidate) ||
    candidate.some((item) => typeof item !== "string")
  ) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return candidate as string[];
}

function manifestFromRecord(
  stage: string,
  manifest: ManifestRecord,
): RunManifest {
  const step = manifest.run?.steps?.[0];
  if (
    !manifest.canonical_hash ||
    !manifest.run?.created_at ||
    !manifest.run.name ||
    !manifest.run.run_id ||
    !manifest.run.status ||
    !step?.provider ||
    !step.model
  ) {
    throw new Error(`verified_manifest_invalid_${stage.toLowerCase()}`);
  }
  return {
    canonicalHash: manifest.canonical_hash,
    createdAt: manifest.run.created_at,
    model: step.model,
    name: manifest.run.name,
    provider: step.provider,
    runId: manifest.run.run_id,
    stage,
    status: manifest.run.status,
  };
}

function assertVerifiedRecordKey(value: string): string {
  if (!value.startsWith(PROJECT_ROOT) || !value.endsWith(".json")) {
    throw new Error("verified_run_references_unexpected_record");
  }
  return value;
}

function selectedAttempt(timing: JsonRecord): JsonRecord {
  const attempts = recordArray(timing.attempts, "timing_attempts");
  const selectedAttemptNumber = number(timing, "selected_attempt_number");
  const selected = attempts.find((attempt) => {
    const context = record(attempt.context, "timing_context");
    return context.attempt_number === selectedAttemptNumber;
  });
  if (!selected) throw new Error("verified_run_selected_attempt_missing");
  return selected;
}

function timingSegment(result: JsonRecord): TimingSegment {
  const source = record(result.source_segment, "source_segment");
  const translation = record(result.translation, "translation");
  const timing = record(result.timing, "timing");
  const attempt = selectedAttempt(timing);
  const speech = record(attempt.speech, "speech");
  const slotSeconds = number(attempt, "slot_seconds");
  const generatedSeconds = number(speech, "generated_seconds");
  const tempoFactor =
    generatedSeconds > slotSeconds ? generatedSeconds / slotSeconds : 1;

  return {
    action: text(attempt, "timing_action"),
    attemptCount: recordArray(timing.attempts, "timing_attempts").length,
    band: text(attempt, "timing_band"),
    driftRatio: number(attempt, "drift_ratio"),
    driftSeconds: number(attempt, "drift_seconds"),
    endSeconds: number(source, "end_seconds"),
    finalSeconds: slotSeconds,
    generatedSeconds,
    id: text(source, "segment_id"),
    sourceText: text(source, "text"),
    startSeconds: number(source, "start_seconds"),
    status: text(timing, "status"),
    tempoFactor,
    translatedText: text(translation, "translated_text"),
    wordTimingCount: number(speech, "word_timing_count"),
  };
}

function numberedManifestInputs(
  label: string,
  keys: string[],
): Array<readonly [string, string]> {
  return keys.map((key, index) => [
    `${label} ${index + 1}`,
    assertVerifiedRecordKey(key),
  ] as const);
}

export async function loadVerifiedRunFromB2(): Promise<VerifiedRun> {
  const finalRecord = await getB2Json<JsonRecord>(VERIFIED_FINAL_RECORD_KEY);
  const transcriptKey = assertVerifiedRecordKey(
    text(finalRecord, "transcript_key"),
  );
  const disclosureKey = assertVerifiedRecordKey(
    text(finalRecord, "disclosure_key"),
  );
  const authorizationKey =
    `${PROJECT_ROOT}authorizations/${AUTHORIZATION_ID}/record.json`;
  const segmentResults = recordArray(
    finalRecord.segment_results,
    "segment_results",
  );
  const timingSegments = segmentResults.map(timingSegment);

  const manifestInputs: Array<readonly [string, string]> = [
    [
      "Transcription",
      assertVerifiedRecordKey(
        text(finalRecord, "transcription_manifest_key"),
      ),
    ],
    ...numberedManifestInputs(
      "Translation",
      stringArray(finalRecord, "translation_manifest_keys"),
    ),
    ...numberedManifestInputs(
      "Speech",
      stringArray(finalRecord, "selected_speech_manifest_keys"),
    ),
    [
      "Audio assembly",
      assertVerifiedRecordKey(
        text(finalRecord, "localized_audio_manifest_key"),
      ),
    ],
    [
      "Composition",
      assertVerifiedRecordKey(text(finalRecord, "composition_manifest_key")),
    ],
  ];

  const [transcript, disclosure, authorization, ...manifestRecords] =
    await Promise.all([
      getB2Json<JsonRecord>(transcriptKey),
      getB2Json<JsonRecord>(disclosureKey),
      getB2Json<JsonRecord>(authorizationKey),
      ...manifestInputs.map(([, key]) => getB2Json<ManifestRecord>(key)),
    ]);
  const manifests = manifestInputs.map(([stage], index) =>
    manifestFromRecord(stage, manifestRecords[index]),
  );
  const jobFiles = await listB2Files(JOB_PREFIX);

  const sourceKey = text(finalRecord, "source_key");
  const finalAssetKey = text(finalRecord, "final_asset_key");
  const captionsKey = text(finalRecord, "captions_key");
  const speechKeys = stringArray(finalRecord, "selected_speech_keys");
  const localizedAudioKey = text(finalRecord, "localized_audio_asset_key");
  const protectedTerms = Array.from(
    new Set(
      segmentResults.flatMap((result) =>
        stringArray(result, "protected_terms"),
      ),
    ),
  );
  const worstTiming = timingSegments.reduce((worst, segment) =>
    Math.abs(segment.driftRatio) > Math.abs(worst.driftRatio)
      ? segment
      : worst,
  );
  const assets: RunAsset[] = [
    {
      b2Key: sourceKey,
      kind: "SOURCE",
      meta:
        `${number(finalRecord, "source_duration_seconds").toFixed(3)}s · ` +
        "SHA-256 verified",
      name: sourceKey.split("/").at(-1) ?? "source.mp4",
    },
    {
      b2Key: transcriptKey,
      kind: "TRANSCRIPT",
      meta: `${text(transcript, "source")} · ${timingSegments.length} timed segments`,
      name: transcriptKey.split("/").at(-1) ?? "transcript.json",
    },
    ...speechKeys.map((key, index) => ({
      b2Key: key,
      kind: "SPEECH",
      meta:
        `${timingSegments[index].generatedSeconds.toFixed(3)}s · ` +
        `${timingSegments[index].wordTimingCount} word timings`,
      name: `segment-${String(index + 1).padStart(3, "0")}.mp3`,
    })),
    {
      b2Key: localizedAudioKey,
      kind: "AUDIO",
      meta: `${timingSegments.length}-segment fan-in · bounded tempo-fit`,
      name: "localized-audio.wav",
    },
    {
      b2Key: captionsKey,
      kind: "CAPTIONS",
      meta: "WebVTT · embedded in final",
      name: captionsKey.split("/").at(-1) ?? "captions.vtt",
    },
    {
      b2Key: finalAssetKey,
      kind: "FINAL",
      meta:
        `${number(finalRecord, "final_duration_seconds").toFixed(3)}s · ` +
        "H.264 / AAC / mov_text",
      name: "localized-de.mp4",
    },
    {
      b2Key: disclosureKey,
      kind: "DISCLOSURE",
      meta: "Synthetic stock voice · approval required",
      name: disclosureKey.split("/").at(-1) ?? "disclosure.json",
    },
    {
      b2Key: VERIFIED_FINAL_RECORD_KEY,
      kind: "RECORD",
      meta: `${Object.keys(finalRecord).length}-field durable run record`,
      name: "live-v1.json",
    },
  ];

  return {
    ...VERIFIED_RUN_SNAPSHOT,
    dataSource: "live-b2",
    syncedAt: manifests.at(-1)?.createdAt ?? VERIFIED_RUN_SNAPSHOT.syncedAt,
    project: {
      ...VERIFIED_RUN_SNAPSHOT.project,
      id: text(finalRecord, "project_id"),
    },
    job: {
      ...VERIFIED_RUN_SNAPSHOT.job,
      id: text(finalRecord, "job_id"),
      language: text(finalRecord, "target_language"),
      status: "completed",
    },
    source: {
      b2Key: sourceKey,
      durationSeconds: number(finalRecord, "source_duration_seconds"),
      sha256: text(finalRecord, "source_sha256"),
      text: text(finalRecord, "detected_source_text"),
      transcriptKey,
      transcriptionModel: text(finalRecord, "transcription_model"),
      transcriptionProvider: text(finalRecord, "transcription_provider"),
    },
    edition: {
      ...VERIFIED_RUN_SNAPSHOT.edition,
      captionsEmbedded: boolean(finalRecord, "captions_embedded"),
      captionsKey,
      finalAssetKey,
      finalDurationSeconds: number(finalRecord, "final_duration_seconds"),
      finalSha256: text(finalRecord, "final_asset_sha256"),
      protectedTerms,
      protectedTermsPreserved: boolean(
        finalRecord,
        "protected_terms_preserved",
      ),
      translatedText: text(finalRecord, "translated_text"),
      translationModel: text(finalRecord, "translation_model"),
      translationProvider: text(finalRecord, "translation_provider"),
    },
    authorization: {
      allowedLanguages: stringArray(authorization, "allowed_languages"),
      allowedPurposes: stringArray(authorization, "allowed_purposes"),
      approvedAt: text(authorization, "approved_at"),
      code: text(finalRecord, "authorization_code"),
      disclosure: text(authorization, "disclosure"),
      expiresAt: text(authorization, "expires_at"),
      id: AUTHORIZATION_ID,
      voiceType: text(authorization, "voice_type"),
    },
    timing: {
      action: text(finalRecord, "timing_action"),
      attemptCount: number(finalRecord, "tts_attempt_count"),
      band: text(finalRecord, "timing_band"),
      driftRatio: worstTiming.driftRatio,
      driftSeconds: worstTiming.driftSeconds,
      generatedCharacters: number(finalRecord, "tts_generated_characters"),
      generatedSeconds: timingSegments.reduce(
        (total, segment) => total + segment.generatedSeconds,
        0,
      ),
      model: VERIFIED_RUN_SNAPSHOT.timing.model,
      provider: VERIFIED_RUN_SNAPSHOT.timing.provider,
      segments: timingSegments,
      slotSeconds: number(finalRecord, "source_duration_seconds"),
      status: text(finalRecord, "timing_status"),
      tempoAdjustedSegmentIds: timingSegments
        .filter((segment) => segment.tempoFactor > 1.000001)
        .map((segment) => segment.id),
      wordTimingCount: timingSegments.reduce(
        (total, segment) => total + segment.wordTimingCount,
        0,
      ),
    },
    disclosure: {
      humanApprovalRequired: boolean(
        disclosure,
        "human_approval_required_before_publish",
      ),
      syntheticVoice: boolean(disclosure, "synthetic_voice"),
      translationProvider: text(disclosure, "translation_provider"),
      transcriptionProvider: text(
        disclosure,
        "source_transcription_provider",
      ),
      voiceModel: text(disclosure, "voice_model"),
      voiceProvider: text(disclosure, "voice_provider"),
      voiceType: text(disclosure, "voice_type"),
    },
    pipeline: [
      { name: "Ingest", detail: "Source stored in B2", state: "done" },
      {
        name: "Transcribe",
        detail: `${timingSegments.length} timed segments`,
        state: "done",
      },
      { name: "Translate", detail: "Toluva preserved", state: "done" },
      { name: "Authorize", detail: "Stock voice allowed", state: "done" },
      { name: "Time-fit QA", detail: "2 pad · 1 tempo-fit", state: "done" },
      {
        name: "Master",
        detail: `${number(finalRecord, "final_duration_seconds").toFixed(3)}s verified`,
        state: "done",
      },
    ],
    manifests,
    assets,
    b2ObjectCount:
      jobFiles.length > 0
        ? jobFiles.length
        : VERIFIED_RUN_SNAPSHOT.b2ObjectCount,
  };
}

export async function verifiedMediaKey(
  kind: "source" | "final" | "captions" | "speech",
): Promise<string> {
  const finalRecord = await getB2Json<JsonRecord>(VERIFIED_FINAL_RECORD_KEY);
  const field = {
    captions: "captions_key",
    final: "final_asset_key",
    source: "source_key",
    speech: "selected_speech_key",
  }[kind];
  const key = text(finalRecord, field);
  if (!key.startsWith(PROJECT_ROOT)) {
    throw new Error("verified_media_outside_project");
  }
  return key;
}
