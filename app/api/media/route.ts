import { proxyB2Object } from "../../../lib/b2-server";
import { verifiedMediaKey } from "../../../lib/verified-run-server";

export const dynamic = "force-dynamic";

const mediaKinds = new Set(["source", "final", "captions", "speech"]);

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!kind || !mediaKinds.has(kind)) {
    return Response.json(
      { error: "unsupported_verified_media_kind" },
      { status: 400 },
    );
  }

  try {
    const key = await verifiedMediaKey(
      kind as "source" | "final" | "captions" | "speech",
    );
    return proxyB2Object(key, request.headers.get("range"));
  } catch {
    return Response.json(
      { error: "verified_media_unavailable" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
}
