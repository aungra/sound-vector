# Sound Vector

Sound Vector is an open-source prototype for turning audio into editable SVG artwork, then restoring a compact audio sketch back from the SVG geometry.

The project explores a reversible design format for music, print, archives, and creative tools: visible SVG layers can be edited for T-shirt graphics, while a protected `pcm_reversible_data` geometry layer keeps enough PCM information to reconstruct sound without storing the source audio file as a separate asset.

## Why This Exists

Audio tools usually export either sound or visuals. This project treats SVG as a shared medium for both:

- analyze an audio file or permitted YouTube source;
- map RMS, bass, spectral centroid, chroma, onset, tempo, waveform, and time structure into SVG layers;
- let designers edit the visible black-and-white artwork in Illustrator;
- preserve reversible PCM data in a locked or hidden SVG layer;
- import the SVG later and reconstruct an audio sketch from its geometry.

The long-term goal is a small, documented, inspectable format for reversible audio graphics that artists, archivists, educators, and creative-coding projects can build on.

## Current Prototype

- Single-file browser demo: [apps/demo/MUSIC MEMORY FITTING ROOM.html](apps/demo/MUSIC%20MEMORY%20FITTING%20ROOM.html)
- Next.js app routes for exhibition workflows: `/`, `/works/[id]`, `/screen`, `/admin`
- Local audio-file analysis in the browser
- Optional local YouTube analysis server for rights-cleared sources
- Reversible SVG export with `metadata`, visible PCM carrier layers, and protected PCM geometry
- Reversible SVG import that reads `pcm_reversible_data` first
- Illustrator-oriented layer templates in [docs/design-format](docs/design-format)
- Preview generators for comparing different audio-to-form engines

## Monorepo Structure

```text
sound-vector/
  packages/
    audio-analysis/      Audio judgement and feature extraction contracts
    reversible-svg/      Reversible SVG schema and codec contracts
    sound-vector-cli/    Planned audio-to-svg, svg-to-audio, and inspect CLI
  apps/
    demo/                Exhibition app and standalone browser prototype
  docs/
    design-format/       Illustrator layer templates and format guide
    ROADMAP.md
```

## Reversible SVG Format

Generated reversible SVGs avoid putting the PCM body into one large metadata string.

- `metadata#mmfr-reversible` stores a minimal format declaration and restoration policy.
- `pcm_reversible_waveform` is the visible carrier layer. Designers may redraw or distort it.
- `pcm_reversible_data` is the protected restoration layer. Keep it locked, hidden, and unedited.
- Import reads the protected geometry layer first, then falls back to visible carrier geometry where needed.
- Source URLs, video IDs, local file names, and full feature bodies are not embedded in default reversible SVG exports.

See [docs/design-format/README.md](docs/design-format/README.md) for the Illustrator layer rules.

## Quick Start

Install dependencies and run the Next.js prototype:

```bash
npm install
npm run dev
```

Run the optional audio analysis server:

```bash
npm run audio-server
```

The standalone HTML demo also works directly in a browser:

```text
apps/demo/MUSIC MEMORY FITTING ROOM.html
```

## Finder Workflow

For a no-terminal local exhibition setup:

- double-click `apps/demo/Open MUSIC MEMORY FITTING ROOM.app`, or
- open `apps/demo/MUSIC MEMORY FITTING ROOM.html` directly.

For YouTube analysis of permitted sources:

- double-click `apps/demo/Install Audio Tools.command` once;
- double-click `apps/demo/Start Audio Analysis Server.command` each time;
- keep the terminal window open;
- use `http://127.0.0.1:4194/api/audio-analyze` from the HTML app.

Use YouTube fetching only for sources where you have rights and where the platform terms allow it.

## Repository Map

- [apps/demo/MUSIC MEMORY FITTING ROOM.html](apps/demo/MUSIC%20MEMORY%20FITTING%20ROOM.html): standalone reversible SVG demo
- [apps/demo/app](apps/demo/app): Next.js exhibition app
- [apps/demo/scripts/audio-analysis-server.mjs](apps/demo/scripts/audio-analysis-server.mjs): local analysis endpoint
- [apps/demo/scripts/generate-audio-pattern-preview.mjs](apps/demo/scripts/generate-audio-pattern-preview.mjs): SVG preview generator
- [packages/audio-analysis](packages/audio-analysis): audio judgement package boundary
- [packages/reversible-svg](packages/reversible-svg): reversible SVG package boundary
- [packages/sound-vector-cli](packages/sound-vector-cli): planned CLI package
- [docs/design-format](docs/design-format): Illustrator layer templates and format guide
- [apps/demo/images](apps/demo/images): generated SVG previews and reports
- [docs](docs): application notes and roadmap

## Development

```bash
npm run typecheck
npm run build
```

The app currently uses local demo data and `localStorage`. A server-backed version can replace the read/write functions in [apps/demo/lib/store.ts](apps/demo/lib/store.ts) while keeping the same exported function names.

## Open Source Goals

This repository is being prepared as an open-source project for reversible audio SVG tooling. Near-term work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md):

- extract the reversible SVG codec from the single-file demo into a tested library;
- publish small fixture SVGs and expected decoded audio-sketch metrics;
- define a stable `sound-vector-svg` schema;
- add CLI commands for `audio -> svg`, `svg -> audio`, and `svg inspect`;
- document compatibility with Illustrator and browser SVG parsers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues that include a small audio fixture, exported SVG, or reproduction steps are especially helpful.

## License

MIT. See [LICENSE](LICENSE).
