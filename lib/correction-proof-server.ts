import "server-only";

import { proxyB2ProjectObject } from "./b2-server";

const CORRECTION_AUDIO_KEYS = {
  1:
    "projects/spike-project/jobs/timing-red-green-v1/de-de/speech/" +
    "segment-001/attempt-1/genblaze/runs/toluva-demo/2026-07-29/" +
    "a9cc6c70-86ee-4e1c-8874-002c47c50c9a/assets/" +
    "9a886a1e-719e-4021-b7fa-4f323282d56e.mp3",
  2:
    "projects/spike-project/jobs/timing-red-green-v1/de-de/speech/" +
    "segment-001/attempt-2/genblaze/runs/toluva-demo/2026-07-29/" +
    "3e5cdd07-51e0-4784-90f0-f419b143f1c3/assets/" +
    "d56fca7a-255d-43ab-8e5b-6170fa1e8385.mp3",
} as const;

export function isCorrectionAttempt(value: number): value is 1 | 2 {
  return value === 1 || value === 2;
}

export function correctionProofAudio(
  attempt: 1 | 2,
  range?: string | null,
): Promise<Response> {
  return proxyB2ProjectObject(CORRECTION_AUDIO_KEYS[attempt], range);
}
