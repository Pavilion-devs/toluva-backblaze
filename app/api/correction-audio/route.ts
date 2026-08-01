import {
  correctionProofAudio,
  isCorrectionAttempt,
} from "../../../lib/correction-proof-server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  const attempt = Number(new URL(request.url).searchParams.get("attempt"));
  if (!isCorrectionAttempt(attempt)) {
    return Response.json(
      { error: "unsupported_correction_attempt" },
      { status: 400 },
    );
  }
  try {
    return await correctionProofAudio(attempt, request.headers.get("range"));
  } catch {
    return Response.json(
      { error: "correction_audio_unavailable" },
      { status: 503 },
    );
  }
}
