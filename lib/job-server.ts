import "server-only";

import {
  createB2ProjectUploader,
  getB2ProjectJson,
  listB2ProjectFiles,
  proxyB2ProjectObject,
} from "./b2-server";
import {
  JOB_LANGUAGE,
  JOB_PURPOSE,
  JOB_VERSION,
  MAX_CLIP_SECONDS,
  MAX_UPLOAD_BYTES,
  MIN_CLIP_SECONDS,
  finalRecordKey,
  isIntakeProjectId,
  isLocalizationJobId,
  jobPrefix,
  queueRequestKey,
  statusPrefix,
  transcriptHumanReviewKey,
  transcriptQualityKey,
  type JobEvent,
  type QueueRequest,
} from "./job-contract";

type CompletedJobRecord = {
  captions_key: string;
  final_asset_key: string;
  job_id: string;
  project_id: string;
  selected_speech_key: string;
  source_key: string;
};

export type JobMediaKind = "source" | "final" | "captions" | "speech";

type TranscriptQualityRecord = {
  decision: "accepted" | "review_required";
  detected_text: string;
  job_id: string;
  language_probability: number | null;
  mean_word_confidence: number | null;
  project_id: string;
  reason_codes: string[];
  record_type: "transcript_quality_review";
  text_sha256: string;
  trailing_text: string;
};

type TranscriptHumanReviewRecord = {
  corrected_text: string;
  corrected_text_sha256: string;
  decision: "approved";
  job_id: string;
  original_text_sha256: string;
  project_id: string;
  record_type: "transcript_human_review";
};

export type TranscriptReviewView = {
  detectedText: string;
  languageProbability: number | null;
  meanWordConfidence: number | null;
  reasonCodes: string[];
  trailingText: string;
};

function compactUuid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safeFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1) ?? "source.mp4";
  const clean = leaf
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return clean.toLowerCase().endsWith(".mp4")
    ? clean
    : `${clean || "source"}.mp4`;
}

function parseDuration(value: FormDataEntryValue | null): number {
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_CLIP_SECONDS ||
    parsed > MAX_CLIP_SECONDS
  ) {
    throw new Error("clip_duration_out_of_range");
  }
  return parsed;
}

export async function createQueuedJob(form: FormData): Promise<{
  jobId: string;
  projectId: string;
  request: QueueRequest;
}> {
  const file = form.get("source");
  if (!(file instanceof File)) throw new Error("source_file_required");
  if (file.type !== "video/mp4") throw new Error("source_must_be_mp4");
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("source_size_out_of_range");
  }
  if (form.get("targetLanguage") !== JOB_LANGUAGE) {
    throw new Error("authorization_wrong_language");
  }
  if (form.get("purpose") !== JOB_PURPOSE) {
    throw new Error("authorization_wrong_purpose");
  }

  const duration = parseDuration(form.get("durationSeconds"));
  const projectId = compactUuid("intake");
  const jobId = compactUuid("localize");
  const sourceAssetId = compactUuid("source");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceSha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  const sourceKey =
    `projects/${projectId}/source/master/${sourceAssetId}.mp4`;
  const sourceRecordKey =
    `projects/${projectId}/source/records/${sourceAssetId}.json`;
  const createdAt = new Date().toISOString();
  const authorizationId = "auth-stock-intake-v1";
  const filename = safeFilename(file.name);

  const uploader = await createB2ProjectUploader();
  await uploader.putObject(sourceKey, bytes, "video/mp4");
  await uploader.putJson(sourceRecordKey, {
    b2_key: sourceKey,
    client_reported_duration_seconds: duration,
    development_sample: false,
    mime_type: "video/mp4",
    original_filename: filename,
    record_type: "source_ingest",
    schema_version: "1.0",
    sha256: sourceSha256,
    size_bytes: bytes.byteLength,
    source_kind: "user-uploaded-engine-test",
  });

  const request: QueueRequest = {
    authorization_id: authorizationId,
    client_reported_duration_seconds: duration,
    created_at: createdAt,
    development_sample: false,
    job_id: jobId,
    protected_terms: ["Toluva"],
    project_id: projectId,
    purpose: JOB_PURPOSE,
    record_type: "localization_job_request",
    schema_version: "1.0",
    source_asset_id: sourceAssetId,
    source_content_type: "video/mp4",
    source_filename: filename,
    source_key: sourceKey,
    source_sha256: sourceSha256,
    source_size_bytes: bytes.byteLength,
    state: "queued",
    target_language: JOB_LANGUAGE,
    version: JOB_VERSION,
  };
  await uploader.putJson(
    `${statusPrefix(projectId, jobId)}01-queued.json`,
    {
      created_at: createdAt,
      job_id: jobId,
      label: "Queued in Backblaze B2",
      message:
        "The source and immutable job request are durable. The Python worker can safely claim this job.",
      project_id: projectId,
      record_type: "job_status_event",
      schema_version: "1.0",
      sequence: 1,
      stage: "queued",
      state: "queued",
    } satisfies JobEvent,
  );
  // The immutable request is the queue's commit marker. Publish it only after
  // the source, source record, and initial status event are durable.
  await uploader.putJson(queueRequestKey(projectId, jobId), request);

  return { jobId, projectId, request };
}

