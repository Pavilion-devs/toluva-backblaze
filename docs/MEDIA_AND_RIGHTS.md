# Media and rights ledger

Last reviewed: August 3, 2026

This document separates engine evidence from final submission media so Toluva
does not imply rights or provenance it has not established.

## Project-authored material

- Toluva product copy, interface, diagrams, and source code were authored for
  this project.
- `docs/assets/toluva-architecture.svg` is an original, repository-authored
  diagram of the implemented Toluva topology. Its SHA-256 is
  `1e312b6f020e4bfbd9697fc0fd10756283dd2af9488748fcc24fcf25cc3e7a93`.
- `public/og.png` is an original Toluva social-preview asset.
- The controlled source composition, visual design, and English script were
  authored for Toluva under `work/videos/toluva-controlled-proof/`.
- No music, celebrity likeness, third-party footage, or external brand mark is
  included in the controlled proof.

## README banner

`docs/assets/toluva-readme-banner.png` was created for this repository with the
OpenAI image-generation tool from a Toluva-specific prompt, then cropped and
given the exact Toluva wordmark and tagline locally. The generated background
uses generic product-interface forms and a generated landscape frame; it does
not contain third-party footage, a real person's likeness, or a third-party
logo. Its SHA-256 is
`82caeca5e06018f53328ff784de4facbb6892f0ac16e98db7406c74d9a788d61`.

## Controlled engine source

The immutable engine source uses the macOS Samantha system voice as clearly
labelled development narration. It was created to exercise segmentation,
translation, timing QA, and composition. It is not treated as final marketing
or entrant-owned voice media.

Public judge mode therefore does not serve the source audio. It serves
`public/judge-source-muted.mp4`, an H.264 video-only derivative with SHA-256
`a5c45de244e38bfdad6f60996c375a43c77185e90e6de9c7148a5931cc86fb7f`.
The original source master remains private B2 engine evidence.

## Generated German media

- Voice type: ElevenLabs platform stock synthetic voice
- Model: `eleven_flash_v2_5`
- Authorization record: `auth-stock-intake-v1`
- Permitted lane recorded by Toluva: German (`de-DE`) internal training
- Synthetic-media disclosure: required and stored with the output
- Human approval before publication: required by the stored disclosure record

The public app describes this as a disclosed stock synthetic voice, not a clone
of the English development narrator.

## Timing-correction archive

The two German timing-attempt audio objects were generated through ElevenLabs
and Genblaze for Toluva. Both are served only as evidence of the measured
correction workflow. Their canonical manifest hashes, stored-byte hashes, and
parent/child run relationship are displayed in the product.

## Marketing hero walkthrough

The landing-page hero uses an entrant-recorded walkthrough of the real Toluva
application. The original 45.4-second ScreenStudio recording is retained by the
entrant as `toluvahero.mp4` with SHA-256
`6486707953e6756877c7e6029ff94915a6ad6aad2d8415c3fc2eb74b0ef96828`.

The public derivative is `public/toluva-product-walkthrough.mp4`: a 1920×1248,
30 fps, H.264, audio-free export with SHA-256
`f0e3b73630a46ead7f83ea373c01f5fa8328565b0558a91f3a8cca4d54542e72`.
Removing the source audio keeps the autoplay hero muted and prevents incidental
recording audio from becoming publication media. Its entrant-provided cover is
published as `public/toluva-product-walkthrough-cover.jpg` with SHA-256
`bddb66ebe190dcdedcd4d303ea3bc46f82eb9c2640a7b5b8f4c77c4c3eabb4b7`.

The walkthrough contains the Toluva interface and project-authored product
material. It does not replace or modify the separate B2-backed example-project
evidence.

## Final Devpost demo

The final demo is an entrant-created 1920×1080, 30 fps, 175.3-second H.264/AAC
film assembled from clean ScreenStudio recordings of the real Toluva product
and the entrant's natural narration. It contains no background music,
third-party footage, celebrity likeness, or macOS development narration. The
local production master is
`videos/toluva-devpost-demo/renders/toluva-devpost-demo-final.mp4`, SHA-256
`34db21792e92c93c5e9ef06fd494788f42ac8cf8762e6bfe5d8d940916139751`.
The `videos/` production workspace is deliberately excluded from the public
source repository. The entrant published the final master at
<https://youtu.be/UvJxSqS4j3Y>.

If the product later uses a new hero source featuring a person or voice, retain
the source file, permission record, allowed uses/languages, approver, validity
window, and evidence SHA-256 before publishing it.
