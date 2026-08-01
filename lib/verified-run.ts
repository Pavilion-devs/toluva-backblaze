export type RunDataSource = "live-b2" | "verified-snapshot";

export type PipelineStage = {
  detail: string;
  name: string;
  state: "done" | "active" | "blocked";
};

export type RunAsset = {
  b2Key: string;
  kind: string;
  meta: string;
  name: string;
};

export type RunManifest = {
  canonicalHash: string;
  createdAt: string;
  model: string;
  name: string;
  provider: string;
  runId: string;
  stage: string;
  status: string;
};

export type TimingSegment = {
  action: string;
  attemptCount: number;
  band: string;
  driftRatio: number;
  driftSeconds: number;
  endSeconds: number;
  finalSeconds: number;
  generatedSeconds: number;
  id: string;
  sourceText: string;
  startSeconds: number;
  status: string;
  tempoFactor: number;
  translatedText: string;
  wordTimingCount: number;
};

export type TimingCorrectionAttempt = {
  attemptNumber: number;
  band: "red" | "green";
  canonicalHash: string;
  driftRatio: number;
  generatedSeconds: number;
  manifestVerified: boolean;
  parentRunId: string | null;
  provider: string;
  runId: string;
  storedAssetHashMatches: boolean;
  translatedText: string;
  wordTimingCount: number;
};

export type TimingCorrectionProof = {
  attempts: TimingCorrectionAttempt[];
  jobId: string;
  protectedTerms: string[];
  rewriteSource: string;
  selectedAttemptNumber: number;
  slotSeconds: number;
  totalGeneratedCharacters: number;
  verificationState: "verified-b2-archive";
};

export type VerifiedRun = {
  dataSource: RunDataSource;
  syncedAt: string;
  project: {
    id: string;
    title: string;
    sourceKind: string;
    sourceLanguage: string;
    developmentSample: boolean;
  };
  job: {
    id: string;
    language: string;
    status: string;
    version: string;
  };
  source: {
    b2Key: string;
    durationSeconds: number;
    sha256: string;
    text: string;
    transcriptKey: string;
    transcriptionModel: string;
    transcriptionProvider: string;
  };
  edition: {
    captionsEmbedded: boolean;
    captionsKey: string;
    code: string;
    finalAssetKey: string;
    finalDurationSeconds: number;
    finalSha256: string;
    localName: string;
    name: string;
    protectedTerms: string[];
    protectedTermsPreserved: boolean;
    translatedText: string;
    translationModel: string;
    translationProvider: string;
  };
  authorization: {
    allowedLanguages: string[];
    allowedPurposes: string[];
    approvedAt: string;
    approvedBy: string;
    code: string;
    disclosure: string;
    evidenceSha256: string;
    expiresAt: string;
    id: string;
    validFrom: string;
    voiceType: string;
  };
  timing: {
    action: string;
    attemptCount: number;
    band: string;
    driftRatio: number;
    driftSeconds: number;
    generatedCharacters: number;
    generatedSeconds: number;
    model: string;
    provider: string;
    segments: TimingSegment[];
    slotSeconds: number;
    status: string;
    tempoAdjustedSegmentIds: string[];
    wordTimingCount: number;
  };
  disclosure: {
    humanApprovalRequired: boolean;
    syntheticVoice: boolean;
    translationProvider: string;
    transcriptionProvider: string;
    voiceModel: string;
    voiceProvider: string;
    voiceType: string;
  };
  pipeline: PipelineStage[];
  manifests: RunManifest[];
  assets: RunAsset[];
  b2ObjectCount: number;
  timingCorrectionProof: TimingCorrectionProof;
};

const projectRoot =
  "projects/intake-57f5ca73b1fb4b4d97e85f94605f39e5";
const jobPrefix =
  `${projectRoot}/jobs/localize-c33715df7d024a27950560095077ff52/de-de`;
const sourcePrefix = `${projectRoot}/source`;
const sourceKey = `${sourcePrefix}/master/source-1cf1052fe04d4940a966aa7a640e71b9.mp4`;
const transcriptKey =
  `${sourcePrefix}/transcript/live-v1-localize-c33715df7d024a27950560095077ff52.json`;
const finalAssetKey =
  `${jobPrefix}/composition/live-v1/genblaze/runs/toluva-demo/2026-08-01/` +
  "cb37c234-725b-4b54-89de-49ee221f6299/assets/" +
  "c1041556-f8a0-4a24-9db4-6e477100a341.mp4";

