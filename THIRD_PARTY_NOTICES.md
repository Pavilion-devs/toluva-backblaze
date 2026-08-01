# Third-party notices

Toluva depends on open-source packages and hosted services. Their trademarks,
licenses, and service terms remain the property of their respective owners.

Key runtime dependencies include:

- Backblaze B2 and the Backblaze Native/S3-compatible APIs
- Genblaze (`genblaze-core`, `genblaze-s3`, `genblaze-elevenlabs`)
- ElevenLabs speech generation
- Faster Whisper and the Systran `faster-whisper-base.en` model
- Argos Translate and the English-to-German `1.3` model package
- FFmpeg
- Next.js, Vinext, React, and Cloudflare Workers-compatible tooling

This repository does not redistribute model weights. Exact Python and
JavaScript dependency versions are recorded in `services/pipeline/uv.lock` and
`package-lock.json`.

The name Backblaze, Genblaze, ElevenLabs, Apple, and other third-party names are
used only to identify interoperability or provenance. No endorsement is
claimed.
