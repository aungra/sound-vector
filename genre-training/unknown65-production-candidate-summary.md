# Unknown-source exhibition candidate

## Result

The fixed 1,883-track source-heldout cohort reached **65.59% Top1**. The
independent GTZAN safety set remains at **77.39% Top1** after the exhibition
residual stages are applied.

| metric | previous production | exhibition candidate |
|---|---:|---:|
| source-heldout Top1 | 65.22% | 65.59% |
| source-heldout balanced Top1 | 64.74% | 64.99% |
| minimum-source Top1 | 57.89% | 57.89% |
| source-heldout Top3 | 83.48% | 83.48% |
| independent GTZAN Top1 | 77.39% | 77.39% |
| independent GTZAN balanced Top1 | 77.37% | 77.37% |

## Runtime

Five source-heldout residual stages are appended to the 49-stage milestone
bundle. They use MusicFM and PANNs acoustic records. The shared MusicFM record is
reused rather than extracted twice. All 54 stages were evaluated without
`representation-unavailable`, and serialized inference replay was deterministic.

The promoted model is `unknown65-exhibition-safe-v1`. It does not use URL,
artist, title, or GTZAN audio for training. GTZAN is an independent safety gate
only. YAMNet Metal/Rock and PANNs Blues/Rock candidates were rejected after
independent regression. The sealed 96-track holdout remains unopened.

## Deployment policy

Only the analysis runtime, API support files, reports, and attribution may be
deployed from this branch. SOUND FORM HTML remains owned by the dedicated
`codex/simple-sound-form-ui` deployment path.
