import {
  evaluateVerifiedAuthorization,
  isAuthorizationLanguage,
  isAuthorizationPurpose,
} from "../../../lib/authorization-policy-server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  let body: { language?: unknown; purpose?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "authorization_request_invalid", ok: false },
      { status: 400 },
    );
  }
  if (
    !isAuthorizationLanguage(body.language) ||
    !isAuthorizationPurpose(body.purpose)
  ) {
    return Response.json(
      { error: "authorization_request_invalid", ok: false },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      {
        decision: await evaluateVerifiedAuthorization(
          body.language,
          body.purpose,
        ),
        ok: true,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error: "authorization_record_unavailable",
        message:
          "The policy check stopped because its B2 authorization record could not be verified.",
        ok: false,
      },
      { headers: { "Cache-Control": "no-store" }, status: 503 },
    );
  }
}
