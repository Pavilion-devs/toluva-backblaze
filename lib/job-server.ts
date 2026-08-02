import "server-only";

import {
  createB2ProjectUploader,
  getB2ProjectJson,
  listB2ProjectFiles,
  listB2ProjectFilesStrict,
  proxyB2ProjectObject,
} from "./b2-server";
import {
  DEFAULT_PUBLIC_DAILY_JOB_LIMIT,
  JOB_LANGUAGE,
  JOB_PURPOSE,
  JOB_VERSION,
  MAX_CLIP_SECONDS,
  MAX_TTS_CALLS_PER_JOB,
  MAX_TTS_CHARACTERS_PER_JOB,
  MAX_UPLOAD_BYTES,
  MIN_CLIP_SECONDS,
  finalRecordKey,
  isCanonicalProtectedTermSubset,
  isIntakeProjectId,
  isLocalizationJobId,
  isSegmentId,
  jobPrefix,
  queueRequestKey,
  statusPrefix,
  transcriptHumanReviewKey,
  transcriptQualityKey,
  translationApprovedRevisionKey,
  translationRevisionRequestKey,
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

type TranslationRevisionRequestRecord = {
  attempt_number: number;
  current_translation: string;
  current_translation_sha256: string;
  instruction: string;
  instruction_sha256: string;
  job_id: string;
  parent_run_id: string;
  project_id: string;
  protected_terms: string[];
  record_type: "translation_revision_request";
  requested_action: string;
  schema_version: "1.0";
  segment_id: string;
  source_language: string;
  source_text_sha256: string;
  target_language: string;
  target_seconds: number;
};

type ApprovedTranslationRevisionRecord = {
  approved_at: string;
  approved_by: string;
  attempt_number: number;
  current_translation_sha256: string;
  decision: "approved";
  instruction_sha256: string;
  job_id: string;
  project_id: string;
  protected_terms: string[];
  record_type: "approved_translation_revision";
  request_binding_sha256: string;
  revised_text: string;
  revised_text_sha256: string;
  schema_version: "1.0";
  segment_id: string;
  source_text_sha256: string;
  target_seconds: number;
};

export type TimingReviewView = {
  attemptNumber: number;
  currentTranslation: string;
  instruction: string;
  protectedTerms: string[];
  requestedAction: string;
  segmentId: string;
  targetSeconds: number;
};

type TimingRevisionContext = {
  approvalKey: string;
  approvalExists: boolean;
  request: TranslationRevisionRequestRecord;
  requestKey: string;
  view: TimingReviewView;
};

const REVISION_REQUEST_SUFFIX =
  /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/revision-requests\/attempt-([1-9][0-9]*)\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;

function compactUuid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256Text(value: string): Promise<string> {
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
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

function confirmed(value: FormDataEntryValue | null): boolean {
  return value === "true";
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function admissionPrefix(day: string): string {
  return `projects/system-runtime/intake-admissions/${day}/`;
}

function admissionKey(day: string, slot: number): string {
  return `${admissionPrefix(day)}slot-${String(slot).padStart(3, "0")}.json`;
}

function hasMp4Signature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    new TextDecoder("ascii").decode(bytes.slice(4, 8)) === "ftyp"
  );
}

export async function createQueuedJob(
  form: FormData,
  options: { dailyJobLimit?: number } = {},
): Promise<{
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
  if (!confirmed(form.get("sourceRightsConfirmed"))) {
    throw new Error("source_rights_confirmation_required");
  }
  if (!confirmed(form.get("syntheticVoiceDisclosureAcknowledged"))) {
    throw new Error("synthetic_voice_disclosure_required");
  }

  const duration = parseDuration(form.get("durationSeconds"));
  const dailyJobLimit =
    options.dailyJobLimit ?? DEFAULT_PUBLIC_DAILY_JOB_LIMIT;
  if (
    !Number.isSafeInteger(dailyJobLimit) ||
    dailyJobLimit < 1 ||
    dailyJobLimit > 25
  ) {
    throw new Error("public_daily_job_limit_invalid");
  }
  const now = new Date();
  const createdAt = now.toISOString();
  const day = utcDay(now);
  const projectId = compactUuid("intake");
  const jobId = compactUuid("localize");
  const sourceAssetId = compactUuid("source");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMp4Signature(bytes)) throw new Error("source_must_be_mp4");
  const sourceSha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  const sourceKey =
    `projects/${projectId}/source/master/${sourceAssetId}.mp4`;
  const sourceRecordKey =
    `projects/${projectId}/source/records/${sourceAssetId}.json`;
  const authorizationId = "auth-stock-intake-v1";
  const filename = safeFilename(file.name);

  const occupiedSlots = new Set(
    (await listB2ProjectFilesStrict(admissionPrefix(day))).map(
      ({ fileName }) => fileName,
    ),
  );
  const slot = Array.from(
    { length: dailyJobLimit },
    (_, index) => index + 1,
  ).find((candidate) => !occupiedSlots.has(admissionKey(day, candidate)));
  if (!slot) throw new Error("public_daily_job_limit_reached");
  const reservedAdmissionKey = admissionKey(day, slot);

  const uploader = await createB2ProjectUploader();
  await uploader.putJson(reservedAdmissionKey, {
    admitted_at: createdAt,
    admission_day: day,
    admission_slot: slot,
    job_id: jobId,
    project_id: projectId,
    provider_budget: {
      max_tts_calls: MAX_TTS_CALLS_PER_JOB,
      max_tts_characters: MAX_TTS_CHARACTERS_PER_JOB,
    },
    record_type: "public_intake_admission",
    schema_version: "1.0",
    state: "reserved",
  });
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
    source_kind: "user-uploaded-public-intake",
    source_rights_confirmed: true,
    synthetic_voice_disclosure_acknowledged: true,
  });

  const request: QueueRequest = {
    admission_day: day,
    admission_key: reservedAdmissionKey,
    admission_slot: slot,
    authorization_id: authorizationId,
    client_reported_duration_seconds: duration,
    created_at: createdAt,
    development_sample: false,
    job_id: jobId,
    protected_terms: ["Toluva"],
    provider_budget: {
      max_tts_calls: MAX_TTS_CALLS_PER_JOB,
      max_tts_characters: MAX_TTS_CHARACTERS_PER_JOB,
    },
    public_intake: true,
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
    source_rights_confirmed: true,
    state: "queued",
    target_language: JOB_LANGUAGE,
    synthetic_voice_disclosure_acknowledged: true,
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
  timingReview?: TimingReviewView;
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
  const eventRecords = await Promise.all(
    eventFiles.map(async (file) => ({
      event: await getB2ProjectJson<JobEvent>(file.fileName),
      fileName: file.fileName,
      uploadTimestamp: file.uploadTimestamp,
    })),
  );
  const validEventRecords = eventRecords
    .filter(
      ({ event }) =>
        event.record_type === "job_status_event" &&
        event.project_id === projectId &&
        event.job_id === jobId,
    )
    .sort(
      (left, right) =>
        left.uploadTimestamp - right.uploadTimestamp ||
        left.fileName.localeCompare(right.fileName),
    );
  if (validEventRecords.length === 0) {
    throw new Error("job_status_missing");
  }
  const validEvents = validEventRecords.map(({ event }) => event);
  const currentEvent = validEventRecords.at(-1)!.event;
  const currentState = currentEvent.state;
  let transcriptReview: TranscriptReviewView | undefined;
  let timingReview: TimingReviewView | undefined;
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
  } else if (
    currentState === "blocked" &&
    currentEvent.stage === "timing-blocked"
  ) {
    const context = await loadOutstandingTimingRevision(
      projectId,
      jobId,
      request,
    );
    timingReview = context.view;
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
    ...(timingReview ? { timingReview } : {}),
    ...(transcriptReview ? { transcriptReview } : {}),
  };
}

