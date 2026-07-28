"use client";

import { useMemo, useState } from "react";

type WorkspaceTab = "timeline" | "assets" | "provenance";
type LanguageCode = "fr" | "es" | "de" | "ja";

const languages: Array<{
  code: LanguageCode;
  name: string;
  localName: string;
  status: "ready" | "review" | "blocked";
  progress: number;
  detail: string;
}> = [
  {
    code: "fr",
    name: "French",
    localName: "Français",
    status: "ready",
    progress: 100,
    detail: "Approved · v3",
  },
  {
    code: "es",
    name: "Spanish",
    localName: "Español",
    status: "ready",
    progress: 100,
    detail: "Approved · v3",
  },
  {
    code: "de",
    name: "German",
    localName: "Deutsch",
    status: "review",
    progress: 96,
    detail: "1 segment to review",
  },
  {
    code: "ja",
    name: "Japanese",
    localName: "日本語",
    status: "blocked",
    progress: 0,
    detail: "Outside consent scope",
  },
];

const segments = [
  {
    id: "S-01",
    range: "00:00.0 – 00:04.8",
    source: "Welcome to the leadership onboarding program.",
    translation: "Willkommen beim Onboarding-Programm für Führungskräfte.",
    slot: "4.8s",
    first: "6.1s",
    final: "5.0s",
    drift: "+4.2%",
    state: "fit",
    attempts: 2,
  },
  {
    id: "S-02",
    range: "00:04.8 – 00:09.6",
    source: "We built this course around three operating principles.",
    translation: "Dieser Kurs folgt drei klaren Arbeitsprinzipien.",
    slot: "4.8s",
    first: "4.5s",
    final: "4.5s",
    drift: "−6.3%",
    state: "fit",
    attempts: 1,
  },
  {
    id: "S-03",
    range: "00:09.6 – 00:15.2",
    source: "Clarity, ownership, and trust guide every decision.",
    translation: "Klarheit, Verantwortung und Vertrauen leiten jede Entscheidung.",
    slot: "5.6s",
    first: "6.7s",
    final: "6.2s",
    drift: "+10.7%",
    state: "review",
    attempts: 3,
  },
  {
    id: "S-04",
    range: "00:15.2 – 00:20.0",
    source: "Let’s begin with clarity.",
    translation: "Beginnen wir mit Klarheit.",
    slot: "4.8s",
    first: "3.9s",
    final: "4.2s",
    drift: "−12.5%",
    state: "fit",
    attempts: 2,
  },
];

const assets = [
  {
    kind: "SOURCE",
    name: "leadership-onboarding-master.mp4",
    meta: "84.2 MB · SHA-256 verified",
  },
  {
    kind: "TRANSCRIPT",
    name: "transcript-en-v3.json",
    meta: "20 segments · word timestamps",
  },
  {
    kind: "AUDIO",
    name: "de-DE-final.wav",
    meta: "48 kHz · 20 accepted segments",
  },
  {
    kind: "CAPTIONS",
    name: "de-DE-final.vtt",
    meta: "20 cues · 00:01:32",
  },
  {
    kind: "FINAL",
    name: "leadership-onboarding-de-v3.mp4",
    meta: "91.8 MB · B2 durable asset",
  },
  {
    kind: "MANIFEST",
    name: "run_01J7TOLUVA.manifest.json",
    meta: "Genblaze · canonical hash valid",
  },
];

const manifestRows = [
  ["Run", "run_01J7TOLUVA"],
  ["Pipeline", "localize-video-v0.1"],
  ["Provider", "ElevenLabs"],
  ["Model", "eleven_multilingual_v2"],
  ["Voice", "cloned · authorization required"],
  ["Parent attempts", "5"],
  ["B2 objects", "47"],
  ["Canonical hash", "90b9…b84e"],
];

function StatusMark({
  status,
}: {
  status: "ready" | "review" | "blocked";
}) {
  return (
    <span className={`status-mark status-${status}`} aria-label={status}>
      <span className="status-dot" />
      {status === "ready"
        ? "Ready"
        : status === "review"
          ? "Review"
          : "Blocked"}
    </span>
  );
}