function snapshotManifest(
  stage: string,
  provider: string,
  model: string,
  runId: string,
  canonicalHash: string,
  createdAt: string,
  name: string,
): RunManifest {
  return {
    canonicalHash,
    createdAt,
    model,
    name,
    provider,
    runId,
    stage,
    status: "completed",
  };
}

const timingSegments: TimingSegment[] = [
  {
    action: "pad_silence",
    attemptCount: 1,
    band: "amber",
    driftRatio: -0.08875193798449611,
    driftSeconds: -0.22898,
    endSeconds: 2.58,
    finalSeconds: 2.58,
    generatedSeconds: 2.35102,
    id: "segment-001",
    sourceText: "One video can reach every team.",
    startSeconds: 0,
    status: "padded",
    tempoFactor: 1,
    translatedText: "Ein Video kann jedes Team erreichen.",
    wordTimingCount: 6,
  },
  {
    action: "accept",
    attemptCount: 1,
    band: "green",
    driftRatio: 0.0448980952380951,
    driftSeconds: 0.141429,
    endSeconds: 5.73,
    finalSeconds: 3.15,
    generatedSeconds: 3.291429,
    id: "segment-002",
    sourceText: "Toluva keeps each synthetic voice authorized.",
    startSeconds: 2.58,
    status: "accepted",
    tempoFactor: 1.0448980952380952,
    translatedText: "Toluva hält jede synthetische Stimme autorisiert.",
    wordTimingCount: 6,
  },
  {
    action: "pad_silence",
    attemptCount: 1,
    band: "amber",
    driftRatio: -0.12521617581103298,
    driftSeconds: -0.837571,
    endSeconds: 12.419,
    finalSeconds: 6.689,
    generatedSeconds: 5.851429,
    id: "segment-003",
    sourceText:
      "When translated speech runs long, Toluva measures the drift and pauses for approved wording.",
    startSeconds: 5.73,
    status: "padded",
    tempoFactor: 1,
    translatedText:
      "Wenn übersetzte Sprache lange dauert, misst Toluva die Drift und pausiert für genehmigte Formulierungen.",
    wordTimingCount: 14,
  },
];

