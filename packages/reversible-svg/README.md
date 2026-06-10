# @sound-vector/reversible-svg

Reversible SVG codec package for Sound Vector.

This package holds the first reusable `audio -> SVG -> audio` layer, including the `metadata#mmfr-reversible`, `pcm_reversible_waveform`, and `pcm_reversible_data` contracts.

The current direction is geometry-first: PCM sample values should be recoverable from visible SVG coordinates, while `data-*` attributes describe only structure such as encoding version, sample rate, duration, and amplitude scale. Source URLs, file names, and full feature bodies should remain outside the default SVG export.

`pcm_reversible_data` is a locked visible micro-weave / seal-band layer. It is part of the artwork, but it is not an editable decoration layer.

## Current API

```js
import {
  decodePcmBytesFromProtectedLayer,
  encodePcmBytesToProtectedLayer,
  inspectReversibleSvg
} from "@sound-vector/reversible-svg";

const layer = encodePcmBytesToProtectedLayer(Uint8Array.from([0, 128, 255]));
const svg = `<svg xmlns="http://www.w3.org/2000/svg">${layer}</svg>`;
const restored = decodePcmBytesFromProtectedLayer(svg);
const report = inspectReversibleSvg(svg);
```

The demo app still contains the fuller experimental encoder while this package is being expanded into the stable codec.
