import { createQueuedJob } from "../../../lib/job-server";

const ERROR_STATUS: Record<string, number> = {
  authorization_wrong_language: 403,
  authorization_wrong_purpose: 403,
  clip_duration_out_of_range: 400,
  source_file_required: 400,
  source_must_be_mp4: 415,
  source_size_out_of_range: 413,
};

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const result = await createQueuedJob(await request.formData());
    return Response.json(
      {
        job: {
          jobId: result.jobId,
          projectId: result.projectId,
          statusUrl:
            `/api/job-status?project=${result.projectId}` +
            `&job=${result.jobId}`,
        },
        ok: true,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201,
      },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "job_creation_failed";
    console.error("toluva_job_creation_failed", { code });
    return Response.json(
      {
        error:
          code in ERROR_STATUS ? code : "job_creation_failed",
        message:
          code in ERROR_STATUS
            ? "The upload did not meet the governed intake contract."
            : "The job could not be written durably. No provider was called.",
        ok: false,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: ERROR_STATUS[code] ?? 503,
      },
    );
  }
}
