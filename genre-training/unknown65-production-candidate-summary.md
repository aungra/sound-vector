# Unknown-source 65% first milestone

## Result

The fixed 1,883-track source-heldout cohort reached **65.22% Top1**. The
independent GTZAN safety set also improved from 75.65% to **77.39% Top1**.

| metric | previous production | milestone |
|---|---:|---:|
| source-heldout Top1 | 64.74% | 65.22% |
| source-heldout balanced Top1 | 64.42% | 64.74% |
| minimum-source Top1 | 57.89% | 57.89% |
| source-heldout Top3 | 83.48% | 83.48% |
| independent GTZAN Top1 | 76.52% | 77.39% |
| independent GTZAN balanced Top1 | 76.41% | 77.37% |

## Runtime

Seven source-heldout residual stages are appended to the 42-stage production
bundle. They use YAMNet and the MusicFM record already extracted by the preceding
runtime stage; MusicFM is not run twice. Live PANNs, YAMNet, AST, and MusicFM
features match the frozen cache within the 0.001 tolerance. All 49 stages were
evaluated without `representation-unavailable`, and deterministic replay had a
maximum probability delta of 0.

The promoted model is `unknown65-first-milestone-v1`. It does not use URL,
artist, title, or GTZAN audio for training. GTZAN is an independent safety gate
only. The sealed 96-track holdout remains unopened.

## Deployment policy

Only the analysis runtime, API support files, reports, and attribution may be
deployed from this branch. SOUND FORM HTML remains owned by the dedicated
`codex/simple-sound-form-ui` deployment path.
