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
    code: string;
    disclosure: string;
    expiresAt: string;
    id: string;
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
    slotSeconds: number;
    status: string;
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
};

const projectPrefix =
  "projects/live-localization-project/jobs/english-to-german-v4/de-de";
const sourcePrefix = "projects/live-localization-project/source";

export const VERIFIED_RUN_SNAPSHOT: VerifiedRun = {
  dataSource: "verified-snapshot",
  syncedAt: "2026-07-29T13:21:13.271135Z",
  project: {
    id: "live-localization-project",
    title: "One message, many languages",
    sourceKind: "Locally generated development sample",
    sourceLanguage: "English",
    developmentSample: true,
  },
  job: {
    id: "english-to-german-v4",
    language: "de-DE",
    status: "completed",
    version: "live-v1",
  },
  source: {
    b2Key: `${sourcePrefix}/master/system-voice-source-v2.mp4`,
    durationSeconds: 4,
    sha256:
      "f5872bd6324abd57d5c0a534c11729989a9e3a5f10384783dc49d8a98c6ad41e",
    text: "Welcome to Toluva, One Message, Many Languages.",
    transcriptKey: `${sourcePrefix}/transcript/live-v1-english-to-german-v4.json`,
    transcriptionModel: "whisper-base-en",
    transcriptionProvider: "faster-whisper-local",
  },
  edition: {
    captionsEmbedded: true,
    captionsKey: `${projectPrefix}/captions/live-v1.vtt`,
    code: "de",
    finalAssetKey:
      `${projectPrefix}/composition/live-v1/genblaze/runs/toluva-demo/` +
      "2026-07-29/4136f395-4ecf-4f29-9a43-619203ee0adb/assets/" +
      "7b4e6b79-ddcc-4a77-82b1-95b62a762d1e.mp4",
    finalDurationSeconds: 4,
    finalSha256:
      "611924ce72726f686ead5cc71ccd131bf85d0a58ba5518605ebccfdc9e52ef2b",
    localName: "Deutsch",
    name: "German",
    protectedTerms: ["Toluva"],
    protectedTermsPreserved: true,
    translatedText:
      "Willkommen bei Toluva, eine Botschaft, viele Sprachen.",
    translationModel: "translate-en_de-1_3",
    translationProvider: "argos-translate-offline",
  },
  authorization: {
    allowedLanguages: ["de-DE"],
    allowedPurposes: ["internal-training"],
    approvedAt: "2026-07-29T00:00:00+00:00",
    code: "allowed",
    disclosure: "Synthetic stock voice used.",
    expiresAt: "2026-08-12T00:00:00+00:00",
    id: "auth-stock-live-v1",
    voiceType: "stock",
  },
  timing: {
    action: "pad_silence",
    attemptCount: 1,
    band: "amber",
    driftRatio: -0.11764175,
    driftSeconds: -0.470567,
    generatedCharacters: 54,
    generatedSeconds: 3.529433,
    model: "eleven_flash_v2_5",
    provider: "elevenlabs-tts",
    slotSeconds: 4,
    status: "padded",
    wordTimingCount: 7,
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
    { name: "Transcribe", detail: "Whisper word timing", state: "done" },
    { name: "Translate", detail: "Toluva preserved", state: "done" },
    { name: "Authorize", detail: "Policy allowed", state: "done" },
    { name: "Time-fit QA", detail: "Amber · padded", state: "done" },
    { name: "Master", detail: "4.000s verified", state: "done" },
  ],
  manifests: [
    {
      canonicalHash:
        "1ffc2d251cbd2ee22522982f282cfbe08ff32c6e96e656fb84709caeb83ad7a3",
      createdAt: "2026-07-29T13:20:27.542287Z",
      model: "whisper-base-en",
      name: "toluva-live-transcription",
      provider: "faster-whisper-local",
      runId: "87688e8f-e36d-4302-ada1-dc818627a271",
      stage: "Transcription",
      status: "completed",
    },
    {
      canonicalHash:
        "ce2211f24d243a4569614e007b33f6a927100d842886cae56ccadf599e4a9d52",
      createdAt: "2026-07-29T13:20:33.906545Z",
      model: "translate-en_de-1_3",
      name: "toluva-live-translation",
      provider: "argos-translate-offline",
      runId: "b29ca5f8-f1a6-40ed-a168-520da6c2d7d7",
      stage: "Translation",
      status: "completed",
    },
    {
      canonicalHash:
        "e8005032ef30844ec6c5b03d1db1a882cb88fd5a4c351a15b45e54037e0d0d71",
      createdAt: "2026-07-29T13:20:40.657515Z",
      model: "eleven_flash_v2_5",
      name: "toluva-live-timing-correction",
      provider: "elevenlabs-tts",
      runId: "b266c869-38c1-46eb-bb14-1750b0a11da8",
      stage: "Speech",
      status: "completed",
    },
    {
      canonicalHash:
        "e69e7033b550ecea2708c1a9e7b8ebe7f05a8651a1177b413e8410e71b408990",
      createdAt: "2026-07-29T13:21:13.271135Z",
      model: "ffmpeg-captioned-mp4-v1",
      name: "toluva-live-localized-composition",
      provider: "toluva-ffmpeg-compositor",
      runId: "4136f395-4ecf-4f29-9a43-619203ee0adb",
      stage: "Composition",
      status: "completed",
    },
  ],
  assets: [
    {
      b2Key: `${sourcePrefix}/master/system-voice-source-v2.mp4`,
      kind: "SOURCE",
      meta: "4.000s · SHA-256 verified",
      name: "system-voice-source-v2.mp4",
    },
    {
      b2Key: `${sourcePrefix}/transcript/live-v1-english-to-german-v4.json`,
      kind: "TRANSCRIPT",
      meta: "Whisper · timed segment",
      name: "live-v1-english-to-german-v4.json",
    },
    {
      b2Key:
        `${projectPrefix}/speech/segment-001/attempt-1/genblaze/runs/` +
        "toluva-demo/2026-07-29/b266c869-38c1-46eb-bb14-1750b0a11da8/" +
        "assets/ed2ec5ae-4e42-40a9-9f2c-c74390917245.mp3",
      kind: "AUDIO",
      meta: "3.529s · 7 word timings",
      name: "german-speech-attempt-1.mp3",
    },
    {
      b2Key: `${projectPrefix}/captions/live-v1.vtt`,
      kind: "CAPTIONS",
      meta: "WebVTT · embedded in final",
      name: "live-v1.vtt",
    },
    {
      b2Key:
        `${projectPrefix}/composition/live-v1/genblaze/runs/toluva-demo/` +
        "2026-07-29/4136f395-4ecf-4f29-9a43-619203ee0adb/assets/" +
        "7b4e6b79-ddcc-4a77-82b1-95b62a762d1e.mp4",
      kind: "FINAL",
      meta: "4.000s · H.264 / AAC / mov_text",
      name: "localized-de.mp4",
    },
    {
      b2Key: `${projectPrefix}/final/live-v1.json`,
      kind: "RECORD",
      meta: "45-field durable run record",
      name: "live-v1.json",
    },
  ],
  b2ObjectCount: 16,
};