export async function readJobStatus(
  projectId: string,
  jobId: string,
): Promise<{
  events: JobEvent[];
  finalAvailable: boolean;
  jobId: string;
  projectId: string;
  request: Pick<
    QueueRequest,
    | "created_at"
    | "source_filename"
    | "source_size_bytes"
    | "target_language"
  >;
  state: JobEvent["state"];
  transcriptReview?: TranscriptReviewView;
}> {
  const prefix = jobPrefix(projectId, jobId);
  const request = await getB2ProjectJson<QueueRequest>(
    queueRequestKey(projectId, jobId),
  );
  if (request.project_id !== projectId || request.job_id !== jobId) {
    throw new Error("job_request_handle_mismatch");
  }

  const files = await listB2ProjectFiles(statusPrefix(projectId, jobId));
  const eventFiles = files
    .filter((file) => file.fileName.endsWith(".json"))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
  const events = await Promise.all(
    eventFiles.map((file) => getB2ProjectJson<JobEvent>(file.fileName)),
  );
  const validEvents = events
    .filter(
      (event) =>
        event.record_type === "job_status_event" &&
        event.project_id === projectId &&
        event.job_id === jobId,
    )
    .sort((left, right) => left.sequence - right.sequence);
  if (validEvents.length === 0) throw new Error("job_status_missing");
  const currentEvent = validEvents.at(-1)!;
  const currentState = currentEvent.state;
  let transcriptReview: TranscriptReviewView | undefined;
  if (
    currentState === "blocked" &&
    currentEvent.stage === "transcript-blocked"
  ) {
    const quality = await getB2ProjectJson<TranscriptQualityRecord>(
      transcriptQualityKey(projectId, jobId),
    );
    if (
      quality.record_type !== "transcript_quality_review" ||
      quality.project_id !== projectId ||
      quality.job_id !== jobId ||
      quality.decision !== "review_required"
    ) {
      throw new Error("transcript_quality_scope_mismatch");
    }
    transcriptReview = {
      detectedText: quality.detected_text,
      languageProbability: quality.language_probability,
      meanWordConfidence: quality.mean_word_confidence,
      reasonCodes: quality.reason_codes,
      trailingText: quality.trailing_text,
    };
  }

  const finalFiles = await listB2ProjectFiles(
    `${prefix}/final/${JOB_VERSION}.json`,
  );
  const expectedFinal = finalRecordKey(projectId, jobId);

  return {
    events: validEvents,
    finalAvailable: finalFiles.some(
      (file) => file.fileName === expectedFinal,
    ),
    jobId,
    projectId,
    request: {
      created_at: request.created_at,
      source_filename: request.source_filename,
      source_size_bytes: request.source_size_bytes,
      target_language: request.target_language,
    },
    state: currentState,
    ...(transcriptReview ? { transcriptReview } : {}),
  };
}

function normalizedTranscriptCorrection(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("corrected_transcript_required");
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 1 || normalized.length > 1000) {
    throw new Error("corrected_transcript_size_invalid");
  }
  if (!normalized.includes("Toluva")) {
    throw new Error("corrected_transcript_lost_protected_term");
  }
  if (/(?:\.{3}|…)\s*$/.test(normalized)) {
    throw new Error("corrected_transcript_trailing_fragment");
  }
  return normalized;
}

function transcriptApprovedEvent(
  projectId: string,
  jobId: string,
  createdAt: string,
): JobEvent {
  return {
    created_at: createdAt,
    job_id: jobId,
    label: "Transcript correction approved",
    message:
      "An immutable operator correction passed protected-term checks.",
    project_id: projectId,
    record_type: "job_status_event",
    schema_version: "1.0",
    sequence: 7,
    stage: "transcript-approved",
    state: "running",
  };
}

