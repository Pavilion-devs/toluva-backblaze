import { approveTimingRevision } from "../../../lib/job-server";
import {
  isIntakeProjectId,
  isLocalizationJobId,
} from "../../../lib/job-contract";
import {
  intakeUnavailableResponse,
  liveIntakeEnabled,
} from "../../../lib/runtime-mode";

const ERROR_STATUS: Record<string, number> = {
  invalid_job_handle: 400,
  timing_revision_conflict: 409,
  timing_revision_lost_protected_term: 400,
  timing_revision_must_change: 400,
  timing_revision_not_blocked: 409,
  timing_revision_request_missing: 409,
  timing_revision_requests_ambiguous: 409,
  timing_revision_required: 400,
  timing_revision_size_invalid: 400,
};

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      jobId?: unknown;
      projectId?: unknown;
      revisedText?: unknown;
    };
    if (
      typeof input.projectId !== "string" ||
      typeof input.jobId !== "string" ||
      !isIntakeProjectId(input.projectId) ||
      !isLocalizationJobId(input.jobId)
    ) {
      throw new Error("invalid_job_handle");
    }
    if (!liveIntakeEnabled()) return intakeUnavailableResponse();
    const job = await approveTimingRevision(input);
    return Response.json(
      { job, ok: true },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201,
      },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "timing_review_failed";
    console.error("toluva_timing_review_failed", { code });
    return Response.json(
      {
        error: code in ERROR_STATUS ? code : "timing_review_failed",
        message:
          code in ERROR_STATUS
            ? "The wording did not meet the timing-review contract."
            : "The timing review could not be written durably.",
        ok: false,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: ERROR_STATUS[code] ?? 503,
      },
    );
  }
}
