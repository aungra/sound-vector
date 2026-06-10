# Contributing

Thanks for helping build Sound Vector Fitting Room.

## Useful Contributions

- Reversible SVG files that fail to decode.
- Audio fixtures with clear rights for open-source testing.
- Illustrator or SVG optimizer compatibility reports.
- Tests for encode/decode round trips.
- Documentation improvements for designers and creative coders.

## Local Development

```bash
npm install
npm run typecheck
npm run build
```

Run the standalone audio server when testing YouTube or server-side analysis flows:

```bash
npm run audio-server
```

## Issue Reports

Please include:

- what you expected;
- what happened;
- the browser or Node.js version;
- the SVG file or a minimal excerpt;
- whether the SVG was edited in Illustrator or optimized.

Do not attach copyrighted audio unless you have rights to share it.

## Pull Requests

Keep pull requests small when possible. For codec changes, include a fixture or a test that shows the round trip behavior.
