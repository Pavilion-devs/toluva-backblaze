import { readWorkerAvailability } from "../../../lib/worker-status-server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  return Response.json(
    {
      ok: true,
      worker: await readWorkerAvailability(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