export const VERIFIED_RUN_SNAPSHOT: VerifiedRun = {
  dataSource: "verified-snapshot",
  syncedAt: "2026-08-01T01:08:05.241078Z",
  project: {
    id: "intake-57f5ca73b1fb4b4d97e85f94605f39e5",
    title: "One governed German edition",
    sourceKind: "Controlled 12.419-second engine-validation source",
    sourceLanguage: "English",
    developmentSample: true,
  },
  job: {
    id: "localize-c33715df7d024a27950560095077ff52",
    language: "de-DE",
    status: "completed",
    version: "live-v1",
  },
  source: {
    b2Key: sourceKey,
    durationSeconds: 12.419,
    sha256:
      "ca09bbdaf32fc1f9b87c3c41f843bde9a2720c5d6222bb1d3a048f27c0846c00",
    text:
      "One video can reach every team. Toluva keeps each synthetic voice authorized. When translated speech runs long, Toluva measures the drift and pauses for approved wording.",
    transcriptKey,
    transcriptionModel: "whisper-base-en",
    transcriptionProvider: "faster-whisper-local",
  },
  edition: {
    captionsEmbedded: true,
    captionsKey: `${jobPrefix}/captions/live-v1.vtt`,
    code: "de",
    finalAssetKey,
    finalDurationSeconds: 12.419,
    finalSha256:
      "369f3eea954c2bba91bd7a65cade78a86a9f9e1050cf915702e9a2da2e3917fe",
    localName: "Deutsch",
    name: "German",
    protectedTerms: ["Toluva"],
    protectedTermsPreserved: true,
    translatedText:
      "Ein Video kann jedes Team erreichen. Toluva hält jede synthetische Stimme autorisiert. Wenn übersetzte Sprache lange dauert, misst Toluva die Drift und pausiert für genehmigte Formulierungen.",
    translationModel: "translate-en_de-1_3",
    translationProvider: "argos-translate-offline",
  },
  authorization: {
    allowedLanguages: ["de-DE"],
    allowedPurposes: ["internal-training"],
    approvedAt: "2026-07-29T00:00:00+00:00",
    approvedBy: "toluva-spike-operator",
    code: "allowed",
    disclosure: "Synthetic stock voice used.",
    evidenceSha256:
      "577c35e2b7b11f22dd1882343089ee9a12b493692ca641f7d153e0e4bddf7137",
    expiresAt: "2026-08-12T00:00:00+00:00",
    id: "auth-stock-intake-v1",
    validFrom: "2026-07-29T00:00:00+00:00",
    voiceType: "stock",
  },
  timing: {
    action: "segment_silence_padding",
    attemptCount: 3,
    band: "amber",
    driftRatio: -0.12521617581103298,
    driftSeconds: -0.837571,
    generatedCharacters: 189,
    generatedSeconds: 11.493878,
    model: "eleven_flash_v2_5",
    provider: "elevenlabs-tts",
    segments: timingSegments,
    slotSeconds: 12.419,
    status: "ready_for_composition",
    tempoAdjustedSegmentIds: ["segment-002"],
    wordTimingCount: 26,
  },
  disclosure: {
    humanApprovalRequired: true,
    syntheticVoice: true,
    translationProvider: "argos-translate-offline",
    transcriptionProvider: "faster-whisper-local",
    voiceModel: "eleven_flash_v2_5",
    voiceProvider: "elevenlabs-tts",
    voiceType: "stock",
  },
  pipeline: [
    { name: "Ingest", detail: "Source stored in B2", state: "done" },
    { name: "Transcribe", detail: "3 timed segments", state: "done" },
    { name: "Translate", detail: "Toluva preserved", state: "done" },
    { name: "Authorize", detail: "Stock voice allowed", state: "done" },
    { name: "Time-fit QA", detail: "2 pad · 1 tempo-fit", state: "done" },
    { name: "Master", detail: "12.419s verified", state: "done" },
  ],
  manifests: [
    snapshotManifest(
      "Transcription",
      "faster-whisper-local",
      "whisper-base-en",
      "7732778e-9896-485d-b7b5-444e6ca1f618",
      "37ad7051048e384f8f0015a8d30276237d8a113873bd2d748f0c0ed18e8692e1",
      "2026-08-01T00:02:00.051958Z",
      "toluva-live-transcription",
    ),
    snapshotManifest(
      "Translation 1",
      "argos-translate-offline",
      "translate-en_de-1_3",
      "1b6f82d0-b2de-419b-87ef-6c8ab706efd1",
      "6e91cbdccdded676f7bfbb04464ea44eba218e01a58cc40f96de8befd8cfdeae",
      "2026-08-01T00:02:28.783288Z",
      "toluva-live-segment-translation",
    ),
    snapshotManifest(
      "Translation 2",
      "argos-translate-offline",
      "translate-en_de-1_3",
      "95935c74-f3a7-44e0-9ec7-c0fb301533c3",
      "e352ec7ae478eded4f0aa3827499206b8fc7f3f3bdb1754c4183f1c7d161b438",
      "2026-08-01T00:02:58.262346Z",
      "toluva-live-segment-translation",
    ),
    snapshotManifest(
      "Translation 3",
      "argos-translate-offline",
      "translate-en_de-1_3",
      "42868f7c-3aaf-4a6b-b082-25f37c9fb863",
      "27d5c7a394f5c06505dc7bbc462b1305af3c7e2bc9445717a82ed874a9474eba",
      "2026-08-01T00:03:27.897193Z",
      "toluva-live-segment-translation",
    ),
    snapshotManifest(
      "Speech 1",
      "elevenlabs-tts",
      "eleven_flash_v2_5",
      "0b880f4a-79eb-47db-b09b-57dafe7261ca",
      "a953beff5ee94411307f2cb0a1b8071f79fdfffe2565d85ac941ca08845f2d44",
      "2026-08-01T00:02:33.652266Z",
      "toluva-live-timing-correction",
    ),
    snapshotManifest(
      "Speech 2",
      "elevenlabs-tts",
      "eleven_flash_v2_5",
      "dc7c46c7-918e-4774-9075-9b0d3d65e6df",
      "b77cd7ab072c0c407320a00e6400e45588d490a9dfb83cc50442bba3d6912607",
      "2026-08-01T00:03:01.559079Z",
      "toluva-live-timing-correction",
    ),
    snapshotManifest(
      "Speech 3",
      "elevenlabs-tts",
      "eleven_flash_v2_5",
      "4181b050-7b33-42ec-9279-23edff14136b",
      "ad4d18834b8d2317916b31dc9718a95399a98066278b8d3a39db00738ab388a8",
      "2026-08-01T00:03:30.794721Z",
      "toluva-live-timing-correction",
    ),
    snapshotManifest(
      "Audio assembly",
      "toluva-segment-audio-assembler",
      "ffmpeg-segment-audio-v2",
      "d892a9a5-4e8f-4c68-92fa-41f46d87de9d",
      "9a88474b7e22886797a17b737d103e072b576351d81918516ac648b8b685833c",
      "2026-08-01T01:07:57.816928Z",
      "toluva-live-segment-audio-assembly",
    ),
    snapshotManifest(
      "Composition",
      "toluva-ffmpeg-compositor",
      "ffmpeg-captioned-mp4-v1",
      "cb37c234-725b-4b54-89de-49ee221f6299",
      "c7cb83e1db45df924dcc264a2a2d20ef85d6aa81863d7bc72ff2b77f65f9ea21",
      "2026-08-01T01:08:05.241078Z",
      "toluva-live-localized-composition",
    ),
  ],
  assets: [
    {
      b2Key: sourceKey,
      kind: "SOURCE",
      meta: "12.419s · SHA-256 verified",
      name: "source-1cf1052fe04d4940a966aa7a640e71b9.mp4",
    },
    {
      b2Key: transcriptKey,
      kind: "TRANSCRIPT",
      meta: "Whisper · 3 timed segments",
      name: "live-v1-localize-c33715df7d024a27950560095077ff52.json",
    },
    {
      b2Key: `${jobPrefix}/localized-audio/live-v1-tempo-fit-v2/genblaze/runs/toluva-demo/2026-08-01/d892a9a5-4e8f-4c68-92fa-41f46d87de9d/assets/cb854c81-6f73-422f-9120-023510a921b5.wav`,
      kind: "AUDIO",
      meta: "3-segment fan-in · bounded tempo-fit",
      name: "localized-audio.wav",
    },
    {
      b2Key: `${jobPrefix}/captions/live-v1.vtt`,
      kind: "CAPTIONS",
      meta: "WebVTT · embedded in final",
      name: "live-v1.vtt",
    },
    {
      b2Key: finalAssetKey,
      kind: "FINAL",
      meta: "12.419s · H.264 / AAC / mov_text",
      name: "localized-de.mp4",
    },
    {
      b2Key: `${jobPrefix}/disclosure/live-v1.json`,
      kind: "DISCLOSURE",
      meta: "Synthetic stock voice · approval required",
      name: "live-v1.json",
    },
    {
      b2Key: `${jobPrefix}/final/live-v1.json`,
      kind: "RECORD",
      meta: "Immutable controlled-proof record",
      name: "live-v1.json",
    },
  ],
  b2ObjectCount: 60,
  timingCorrectionProof: {
    attempts: [
      {
        attemptNumber: 1,
        band: "red",
        canonicalHash:
          "5d7a0390f080893324295c9b2a635490d79270e7acfb22ab28b63f6afbd7d9ed",
        driftRatio: 1.1386800000000001,
        generatedSeconds: 8.126984,
        manifestVerified: true,
        parentRunId: null,
        provider: "elevenlabs-tts",
        runId: "a9cc6c70-86ee-4e1c-8874-002c47c50c9a",
        storedAssetHashMatches: true,
        translatedText:
          "Willkommen bei Toluva. Mit unserer Plattform wird eine einzige Videobotschaft automatisch in vielen verschiedenen Sprachen verfügbar.",
        wordTimingCount: 16,
      },
      {
        attemptNumber: 2,
        band: "green",
        canonicalHash:
          "47743d1dca11711e286842019c33c2b82ac7b81eee09d6f9bebca37db1bd3644",
        driftRatio: -0.058980789473684146,
        generatedSeconds: 3.575873,
        manifestVerified: true,
        parentRunId: "a9cc6c70-86ee-4e1c-8874-002c47c50c9a",
        provider: "elevenlabs-tts",
        runId: "3e5cdd07-51e0-4784-90f0-f419b143f1c3",
        storedAssetHashMatches: true,
        translatedText: "Willkommen bei Toluva. Eine Botschaft, viele Sprachen.",
        wordTimingCount: 7,
      },
    ],
    jobId: "timing-red-green-v1",
    protectedTerms: ["Toluva"],
    rewriteSource: "human-reviewed-scripted-spike",
    selectedAttemptNumber: 2,
    slotSeconds: 3.8,
    totalGeneratedCharacters: 187,
    verificationState: "verified-b2-archive",
  },
};