function timingRevisionPrefix(
  projectId: string,
  jobId: string,
): string {
  return `${jobPrefix(projectId, jobId)}/translations/`;
}

async function validateTranslationRevisionRequest(
  request: TranslationRevisionRequestRecord,
  expected: {
    attemptNumber: number;
    jobId: string;
    projectId: string;
    protectedTerms: string[];
    segmentId: string;
  },
): Promise<void> {
  if (
    request.record_type !== "translation_revision_request" ||
    request.schema_version !== "1.0" ||
    request.project_id !== expected.projectId ||
    request.job_id !== expected.jobId ||
    request.segment_id !== expected.segmentId ||
    request.attempt_number !== expected.attemptNumber ||
    !isSegmentId(request.segment_id) ||
    !Number.isSafeInteger(request.attempt_number) ||
    request.attempt_number < 1 ||
    typeof request.current_translation !== "string" ||
    request.current_translation.trim().length < 1 ||
    request.current_translation.length > 2000 ||
    typeof request.instruction !== "string" ||
    request.instruction.trim().length < 1 ||
    request.instruction.length > 1000 ||
    typeof request.requested_action !== "string" ||
    !["retry_shorter", "retry_expanded"].includes(
      request.requested_action,
    ) ||
    typeof request.parent_run_id !== "string" ||
    request.parent_run_id.length < 1 ||
    request.parent_run_id.length > 200 ||
    request.source_language !== "English" ||
    request.target_language !== "German" ||
    !SHA256.test(request.source_text_sha256) ||
    !SHA256.test(request.current_translation_sha256) ||
    !SHA256.test(request.instruction_sha256) ||
    !Number.isFinite(request.target_seconds) ||
    request.target_seconds <= 0 ||
    request.target_seconds > MAX_CLIP_SECONDS ||
    !isCanonicalProtectedTermSubset(
      request.protected_terms,
      expected.protectedTerms,
    )
  ) {
    throw new Error("timing_revision_request_scope_mismatch");
  }
  const [translationSha256, instructionSha256] = await Promise.all([
    sha256Text(request.current_translation),
    sha256Text(request.instruction),
  ]);
  if (
    translationSha256 !== request.current_translation_sha256 ||
    instructionSha256 !== request.instruction_sha256
  ) {
    throw new Error("timing_revision_request_hash_mismatch");
  }
}

