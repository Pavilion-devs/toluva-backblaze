# Toluva

Toluva is a governed video-localization workflow for enterprise training and
communications teams.

> One source. Multiple languages. Every voice authorized, every segment
> time-fit, and every output verifiable.

This repository currently contains the first interactive product scaffold. It
uses prepared demonstration data while the real Genblaze and Backblaze B2
vertical slice is validated.

## What the scaffold demonstrates

- A source video and its governed language editions
- Consent-bound synthetic-voice authorization
- A pre-generation policy block for an unauthorized language or purpose
- Segment-level timing-drift measurement
- A bounded rewrite/regeneration story
- Backblaze B2 asset-lifecycle visibility
- Genblaze run and provenance visibility

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` only when beginning the live provider
integration. Never commit credential values.

## Current boundaries

- The dashboard is interactive, but its media/run records are prepared demo
  data.
- No provider call is made from the current UI.
- The timing thresholds are product defaults to be validated through the first
  technical spike.
- Toluva is evidence-ready and compliance-supporting; it does not guarantee
  legal or regulatory compliance.

Read `AGENTS.md` before making changes. `plan.md` is the full product,
architecture, delivery, and submission source of truth.