export function ToluvaApp() {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("timeline");
  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>("de");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestedLanguage, setRequestedLanguage] =
    useState<LanguageCode>("de");
  const [purpose, setPurpose] = useState("internal-training");
  const [authorizationResult, setAuthorizationResult] = useState<
    "idle" | "approved" | "blocked"
  >("idle");

  const selectedLanguage = useMemo(
    () => languages.find((language) => language.code === activeLanguage)!,
    [activeLanguage],
  );

  function runAuthorizationCheck() {
    if (requestedLanguage === "ja" || purpose === "public-marketing") {
      setAuthorizationResult("blocked");
      return;
    }

    setAuthorizationResult("approved");
  }

  function resetDialog() {
    setDialogOpen(false);
    setAuthorizationResult("idle");
    setRequestedLanguage("de");
    setPurpose("internal-training");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <span className="brand-name">TOLUVA</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="nav-link nav-link-active" href="#project">
            <span className="nav-icon" aria-hidden="true">
              ◫
            </span>
            Project
          </a>
          <a className="nav-link" href="#editions">
            <span className="nav-icon" aria-hidden="true">
              ◎
            </span>
            Editions
            <span className="nav-count">4</span>
          </a>
          <a className="nav-link" href="#voices">
            <span className="nav-icon" aria-hidden="true">
              ≋
            </span>
            Voices
          </a>
          <a className="nav-link" href="#assets">
            <span className="nav-icon" aria-hidden="true">
              ◇
            </span>
            Asset vault
          </a>
        </nav>

        <div className="sidebar-section">
          <p className="sidebar-label">Current project</p>
          <div className="current-project">
            <span className="project-thumb" aria-hidden="true">
              <span>Q3</span>
            </span>
            <span>
              <strong>Leadership onboarding</strong>
              <small>Source · English</small>
            </span>
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">
            AO
          </span>
          <span>
            <strong>Amara Okafor</strong>
            <small>Demo workspace</small>
          </span>
          <button className="icon-button" aria-label="Workspace menu">
            ···
          </button>
        </div>
      </aside>

      <main className="main-content" id="project">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Projects</span>
            <span aria-hidden="true">/</span>
            <strong>Leadership onboarding — Q3</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill">
              <span className="live-dot" />
              PREPARED DEMO
            </span>
            <button
              className="button button-primary"
              onClick={() => setDialogOpen(true)}
            >
              <span aria-hidden="true">＋</span>
              New localization
            </button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="project-intro" aria-labelledby="project-title">
            <div>
              <div className="eyebrow-row">
                <span className="eyebrow">ACTIVE PROJECT</span>
                <span className="version-chip">SOURCE v3</span>
              </div>
              <h1 id="project-title">Leadership onboarding — Q3</h1>
              <p>
                One approved source. Four governed language editions. Every
                voice authorization, timing decision, and output stays attached
                to its lineage.
              </p>
            </div>
            <div className="project-actions">
              <button className="button button-secondary">Compare editions</button>
              <button
                className="button button-quiet"
                onClick={() => setWorkspaceTab("provenance")}
              >
                View provenance
              </button>
            </div>
          </section>

          <section className="overview-grid" aria-label="Project overview">
            <article className="source-card">
              <div className="source-preview" aria-label="Source video preview">
                <div className="preview-scanline" />
                <span className="preview-kicker">TOLUVA TRAINING</span>
                <strong>Leading with clarity</strong>
                <span className="preview-caption">
                  Source master · 01:32 · English
                </span>
                <button className="play-button" aria-label="Play source preview">
                  ▶
                </button>
                <div className="preview-wave" aria-hidden="true">
                  {Array.from({ length: 34 }).map((_, index) => (
                    <i
                      key={index}
                      style={{
                        height: `${14 + ((index * 17) % 34)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="source-meta">
                <div>
                  <span className="meta-label">SOURCE MASTER</span>
                  <strong>leadership-onboarding-v3.mp4</strong>
                  <small>84.2 MB · Uploaded 11 minutes ago</small>
                </div>
                <span className="verified-chip">✓ SHA-256 VERIFIED</span>
              </div>
            </article>

            <article className="control-card">
              <div className="control-heading">
                <div>
                  <span className="meta-label">VOICE CONTROL</span>
                  <h2>Amara — Executive voice</h2>
                </div>
                <span className="authorization-seal" aria-label="Authorized">
                  ✓
                </span>
              </div>

              <dl className="authorization-list">
                <div>
                  <dt>Voice type</dt>
                  <dd>Consent-bound clone</dd>
                </div>
                <div>
                  <dt>Approved use</dt>
                  <dd>Internal training</dd>
                </div>
                <div>
                  <dt>Languages</dt>
                  <dd>FR · ES · DE</dd>
                </div>
                <div>
                  <dt>Valid through</dt>
                  <dd>30 Sep 2026</dd>
                </div>
              </dl>

              <button
                className="authorization-link"
                onClick={() => setDialogOpen(true)}
              >
                Test authorization boundary
                <span aria-hidden="true">→</span>
              </button>
            </article>
          </section>

          <section className="metric-grid" aria-label="Project metrics">
            <article className="metric-card">
              <span>LANGUAGE EDITIONS</span>
              <strong>4</strong>
              <small>3 ready · 1 governed block</small>
            </article>
            <article className="metric-card">
              <span>TIME-FIT RATE</span>
              <strong>95%</strong>
              <small className="metric-positive">↑ 18 pts after retries</small>
            </article>
            <article className="metric-card">
              <span>B2 OBJECTS</span>
              <strong>47</strong>
              <small>Source · attempts · finals · manifests</small>
            </article>
            <article className="metric-card metric-card-alert">
              <span>NEEDS REVIEW</span>
              <strong>1</strong>
              <small>German · segment S-03</small>
            </article>
          </section>

          <section className="production-grid">
            <article className="panel pipeline-panel">
              <div className="panel-heading">
                <div>
                  <span className="meta-label">PRODUCTION RUN</span>
                  <h2>Localization pipeline</h2>
                </div>
                <span className="run-id">RUN_01J7TOLUVA</span>
              </div>

              <div className="pipeline-track">
                {[
                  ["01", "Ingest", "Stored in B2", "done"],
                  ["02", "Transcribe", "20 segments", "done"],
                  ["03", "Localize", "3 languages", "done"],
                  ["04", "Time-fit QA", "1 review", "active"],
                  ["05", "Master", "3 outputs", "done"],
                  ["06", "Disclose", "Manifests ready", "done"],
                ].map(([number, title, detail, state]) => (
                  <div className={`pipeline-step step-${state}`} key={number}>
                    <span className="step-node">
                      {state === "done" ? "✓" : number}
                    </span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                ))}
              </div>

              <div className="pipeline-footer">
                <span>
                  <i className="legend-dot legend-genblaze" />
                  Orchestrated with Genblaze
                </span>
                <span>
                  <i className="legend-dot legend-b2" />
                  Assets durable in Backblaze B2
                </span>
                <button onClick={() => setWorkspaceTab("provenance")}>
                  Inspect run →
                </button>
              </div>
            </article>

            <article className="panel editions-panel" id="editions">
              <div className="panel-heading">
                <div>
                  <span className="meta-label">OUTPUTS</span>
                  <h2>Language editions</h2>
                </div>
                <button
                  className="icon-button bordered"
                  aria-label="Language edition menu"
                >
                  ···
                </button>
              </div>

              <div className="edition-list">
                {languages.map((language) => (
                  <button
                    className={`edition-row ${
                      activeLanguage === language.code ? "edition-active" : ""
                    }`}
                    key={language.code}
                    onClick={() => {
                      setActiveLanguage(language.code);
                      setWorkspaceTab("timeline");
                    }}
                  >
                    <span className={`language-code language-${language.code}`}>
                      {language.code.toUpperCase()}
                    </span>
                    <span className="language-name">
                      <strong>{language.name}</strong>
                      <small>{language.localName}</small>
                    </span>
                    <span className="language-result">
                      <StatusMark status={language.status} />
                      <small>{language.detail}</small>
                    </span>
                    <span className="row-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="panel workbench" id="assets">
            <div className="workbench-heading">
              <div>
                <span className="meta-label">QUALITY & LINEAGE</span>
                <h2>Production workbench</h2>
              </div>
              <div className="tab-list" role="tablist" aria-label="Workbench">
                {(
                  [
                    ["timeline", "Timing QA"],
                    ["assets", "B2 assets"],
                    ["provenance", "Provenance"],
                  ] as Array<[WorkspaceTab, string]>
                ).map(([tab, label]) => (
                  <button
                    aria-selected={workspaceTab === tab}
                    className={workspaceTab === tab ? "tab-active" : ""}
                    key={tab}
                    onClick={() => setWorkspaceTab(tab)}
                    role="tab"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {workspaceTab === "timeline" && (
              <div className="timeline-view">
                <div className="timeline-summary">
                  <div>
                    <span className="language-code language-de">
                      {selectedLanguage.code.toUpperCase()}
                    </span>
                    <span>
                      <strong>{selectedLanguage.name} timing report</strong>
                      <small>
                        Actual speech duration measured against source slots
                      </small>
                    </span>
                  </div>
                  <div className="fit-legend">
                    <span>
                      <i className="fit-green" /> ≤ 8% fit
                    </span>
                    <span>
                      <i className="fit-amber" /> 8–15% review
                    </span>
                    <span>
                      <i className="fit-red" /> &gt; 15% retry
                    </span>
                  </div>
                </div>

                <div className="segment-table">
                  <div className="segment-row segment-header">
                    <span>Segment</span>
                    <span>Source / final translation</span>
                    <span>Slot</span>
                    <span>First try</span>
                    <span>Final</span>
                    <span>Drift</span>
                  </div>
                  {segments.map((segment) => (
                    <div
                      className={`segment-row segment-${segment.state}`}
                      key={segment.id}
                    >
                      <span className="segment-id">
                        <strong>{segment.id}</strong>
                        <small>{segment.range}</small>
                      </span>
                      <span className="segment-copy">
                        <small>{segment.source}</small>
                        <strong>{segment.translation}</strong>
                      </span>
                      <span>{segment.slot}</span>
                      <span className="first-attempt">
                        {segment.first}
                        {segment.attempts > 1 && (
                          <small>{segment.attempts} attempts</small>
                        )}
                      </span>
                      <span>{segment.final}</span>
                      <span
                        className={`drift-pill drift-${segment.state}`}
                        title={`${segment.attempts} generation attempt${
                          segment.attempts === 1 ? "" : "s"
                        }`}
                      >
                        {segment.drift}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="correction-note">
                  <span className="correction-icon">↻</span>
                  <div>
                    <strong>S-01 corrected automatically</strong>
                    <p>
                      First speech attempt exceeded its 4.8-second source slot
                      by 27.1%. Toluva requested a shorter translation,
                      preserved “Onboarding,” regenerated, and reached +4.2%.
                    </p>
                  </div>
                  <span className="lineage-chip">2 LINKED ATTEMPTS</span>
                </div>
              </div>
            )}

            {workspaceTab === "assets" && (
              <div className="assets-view">
                <div className="storage-banner">
                  <div className="storage-mark" aria-hidden="true">
                    B2
                  </div>
                  <div>
                    <strong>Backblaze B2 is the project system of record</strong>
                    <p>
                      Source, intermediate attempts, final editions, disclosures,
                      and manifests remain attached to this production run.
                    </p>
                  </div>
                  <span>47 OBJECTS · 412 MB</span>
                </div>
                <div className="asset-grid">
                  {assets.map((asset) => (
                    <article className="asset-card" key={asset.name}>
                      <span className="asset-kind">{asset.kind}</span>
                      <strong>{asset.name}</strong>
                      <small>{asset.meta}</small>
                      <button aria-label={`Inspect ${asset.name}`}>→</button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {workspaceTab === "provenance" && (
              <div className="provenance-view">
                <div className="manifest-card">
                  <div className="manifest-header">
                    <div>
                      <span className="manifest-check">✓</span>
                      <span>
                        <strong>Canonical manifest verified</strong>
                        <small>
                          Output bytes match the recorded Genblaze lineage
                        </small>
                      </span>
                    </div>
                    <span className="verified-chip">VALID</span>
                  </div>
                  <dl>
                    {manifestRows.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="consent-card" id="voices">
                  <span className="meta-label">AUTHORIZATION RECORD</span>
                  <h3>voice_auth_01J7AMARA</h3>
                  <p>
                    Authorized for internal training in French, Spanish, and
                    German through 30 September 2026.
                  </p>
                  <div className="consent-chain">
                    <span>Evidence hash</span>
                    <code>8e12d5…4a90</code>
                  </div>
                  <div className="consent-chain">
                    <span>Approval</span>
                    <code>29 Jul 2026 · A. Okafor</code>
                  </div>
                  <button
                    className="button button-secondary full-width"
                    onClick={() => setDialogOpen(true)}
                  >
                    Test policy boundary
                  </button>
                </div>
              </div>
            )}
          </section>

          <footer className="product-footer">
            <span>Toluva scaffold · prepared demonstration data</span>
            <span>
              Authorized <i /> Time-fit <i /> Verifiable
            </span>
          </footer>
        </div>
      </main>

      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="new-localization-title"
            aria-modal="true"
            className="dialog"
            role="dialog"
          >
            <div className="dialog-header">
              <div>
                <span className="meta-label">PRE-FLIGHT CONTROL</span>
                <h2 id="new-localization-title">New localization</h2>
              </div>
              <button
                aria-label="Close new localization dialog"
                className="dialog-close"
                onClick={resetDialog}
              >
                ×
              </button>
            </div>

            <p className="dialog-intro">
              Toluva checks the selected language and purpose against the voice
              authorization before any billable generation begins.
            </p>

            <label className="field">
              <span>Target language</span>
              <select
                onChange={(event) => {
                  setRequestedLanguage(event.target.value as LanguageCode);
                  setAuthorizationResult("idle");
                }}
                value={requestedLanguage}
              >
                <option value="de">German — Deutsch</option>
                <option value="fr">French — Français</option>
                <option value="es">Spanish — Español</option>
                <option value="ja">Japanese — 日本語</option>
              </select>
            </label>

            <label className="field">
              <span>Publishing purpose</span>
              <select
                onChange={(event) => {
                  setPurpose(event.target.value);
                  setAuthorizationResult("idle");
                }}
                value={purpose}
              >
                <option value="internal-training">Internal training</option>
                <option value="customer-education">Customer education</option>
                <option value="public-marketing">Public marketing</option>
              </select>
            </label>

            <div className="policy-scope">
              <span>AUTHORIZATION SCOPE</span>
              <strong>FR · ES · DE</strong>
              <small>Internal training only · valid through 30 Sep 2026</small>
            </div>

            {authorizationResult === "approved" && (
              <div className="authorization-result result-approved">
                <span>✓</span>
                <div>
                  <strong>Authorized to proceed</strong>
                  <p>
                    The selected request is within language, purpose, and time
                    scope.
                  </p>
                </div>
              </div>
            )}

            {authorizationResult === "blocked" && (
              <div className="authorization-result result-blocked">
                <span>!</span>
                <div>
                  <strong>Generation blocked before provider call</strong>
                  <p>
                    This voice authorization does not cover{" "}
                    {requestedLanguage === "ja"
                      ? "Japanese"
                      : "public marketing"}
                    . Obtain a new approval or choose an allowed request.
                  </p>
                </div>
              </div>
            )}

            <div className="dialog-actions">
              <button className="button button-quiet" onClick={resetDialog}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={runAuthorizationCheck}
              >
                {authorizationResult === "approved"
                  ? "Create governed job"
                  : "Check authorization"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
