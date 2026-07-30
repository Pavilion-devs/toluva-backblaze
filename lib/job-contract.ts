export const JOB_LANGUAGE = "de-DE";
export const JOB_PURPOSE = "internal-training";
export const JOB_VERSION = "live-v1";
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MIN_CLIP_SECONDS = 1;
export const MAX_CLIP_SECONDS = 30;

const PROJECT_ID = /^intake-[a-f0-9]{32}$/;
const JOB_ID = /^localize-[a-f0-9]{32}$/;
const SEGMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type JobState =
  | "queued"
  | "running"
  | "blocked"
  | "failed"
  | "completed";

export type JobEvent = {
  created_at: string;
  job_id: string;
  label: string;
  message: string;
  project_id: string;
  record_type: "job_status_event";
  schema_version: "1.0";
  sequence: number;
  stage: string;
  state: JobState;
};

export type QueueRequest = {
  authorization_id: string;
  client_reported_duration_seconds: number;
  created_at: string;
  development_sample: false;
  job_id: string;
  protected_terms: string[];
  project_id: string;
  purpose: typeof JOB_PURPOSE;
  record_type: "localization_job_request";
  schema_version: "1.0";
  source_asset_id: string;
  source_content_type: "video/mp4";
  source_filename: string;
  source_key: string;
  source_sha256: string;
  source_size_bytes: number;
  state: "queued";
  target_language: typeof JOB_LANGUAGE;
  version: typeof JOB_VERSION;
};

export function isIntakeProjectId(value: string): boolean {
  return PROJECT_ID.test(value);
}

export function isLocalizationJobId(value: string): boolean {
  return JOB_ID.test(value);
}

export function isSegmentId(value: string): boolean {
  return SEGMENT_ID.test(value);
}

export function jobPrefix(projectId: string, jobId: string): string {
  if (!isIntakeProjectId(projectId) || !isLocalizationJobId(jobId)) {
    throw new Error("invalid_job_handle");
  }
  return `projects/${projectId}/jobs/${jobId}/de-de`;
}

export function queueRequestKey(
  projectId: string,
  jobId: string,
): string {
  return `${jobPrefix(projectId, jobId)}/queue/request.json`;
}

export function statusPrefix(
  projectId: string,
  jobId: string,
): string {
  return `${jobPrefix(projectId, jobId)}/status/`;
}

export function finalRecordKey(
  projectId: string,
  jobId: string,
): string {
  return `${jobPrefix(projectId, jobId)}/final/${JOB_VERSION}.json`;
}

export function transcriptQualityKey(
  projectId: string,
  jobId: string,
): string {
  return `${jobPrefix(projectId, jobId)}/qa/transcript/${JOB_VERSION}.json`;
}

export function transcriptHumanReviewKey(
  projectId: string,
  jobId: string,
): string {
  return (
    `${jobPrefix(projectId, jobId)}/qa/transcript/` +
    `${JOB_VERSION}-human-review.json`
  );
}

export function translationRevisionRequestKey(
  projectId: string,
  jobId: string,
  segmentId: string,
  attemptNumber: number,
): string {
  if (
    !isSegmentId(segmentId) ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw new Error("invalid_translation_revision_handle");
  }
  return (
    `${jobPrefix(projectId, jobId)}/translations/${segmentId}/` +
    `revision-requests/attempt-${attemptNumber}.json`
  );
}

export function translationApprovedRevisionKey(
  projectId: string,
  jobId: string,
  segmentId: string,
  attemptNumber: number,
): string {
  if (
    !isSegmentId(segmentId) ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw new Error("invalid_translation_revision_handle");
  }
  return (
    `${jobPrefix(projectId, jobId)}/translations/${segmentId}/` +
    `approved-revisions/attempt-${attemptNumber}.json`
  );
}
