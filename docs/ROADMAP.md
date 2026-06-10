# Roadmap

## Phase 1: OSS Readiness

- Keep the repository public and licensed.
- Move reversible SVG encode/decode code out of the standalone HTML file.
- Add fixture SVGs that can be decoded in CI.
- Document the `mmfr.reversible-svg.v1` schema.
- Add small examples for browser, Node.js, and Illustrator workflows.

## Phase 2: Codec Library

- Provide a typed `sound-vector-svg` package.
- Implement `encodeAudioToSvg(audio, options)`.
- Implement `decodeAudioFromSvg(svg, options)`.
- Implement `inspectSvg(svg)` for schema and layer validation.
- Add round-trip tests for mu-law PCM sketch geometry.

## Phase 3: CLI

- `sound-vector audio-to-svg input.wav output.svg`
- `sound-vector svg-to-audio input.svg output.wav`
- `sound-vector inspect input.svg`
- `sound-vector fixtures verify`

## Phase 4: Interoperability

- Test round trips after Illustrator save/export.
- Test browser DOMParser, Node XML parsers, and common SVG optimizers.
- Define which layers may be edited, hidden, optimized, or removed.
- Publish compatibility notes and recommended SVG optimizer settings.

## Phase 5: Community

- Add good first issues for parser tests, docs, and small fixtures.
- Publish a design-format gallery.
- Invite audio, SVG, creative-coding, and archive communities to test the format.
- Collect real-world failure cases as fixtures.
