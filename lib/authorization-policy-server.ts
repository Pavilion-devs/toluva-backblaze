import "server-only";

import { getB2Json } from "./b2-server";

const AUTHORIZATION_KEY =
  "projects/intake-57f5ca73b1fb4b4d97e85f94605f39e5/" +
  "authorizations/auth-stock-intake-v1/record.json";
const SHA256 = /^[a-f0-9]{64}$/;

export const AUTHORIZATION_LANGUAGES = {
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ja: "ja-JP",
} as const;

export const AUTHORIZATION_PURPOSES = [
  "customer-education",
  "internal-training",
  "public-marketing",
] as const;

export type AuthorizationLanguage = keyof typeof AUTHORIZATION_LANGUAGES;
export type AuthorizationPurpose = (typeof AUTHORIZATION_PURPOSES)[number];

type AuthorizationRecord = {
  allowed_languages?: unknown;
  allowed_purposes?: unknown;
  approved_at?: unknown;
  approved_by?: unknown;
  authorization_id?: unknown;
  disclosure?: unknown;
  evidence_sha256?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
  valid_from?: unknown;
  voice_type?: unknown;
};

export type AuthorizationDecision = {
  allowed: boolean;
  approvedAt: string;
  approvedBy: string;
  authorizationId: string;
  code:
    | "allowed"
    | "expired"
    | "not_yet_valid"
    | "revoked"
    | "wrong_language"
    | "wrong_purpose";
  disclosure: string;
  evaluatedAt: string;
  evidenceSha256: string;
  expiresAt: string;
  providerCalled: false;
  reason: string;
  requestedLanguage: string;
  requestedPurpose: AuthorizationPurpose;
  voiceType: string;
};

function text(record: AuthorizationRecord, field: keyof AuthorizationRecord) {
  const value = record[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`authorization_record_missing_${field}`);
  }
  return value;
}

function strings(
  record: AuthorizationRecord,
  field: "allowed_languages" | "allowed_purposes",
) {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`authorization_record_missing_${field}`);
  }
  return value as string[];
}

export async function evaluateVerifiedAuthorization(
  language: AuthorizationLanguage,
  purpose: AuthorizationPurpose,
): Promise<AuthorizationDecision> {
  const record = await getB2Json<AuthorizationRecord>(AUTHORIZATION_KEY);
  const requestedLanguage = AUTHORIZATION_LANGUAGES[language];
  const evaluatedAt = new Date().toISOString();
  const now = Date.parse(evaluatedAt);
  const validFrom = text(record, "valid_from");
  const expiresAt = text(record, "expires_at");
  const evidenceSha256 = text(record, "evidence_sha256");
  if (
    !SHA256.test(evidenceSha256) ||
    !Number.isFinite(Date.parse(validFrom)) ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    throw new Error("authorization_record_invalid");
  }

  let code: AuthorizationDecision["code"] = "allowed";
  let reason =
    "The stored voice policy covers this language and purpose for the current validity window.";
  if (typeof record.revoked_at === "string" && record.revoked_at) {
    code = "revoked";
    reason = "The stored voice authorization has been revoked.";
  } else if (now < Date.parse(validFrom)) {
    code = "not_yet_valid";
    reason = "The stored voice authorization is not active yet.";
  } else if (now > Date.parse(expiresAt)) {
    code = "expired";
    reason = "The stored voice authorization has expired.";
  } else if (!strings(record, "allowed_languages").includes(requestedLanguage)) {
    code = "wrong_language";
    reason = `The stored voice policy does not authorize ${requestedLanguage}.`;
  } else if (!strings(record, "allowed_purposes").includes(purpose)) {
    code = "wrong_purpose";
    reason = `The stored voice policy does not authorize ${purpose.replaceAll("-", " ")}.`;
  }

  return {
    allowed: code === "allowed",
    approvedAt: text(record, "approved_at"),
    approvedBy: text(record, "approved_by"),
    authorizationId: text(record, "authorization_id"),
    code,
    disclosure: text(record, "disclosure"),
    evaluatedAt,
    evidenceSha256,
    expiresAt,
    providerCalled: false,
    reason,
    requestedLanguage,
    requestedPurpose: purpose,
    voiceType: text(record, "voice_type"),
  };
}

export function isAuthorizationLanguage(
  value: unknown,
): value is AuthorizationLanguage {
  return typeof value === "string" && value in AUTHORIZATION_LANGUAGES;
}

export function isAuthorizationPurpose(
  value: unknown,
): value is AuthorizationPurpose {
  return (
    typeof value === "string" &&
    AUTHORIZATION_PURPOSES.includes(value as AuthorizationPurpose)
  );
}
