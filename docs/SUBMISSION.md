# Toluva submission facts

Last updated: August 1, 2026

## One-line pitch

Toluva turns one approved source video into time-aligned, consent-aware,
verifiable localized editions.

Source repository: <https://github.com/Pavilion-devs/toluva-backblaze>

## Submitted capability

The deployed release proves one English-to-German lane with server-enforced
voice authorization, protected terminology, segment-level timing QA, B2-backed
media lifecycle records, and Genblaze provenance.

## Required provider/model list

- Faster Whisper `base.en`, pinned model revision
- Argos Translate English-to-German package `1.3`
- ElevenLabs `eleven_flash_v2_5` stock voice via Genblaze
- Toluva FFmpeg audio assembler and compositor via Genblaze `SyncProvider`
- Backblaze B2 via Genblaze S3 sink and a server-only Native API bridge

## Judge flow

1. Open the public application without signing in.
2. Play the German localized edition and inspect captions/disclosure.
3. Open Timing QA and compare the red first attempt with the green corrected
   attempt.
4. Open Voice record, request French or public marketing, and observe a
   server-backed block before provider spend.
5. Inspect B2 assets and the nine-manifest Genblaze production run.

## Claims boundary

Toluva is evidence-ready, audit-friendly, and compliance-supporting. It does
not guarantee legal compliance, prove the truth of submitted consent facts,
support every language, or provide perfect lip sync.
