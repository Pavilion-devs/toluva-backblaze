import {
  isIntakeProjectId,
  isLocalizationJobId,
} from "../../../lib/job-contract";
import { readJobStatus } from "../../../lib/job-server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? "";
  const jobId = url.searchParams.get("job") ?? "";
  if (
    !isIntakeProjectId(projectId) ||
    !isLocalizationJobId(jobId)
  ) {
    return Response.json(
      { error: "invalid_job_handle", ok: false },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      {
        job: await readJobStatus(projectId, jobId),
        ok: true,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=5, stale-while-revalidate=10",
        },
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const missing = code.endsWith("_404");
    return Response.json(
      {
        error: missing ? "job_not_found" : "job_status_unavailable",
        message: missing
          ? "The saved job link no longer resolves to a durable B2 request."
          : "The durable B2 job exists, but its status is temporarily unavailable.",
        ok: false,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: missing ? 404 : 503,
      },
    );
  }
}