export async function approveTranscriptCorrection(input: {
  correctedText?: unknown;
  jobId?: unknown;
  projectId?: unknown;
}) {
  const projectId =
    typeof input.projectId === "string" ? input.projectId : "";
  const jobId = typeof input.jobId === "string" ? input.jobId : "";
  if (
    !isIntakeProjectId(projectId) ||
    !isLocalizationJobId(jobId)
  ) {
    throw new Error("invalid_job_handle");
  }
  const correctedText = normalizedTranscriptCorrection(
    input.correctedText,
  );
  const blockedKey =
    `${statusPrefix(projectId, jobId)}06-transcript-blocked.json`;
  const approvedStatusKey =
    `${statusPrefix(projectId, jobId)}07-transcript-approved.json`;
  const statusFiles = await listB2ProjectFiles(
    statusPrefix(projectId, jobId),
  );
  if (!statusFiles.some((file) => file.fileName === blockedKey)) {
    throw new Error("transcript_review_not_blocked");
  }
  const quality = await getB2ProjectJson<TranscriptQualityRecord>(
    transcriptQualityKey(projectId, jobId),
  );
  if (
    quality.record_type !== "transcript_quality_review" ||
    quality.project_id !== projectId ||
    quality.job_id !== jobId ||
    quality.decision !== "review_required"
  ) {
    throw new Error("transcript_quality_scope_mismatch");
  }
  const detectedTextSha256 = hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(quality.detected_text),
    ),
  );
  if (detectedTextSha256 !== quality.text_sha256) {
    throw new Error("transcript_quality_hash_mismatch");
  }

  const reviewKey = transcriptHumanReviewKey(projectId, jobId);
  const existingReview = await listB2ProjectFiles(reviewKey);
  if (existingReview.some((file) => file.fileName === reviewKey)) {
    const existing =
      await getB2ProjectJson<TranscriptHumanReviewRecord>(reviewKey);
    if (
      existing.project_id !== projectId ||
      existing.job_id !== jobId ||
      existing.corrected_text !== correctedText
    ) {
      throw new Error("transcript_review_conflict");
    }
    if (
      !statusFiles.some(
        (file) => file.fileName === approvedStatusKey,
      )
    ) {
      const uploader = await createB2ProjectUploader();
      await uploader.putJson(
        approvedStatusKey,
        transcriptApprovedEvent(
          projectId,
          jobId,
          new Date().toISOString(),
        ),
      );
    }
    return readJobStatus(projectId, jobId);
  }

  const correctedTextSha256 = hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(correctedText),
    ),
  );
  const createdAt = new Date().toISOString();
  const uploader = await createB2ProjectUploader();
  await uploader.putJson(reviewKey, {
    corrected_text: correctedText,
    corrected_text_sha256: correctedTextSha256,
    created_at: createdAt,
    decision: "approved",
    job_id: jobId,
    original_text_sha256: quality.text_sha256,
    project_id: projectId,
    protected_terms: ["Toluva"],
    reason_codes: quality.reason_codes,
    record_type: "transcript_human_review",
    reviewer_type: "authenticated-toluva-operator",
    schema_version: "1.0",
  } satisfies TranscriptHumanReviewRecord & Record<string, unknown>);
  await uploader.putJson(
    approvedStatusKey,
    transcriptApprovedEvent(projectId, jobId, createdAt),
  );
  return readJobStatus(projectId, jobId);
}

export async function proxyCompletedJobMedia(
  projectId: string,
  jobId: string,
  kind: JobMediaKind,
  range?: string | null,
): Promise<Response> {
  const prefix = `${jobPrefix(projectId, jobId)}/`;
  const record = await getB2ProjectJson<CompletedJobRecord>(
    finalRecordKey(projectId, jobId),
  );
  if (record.project_id !== projectId || record.job_id !== jobId) {
    throw new Error("completed_job_handle_mismatch");
  }
  const keyByKind: Record<JobMediaKind, string> = {
    captions: record.captions_key,
    final: record.final_asset_key,
    source: record.source_key,
    speech: record.selected_speech_key,
  };
  const key = keyByKind[kind];
  const projectRoot = `projects/${projectId}/`;
  if (
    !key?.startsWith(projectRoot) ||
    (kind !== "source" && !key.startsWith(prefix))
  ) {
    throw new Error("completed_job_media_scope_mismatch");
  }
  return proxyB2ProjectObject(key, range);
}
