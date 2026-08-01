"use client";

import { useState } from "react";
import { dateLabel, shortHash } from "../../../../lib/format";
import {
  buttonClass,
  Chip,
  MetaLabel,
  PageHeader,
  Panel,
} from "../../_components/ui";
import { useWorkspace } from "../../_components/workspace-data";

type AuthorizationDecision = {
  allowed: boolean;
  approvedAt: string;
  approvedBy: string;
  authorizationId: string;
  code: string;
  disclosure: string;
  evaluatedAt: string;
  evidenceSha256: string;
  expiresAt: string;
  providerCalled: false;
  reason: string;
  requestedLanguage: string;
  requestedPurpose: string;
  voiceType: string;
};

type CheckState = "idle" | "checking" | "approved" | "blocked" | "error";

const languages = [
  { code: "de", label: "German — Deutsch" },
  { code: "fr", label: "French — Français" },
  { code: "es", label: "Spanish — Español" },
  { code: "ja", label: "Japanese — 日本語" },
];

const purposes = [
  { label: "Internal training", value: "internal-training" },
  { label: "Customer education", value: "customer-education" },
  { label: "Public marketing", value: "public-marketing" },
];

export default function VoicePage() {
  const { refreshRun, run, setNotice } = useWorkspace();
  const [language, setLanguage] = useState("de");
  const [purpose, setPurpose] = useState("internal-training");
  const [state, setState] = useState<CheckState>("idle");
  const [decision, setDecision] = useState<AuthorizationDecision | null>(null);

  function reset() {
    setState("idle");
    setDecision(null);
  }

  async function runCheck() {
    setState("checking");
    setDecision(null);
    try {
      const response = await fetch("/api/authorization", {
        body: JSON.stringify({ language, purpose }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        decision?: AuthorizationDecision;
        ok?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.decision) {
        throw new Error("authorization_check_unavailable");
      }
      setDecision(payload.decision);
      setState(payload.decision.allowed ? "approved" : "blocked");
    } catch {
      setState("error");
    }
  }

  async function loadCompletedJob() {
    const loadedLive = await refreshRun();
    reset();
    setNotice(
      loadedLive
        ? "Completed job replayed from B2. No model or provider call was made."
        : "Live B2 is unavailable. The last verified snapshot remains loaded.",
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="Voice authorization is an active generation control, not decorative metadata. Language, purpose, validity, revocation, and the stored evidence hash are all evaluated before a provider is ever called."
        eyebrow="Pre-provider gate"
        title="Voice authorization"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          actions={<Chip tone="green">Authorized</Chip>}
          eyebrow="Authorization record"
          title={run.authorization.id}
        >
          <p className="mb-5 text-[14px] leading-relaxed text-slate-600">
            Authorized for German internal training with a disclosed stock
            synthetic voice. Human approval is required before publishing.
          </p>
          <dl className="flex flex-col divide-y divide-slate-100">
            {[
              ["Decision", run.authorization.code],
              ["Voice type", run.authorization.voiceType],
              ["Voice model", run.disclosure.voiceModel],
              ["Languages", run.authorization.allowedLanguages.join(" · ")],
              ["Purposes", run.authorization.allowedPurposes.join(" · ")],
              ["Valid through", dateLabel(run.authorization.expiresAt)],
              ["Approved by", run.authorization.approvedBy],
              ["Evidence hash", shortHash(run.authorization.evidenceSha256)],
            ].map(([term, value]) => (
              <div
                className="flex items-baseline justify-between gap-4 py-2.5"
                key={term}
              >
                <dt className="shrink-0 text-[13px] text-slate-500">{term}</dt>
                <dd className="text-right font-mono text-[13px] font-medium text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 rounded-2xl border border-slate-100 bg-cream p-4">
            <MetaLabel>Synthetic voice disclosure</MetaLabel>
            <p className="text-[13px] leading-relaxed text-slate-600">
              {run.authorization.disclosure}
            </p>
          </div>
        </Panel>

        <Panel eyebrow="Policy boundary" title="Test a generation request">
          <p className="mb-5 text-[14px] leading-relaxed text-slate-600">
            Toluva evaluates language and purpose before any provider call. The
            completed German job can then be replayed directly from B2 without
            spending model credits.
          </p>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
              Target language
            </span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] text-ink"
              onChange={(event) => {
                setLanguage(event.target.value);
                reset();
              }}
              value={language}
            >
              {languages.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
              Publishing purpose
            </span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] text-ink"
              onChange={(event) => {
                setPurpose(event.target.value);
                reset();
              }}
              value={purpose}
            >
              {purposes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-5 rounded-2xl border border-slate-100 bg-cream p-4">
            <MetaLabel>Live authorization scope</MetaLabel>
            <strong className="block font-mono text-[13px] text-ink">
              DE-DE · INTERNAL TRAINING
            </strong>
            <small className="mt-1 block text-[12px] text-slate-500">
              Stock synthetic voice · valid through{" "}
              {dateLabel(run.authorization.expiresAt)}
            </small>
          </div>

          {state === "approved" && decision && (
            <div className="mb-5 rounded-2xl border border-fit-green/25 bg-fit-green-soft p-4">
              <strong className="block font-display text-[14px] text-fit-green">
                Authorized completed job found
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                {decision.reason} Loading the completed job reuses its verified
                B2 checkpoint; no provider runs again.
              </p>
              <code className="mt-2 block font-mono text-[12px] text-slate-600">
                Evidence {shortHash(decision.evidenceSha256)}
              </code>
            </div>
          )}

          {state === "blocked" && decision && (
            <div className="mb-5 rounded-2xl border border-fit-red/25 bg-fit-red-soft p-4">
              <strong className="block font-display text-[14px] text-fit-red">
                Generation blocked before provider call
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                {decision.reason} No billable provider was called.
              </p>
              <code className="mt-2 block font-mono text-[12px] text-slate-600">
                Decision {decision.code.replaceAll("_", " ")}
              </code>
            </div>
          )}

          {state === "error" && (
            <div className="mb-5 rounded-2xl border border-fit-red/25 bg-fit-red-soft p-4">
              <strong className="block font-display text-[14px] text-fit-red">
                Policy check stopped safely
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                Toluva could not verify the B2 authorization record, so it
                failed closed and made no provider call.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              className={buttonClass("primary")}
              disabled={state === "checking"}
              onClick={() => {
                if (state === "approved") {
                  void loadCompletedJob();
                } else {
                  void runCheck();
                }
              }}
            >
              {state === "checking"
                ? "Checking B2 policy…"
                : state === "approved"
                  ? "Load completed B2 job"
                  : "Check authorization"}
            </button>
            {state !== "idle" && (
              <button className={buttonClass("secondary")} onClick={reset}>
                Reset
              </button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