async function listTimingRevisionContexts(
  projectId: string,
  jobId: string,
  queueRequest: QueueRequest,
): Promise<TimingRevisionContext[]> {
  const prefix = timingRevisionPrefix(projectId, jobId);
  const files = await listB2ProjectFiles(prefix);
  const names = new Set(files.map(({ fileName }) => fileName));
  const handles = files
    .map(({ fileName }) => {
      if (!fileName.startsWith(prefix)) return null;
      const match = REVISION_REQUEST_SUFFIX.exec(
        fileName.slice(prefix.length),
      );
      if (!match) return null;
      return {
        attemptNumber: Number(match[2]),
        fileName,
        segmentId: match[1],
      };
    })
    .filter(
      (
        handle,
      ): handle is {
        attemptNumber: number;
        fileName: string;
        segmentId: string;
      } => handle !== null,
    )
    .sort(
      (left, right) =>
        left.attemptNumber - right.attemptNumber ||
        left.segmentId.localeCompare(right.segmentId),
    );
  const contexts: TimingRevisionContext[] = [];
  for (const handle of handles) {
    const expectedRequestKey = translationRevisionRequestKey(
      projectId,
      jobId,
      handle.segmentId,
      handle.attemptNumber,
    );
    if (handle.fileName !== expectedRequestKey) {
      throw new Error("timing_revision_request_key_mismatch");
    }
    const request =
      await getB2ProjectJson<TranslationRevisionRequestRecord>(
        expectedRequestKey,
      );
    await validateTranslationRevisionRequest(request, {
      attemptNumber: handle.attemptNumber,
      jobId,
      projectId,
      protectedTerms: queueRequest.protected_terms,
      segmentId: handle.segmentId,
    });
    const approvalKey = translationApprovedRevisionKey(
      projectId,
      jobId,
      handle.segmentId,
      handle.attemptNumber,
    );
    contexts.push({
      approvalExists: names.has(approvalKey),
      approvalKey,
      request,
      requestKey: expectedRequestKey,
      view: {
        attemptNumber: request.attempt_number,
        currentTranslation: request.current_translation,
        instruction: request.instruction,
        protectedTerms: [...request.protected_terms],
        requestedAction: request.requested_action,
        segmentId: request.segment_id,
        targetSeconds: request.target_seconds,
      },
    });
  }
  return contexts;
}

