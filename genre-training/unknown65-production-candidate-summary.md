# Unknown-source 65% candidate

## Result

The frozen 1,883-track source-heldout development cohort reached **65.00% Top1**
(1,224 / 1,883), from the frozen v114 baseline of 60.70%.

| metric | v114 | candidate |
|---|---:|---:|
| Top1 | 60.70% | 65.00% |
| balanced Top1 | 60.30% | 63.78% |
| minimum-source Top1 | 31.58% | 52.63% |
| Top3 | 83.48% | 83.48% |

The final OOF artifact was generated at
`/private/tmp/unknown65-v114-yamnet-svm-c10-oof.npz` with SHA-256
`45f3c4154f2fbcd95cba2cbe6297bfbde6dce30c67b2006ad7dc0715acc12550`.
It contains scores and source keys only; no audio is retained.

## Evidence

- MusicFM first-stage pair reranking: 60.70% to 61.50%.
- Production-eligible PANNs overlay and expanded boundaries: 61.50% to 63.52%.
- CLAP and residual PANNs/CLAP passes: 63.52% to 64.26%.
- Source-heldout RBF-SVM passes using PANNs and CLAP: 64.26% to 64.95%.
- Apache-2.0 YAMNet confirmation on its cached subset: 64.95% to 65.00%.

The training-only overlay contains only CC0, CC-BY, CC-BY-SA, or Public Domain
rows with explicit detail labels. CC-BY-NC, CC-BY-ND, generic unverified Creative
Commons rows, and evaluation-track duplicates are rejected. A matching provider
is excluded from each outer source fold.

## Promotion status

This is an **exploration-selected candidate**, not a production accuracy claim.
The pair list, thresholds, model family, and SVM C values were selected while
observing the development OOF. The sealed 96-track holdout remains unopened and
was not found in the repository or external training cache. The multi-stage
candidate has not yet been exported as one runtime bundle or passed serialized
inference and latency parity.

Production remains on v114 until a fixed runtime bundle passes independent
validation, production regression within one point, serialization parity, and
latency checks. The SOUND FORM UI must continue to deploy only from the dedicated
simple-UI worktree.
