import { DEFAULT_PUBLIC_DAILY_JOB_LIMIT } from "./job-contract";

export function liveIntakeEnabled(): boolean {
  return process.env.TOLUVA_ENABLE_LIVE_INTAKE === "true";
}

export function publicDailyJobLimit(): number {
  const parsed = Number(process.env.TOLUVA_PUBLIC_DAILY_JOB_LIMIT);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 25
    ? parsed
    : DEFAULT_PUBLIC_DAILY_JOB_LIMIT;
}

export function intakeUnavailableResponse(): Response {
  return Response.json(
    {
      error: "live_intake_unavailable",
      message:
        "New localization is temporarily unavailable. Existing runs and evidence remain accessible.",
      ok: false,
    },
    { headers: { "Cache-Control": "no-store" }, status: 403 },
  );
}
