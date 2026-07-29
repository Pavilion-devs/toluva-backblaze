import "server-only";

import { getB2Json, listB2Files } from "./b2-server";
import {
  VERIFIED_RUN_SNAPSHOT,
  type RunManifest,
  type VerifiedRun,
} from "./verified-run";

export const VERIFIED_FINAL_RECORD_KEY =
  "projects/live-localization-project/jobs/english-to-german-v4/de-de/final/live-v1.json";

const JOB_PREFIX =
  "projects/live-localization-project/jobs/english-to-german-v4/de-de/";

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

function text(record: JsonRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return value;
}

function number(record: JsonRecord, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return value;
}

function boolean(record: JsonRecord, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`verified_run_missing_${field}`);
  }
  return value;
}

function stringArray(record: JsonRecord, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`verified_run_missing_${field}`);
  }
  return value as string[];
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

function assertVerifiedKey(value: string): string {
  if (
    !value.startsWith("projects/live-localization-project/") ||
    !value.endsWith(".json")
  ) {
    throw new Error("verified_run_references_unexpected_record");
  }
  return value;
}

export async function loadVerifiedRunFromB2(): Promise<VerifiedRun> {
  const finalRecord = await getB2Json<JsonRecord>(VERIFIED_FINAL_RECORD_KEY);
  const transcriptKey = assertVerifiedKey(text(finalRecord, "transcript_key"));
  const disclosureKey = assertVerifiedKey(text(finalRecord, "disclosure_key"));
  const authorizationId = "auth-stock-live-v1";
  const authorizationKey =
    `projects/live-localization-project/authorizations/${authorizationId}/` +
    "record.json";

  const manifestInputs = [
    ["Transcription", assertVerifiedKey(text(finalRecord, "transcription_manifest_key"))],
    ["Translation", assertVerifiedKey(text(finalRecord, "translation_manifest_key"))],
    ["Speech", assertVerifiedKey(text(finalRecord, "selected_speech_manifest_key"))],
    ["Composition", assertVerifiedKey(text(finalRecord, "composition_manifest_key"))],
  ] as const;

  const [transcript, timing, disclosure, authorization, ...manifestRecords] =
    await Promise.all([
      getB2Json<JsonRecord>(transcriptKey),
      getB2Json<JsonRecord>(
        `${JOB_PREFIX}qa/segment-001/summary.json`,
      ),
      getB2Json<JsonRecord>(disclosureKey),
      getB2Json<JsonRecord>(authorizationKey),
      ...manifestInputs.map(([, key]) => getB2Json<ManifestRecord>(key)),
    ]);

  const attempts = timing.attempts;
  if (!Array.isArray(attempts) || attempts.length < 1) {
    throw new Error("verified_run_missing_timing_attempt");
  }
  const selectedAttemptNumber = number(timing, "selected_attempt_number");
  const selectedAttempt = attempts.find((attempt) => {
    if (!attempt || typeof attempt !== "object") return false;
    const context = (attempt as JsonRecord).context;
    return (
      context &&
      typeof context === "object" &&
      (context as JsonRecord).attempt_number === selectedAttemptNumber
    );
  }) as JsonRecord | undefined;
  if (!selectedAttempt) throw new Error("verified_run_selected_attempt_missing");
  const speech = selectedAttempt.speech;
  if (!speech || typeof speech !== "object") {
    throw new Error("verified_run_speech_missing");
  }
  const speechRecord = speech as JsonRecord;

  const manifests = manifestInputs.map(([stage], index) =>
    manifestFromRecord(stage, manifestRecords[index]),
  );
  const jobFiles = await listB2Files(JOB_PREFIX);

  const sourceKey = text(finalRecord, "source_key");
  const finalAssetKey = text(finalRecord, "final_asset_key");
  const captionsKey = text(finalRecord, "captions_key");
  const selectedSpeechKey = text(finalRecord, "selected_speech_key");
  const detectedSourceText = text(finalRecord, "detected_source_text");
  const translatedText = text(finalRecord, "translated_text");
  const slotSeconds = number(selectedAttempt, "slot_seconds");
  const generatedSeconds = number(speechRecord, "generated_seconds");

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
      text: detectedSourceText,
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
      protectedTermsPreserved: boolean(
        finalRecord,
        "protected_terms_preserved",
      ),
      translatedText,
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
      id: authorizationId,
      voiceType: text(authorization, "voice_type"),
    },
    timing: {
      action: text(selectedAttempt, "timing_action"),
      attemptCount: attempts.length,
      band: text(selectedAttempt, "timing_band"),
      driftRatio: number(selectedAttempt, "drift_ratio"),
      driftSeconds: number(selectedAttempt, "drift_seconds"),
      generatedCharacters: number(timing, "total_generated_characters"),
      generatedSeconds,
      model: text(speechRecord, "model"),
      provider: text(speechRecord, "provider"),
      slotSeconds,
      status: text(timing, "status"),
      wordTimingCount: number(speechRecord, "word_timing_count"),
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
    manifests,
    assets: [
      {
        b2Key: sourceKey,
        kind: "SOURCE",
        meta: `${slotSeconds.toFixed(3)}s · SHA-256 verified`,
        name: sourceKey.split("/").at(-1) ?? "source.mp4",
      },
      {
        b2Key: transcriptKey,
        kind: "TRANSCRIPT",
        meta: `${text(transcript, "source")} · timed segment`,
        name: transcriptKey.split("/").at(-1) ?? "transcript.json",
      },
      {
        b2Key: selectedSpeechKey,
        kind: "AUDIO",
        meta:
          `${generatedSeconds.toFixed(3)}s · ` +
          `${number(speechRecord, "word_timing_count")} word timings`,
        name: selectedSpeechKey.split("/").at(-1) ?? "speech.mp3",
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
        b2Key: VERIFIED_FINAL_RECORD_KEY,
        kind: "RECORD",
        meta: `${Object.keys(finalRecord).length}-field durable run record`,
        name: "live-v1.json",
      },
    ],
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
  if (!key.startsWith("projects/live-localization-project/")) {
    throw new Error("verified_media_outside_project");
  }
  return key;
}