async function loadOutstandingTimingRevision(
  projectId: string,
  jobId: string,
  queueRequest: QueueRequest,
): Promise<TimingRevisionContext> {
  const contexts = await listTimingRevisionContexts(
    projectId,
    jobId,
    queueRequest,
  );
  const outstanding = contexts.filter(
    ({ approvalExists }) => !approvalExists,
  );
  if (outstanding.length !== 1) {
    throw new Error(
      outstanding.length === 0
        ? "timing_revision_request_missing"
        : "timing_revision_requests_ambiguous",
    );
  }
  return outstanding[0];
}

async function revisionRequestBindingSha256(
  request: TranslationRevisionRequestRecord,
): Promise<string> {
  const [
    requestedActionHash,
    parentRunHash,
    sourceLanguageHash,
    targetLanguageHash,
    ...protectedTermHashes
  ] = await Promise.all(
    [
      request.requested_action,
      request.parent_run_id,
      request.source_language,
      request.target_language,
      ...request.protected_terms,
    ].map(sha256Text),
  );
  return sha256Text(
    [
      "translation-revision-request/v1",
      request.project_id,
      request.job_id,
      request.segment_id,
      String(request.attempt_number),
      request.source_text_sha256,
      request.current_translation_sha256,
      request.instruction_sha256,
      request.target_seconds.toFixed(6),
      requestedActionHash,
      parentRunHash,
      sourceLanguageHash,
      targetLanguageHash,
      ...protectedTermHashes,
    ].join("\0"),
  );
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

function normalizedTimingRevision(
  value: unknown,
  request: TranslationRevisionRequestRecord,
): string {
  if (typeof value !== "string") {
    throw new Error("timing_revision_required");
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 1 || normalized.length > 2000) {
    throw new Error("timing_revision_size_invalid");
  }
  if (normalized === request.current_translation.trim()) {
    throw new Error("timing_revision_must_change");
  }
  if (
    request.protected_terms.some((term) => !normalized.includes(term))
  ) {
    throw new Error("timing_revision_lost_protected_term");
  }
  return normalized;
}

function timingApprovedEvent(
  projectId: string,
  jobId: string,
  segmentId: string,
  attemptNumber: number,
  createdAt: string,
): JobEvent {
  return {
    created_at: createdAt,
    job_id: jobId,
    label: "Timing revision approved",
    message:
      `The exact wording for ${segmentId}, attempt ${attemptNumber} ` +
      "is hash-bound and ready for same-job resume.",
    project_id: projectId,
    record_type: "job_status_event",
    schema_version: "1.0",
    sequence: 13,
    stage: "timing-approved",
    state: "running",
  };
}

function timingApprovedStatusKey(
  projectId: string,
  jobId: string,
  segmentId: string,
  attemptNumber: number,
): string {
  return (
    `${statusPrefix(projectId, jobId)}13-timing-approved-` +
    `${segmentId}-attempt-${attemptNumber}.json`
  );
}

function matchingApproval(
  approval: ApprovedTranslationRevisionRecord,
  expected: ApprovedTranslationRevisionRecord,
): boolean {
  return (
    approval.record_type === expected.record_type &&
    approval.schema_version === expected.schema_version &&
    approval.decision === expected.decision &&
    approval.project_id === expected.project_id &&
    approval.job_id === expected.job_id &&
    approval.segment_id === expected.segment_id &&
    approval.attempt_number === expected.attempt_number &&
    approval.request_binding_sha256 ===
      expected.request_binding_sha256 &&
    approval.source_text_sha256 === expected.source_text_sha256 &&
    approval.current_translation_sha256 ===
      expected.current_translation_sha256 &&
    approval.instruction_sha256 === expected.instruction_sha256 &&
    approval.target_seconds === expected.target_seconds &&
    JSON.stringify(approval.protected_terms) ===
      JSON.stringify(expected.protected_terms) &&
    approval.revised_text === expected.revised_text &&
    approval.revised_text_sha256 === expected.revised_text_sha256
  );
}

async function buildTimingApproval(
  context: TimingRevisionContext,
  revisedText: string,
  approvedAt: string,
): Promise<ApprovedTranslationRevisionRecord> {
  const [bindingSha256, revisedTextSha256] = await Promise.all([
    revisionRequestBindingSha256(context.request),
    sha256Text(revisedText),
  ]);
  return {
    approved_at: approvedAt,
    approved_by: "authenticated-toluva-operator",
    attempt_number: context.request.attempt_number,
    current_translation_sha256:
      context.request.current_translation_sha256,
    decision: "approved",
    instruction_sha256: context.request.instruction_sha256,
    job_id: context.request.job_id,
    project_id: context.request.project_id,
    protected_terms: [...context.request.protected_terms],
    record_type: "approved_translation_revision",
    request_binding_sha256: bindingSha256,
    revised_text: revisedText,
    revised_text_sha256: revisedTextSha256,
    schema_version: "1.0",
    segment_id: context.request.segment_id,
    source_text_sha256: context.request.source_text_sha256,
    target_seconds: context.request.target_seconds,
  };
}

export async function approveTimingRevision(input: {
  jobId?: unknown;
  projectId?: unknown;
  revisedText?: unknown;
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
  const queueRequest = await getB2ProjectJson<QueueRequest>(
    queueRequestKey(projectId, jobId),
  );
  if (
    queueRequest.project_id !== projectId ||
    queueRequest.job_id !== jobId
  ) {
    throw new Error("job_request_handle_mismatch");
  }
  const contexts = await listTimingRevisionContexts(
    projectId,
    jobId,
    queueRequest,
  );
  if (contexts.length === 0) {
    throw new Error("timing_revision_request_missing");
  }
  const outstanding = contexts.filter(
    ({ approvalExists }) => !approvalExists,
  );
  if (outstanding.length > 1) {
    throw new Error("timing_revision_requests_ambiguous");
  }
  const context = outstanding[0] ?? contexts.at(-1)!;
  const revisedText = normalizedTimingRevision(
    input.revisedText,
    context.request,
  );
  const createdAt = new Date().toISOString();
  const approval = await buildTimingApproval(
    context,
    revisedText,
    createdAt,
  );
  const statusKey = timingApprovedStatusKey(
    projectId,
    jobId,
    context.request.segment_id,
    context.request.attempt_number,
  );
  const statusFiles = await listB2ProjectFiles(
    statusPrefix(projectId, jobId),
  );

  if (outstanding.length === 0) {
    const existing =
      await getB2ProjectJson<ApprovedTranslationRevisionRecord>(
        context.approvalKey,
      );
    if (!matchingApproval(existing, approval)) {
      throw new Error("timing_revision_conflict");
    }
    if (!statusFiles.some(({ fileName }) => fileName === statusKey)) {
      const uploader = await createB2ProjectUploader();
      await uploader.putJson(
        statusKey,
        timingApprovedEvent(
          projectId,
          jobId,
          context.request.segment_id,
          context.request.attempt_number,
          createdAt,
        ),
      );
    }
    return readJobStatus(projectId, jobId);
  }

  const current = await readJobStatus(projectId, jobId);
  if (
    current.state !== "blocked" ||
    current.timingReview?.segmentId !== context.request.segment_id ||
    current.timingReview.attemptNumber !==
      context.request.attempt_number
  ) {
    throw new Error("timing_revision_not_blocked");
  }
  const uploader = await createB2ProjectUploader();
  await uploader.putJson(context.approvalKey, approval);
  await uploader.putJson(
    statusKey,
    timingApprovedEvent(
      projectId,
      jobId,
      context.request.segment_id,
      context.request.attempt_number,
      createdAt,
    ),
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
