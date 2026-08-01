import {
  approveTranscriptCorrection,
} from "../../../lib/job-server";
import {
  isIntakeProjectId,
  isLocalizationJobId,
} from "../../../lib/job-contract";
import {
  intakeUnavailableResponse,
  liveIntakeEnabled,
} from "../../../lib/runtime-mode";

const ERROR_STATUS: Record<string, number> = {
  corrected_transcript_lost_protected_term: 400,
  corrected_transcript_required: 400,
  corrected_transcript_size_invalid: 400,
  corrected_transcript_trailing_fragment: 400,
  invalid_job_handle: 400,
  transcript_review_conflict: 409,
  transcript_review_not_blocked: 409,
};

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      correctedText?: unknown;
      jobId?: unknown;
      projectId?: unknown;
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
    const job = await approveTranscriptCorrection(input);
    return Response.json(
      { job, ok: true },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201,
      },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "transcript_review_failed";
    console.error("toluva_transcript_review_failed", { code });
    return Response.json(
      {
        error:
          code in ERROR_STATUS ? code : "transcript_review_failed",
        message:
          code in ERROR_STATUS
            ? "The transcript correction did not meet the review contract."
            : "The transcript review could not be written durably.",
        ok: false,
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: ERROR_STATUS[code] ?? 503,
      },
    );
  }
}
