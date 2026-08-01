export function liveIntakeEnabled(): boolean {
  return process.env.TOLUVA_ENABLE_LIVE_INTAKE === "true";
}

export function judgeReadOnlyResponse(): Response {
  return Response.json(
    {
      error: "judge_mode_read_only",
      message:
        "Public judge mode is read-only so anonymous visitors cannot spend provider credits or mutate B2 evidence.",
      ok: false,
    },
    { headers: { "Cache-Control": "no-store" }, status: 403 },
  );
}
