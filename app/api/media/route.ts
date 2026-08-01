import { proxyB2Object } from "../../../lib/b2-server";
import { verifiedMediaKey } from "../../../lib/verified-run-server";
import { liveIntakeEnabled } from "../../../lib/runtime-mode";

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
  if (kind === "source" && !liveIntakeEnabled()) {
    return Response.json(
      {
        error: "source_audio_withheld",
        message:
          "Public judge mode serves an audio-free source preview while preserving the immutable source master privately in B2.",
      },
      { headers: { "Cache-Control": "no-store" }, status: 403 },
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
