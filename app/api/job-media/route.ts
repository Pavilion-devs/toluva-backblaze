import {
  isIntakeProjectId,
  isLocalizationJobId,
} from "../../../lib/job-contract";
import {
  proxyCompletedJobMedia,
  type JobMediaKind,
} from "../../../lib/job-server";

const SUPPORTED_KINDS = new Set<JobMediaKind>([
  "source",
  "final",
  "captions",
  "speech",
]);

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? "";
  const jobId = url.searchParams.get("job") ?? "";
  const kind = url.searchParams.get("kind") as JobMediaKind | null;
  if (
    !isIntakeProjectId(projectId) ||
    !isLocalizationJobId(jobId) ||
    !kind ||
    !SUPPORTED_KINDS.has(kind)
  ) {
    return Response.json(
      { error: "invalid_job_media_request" },
      { status: 400 },
    );
  }
  try {
    return await proxyCompletedJobMedia(
      projectId,
      jobId,
      kind,
      request.headers.get("range"),
    );
  } catch {
    return Response.json(
      { error: "completed_job_media_unavailable" },
      { status: 404 },
    );
  }
}
