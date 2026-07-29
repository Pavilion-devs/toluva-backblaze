import { loadVerifiedRunFromB2 } from "../../../lib/verified-run-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const run = await loadVerifiedRunFromB2();
    return Response.json(
      { ok: true, run },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error: "live_b2_run_unavailable",
        message:
          "The verified snapshot remains visible while the live B2 read is unavailable.",
        ok: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
        status: 503,
      },
    );
  }
}
