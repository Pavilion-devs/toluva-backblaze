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
  jobPrefix,
  queueRequestKey,
  statusPrefix,
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
    state: validEvents.at(-1)!.state,
  };
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
