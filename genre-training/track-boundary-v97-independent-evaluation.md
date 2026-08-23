# Track Boundary v97 Independent Evaluation

## Scope

- Revision: `2026-08-23-track-boundary-reranker-v97`
- Input: 18 full-length, evaluation-only, training-ineligible ccMixter tracks
- Audio policy: 30 seconds x 4 distributed ranges, 120 seconds total
- Comparison: identical production inference with only the three v97 rerankers disabled
- Metadata policy: title, artist, URL and channel data are not passed to inference

This is a false-positive and non-regression control for the three v97 boundary
rerankers. It is not the sealed 32-genre unknown-source score. The source labels
are uploader-supplied single genre tags and are intentionally kept outside
training.

## Result

| Metric | Baseline | v97 |
| --- | ---: | ---: |
| Controls | 18 | 18 |
| Full 4-range controls | 18 | 18 |
| Top1 against source tag | 11.11% | 11.11% |
| Top1 changes | - | 0 |
| Rescues | - | 0 |
| Regressions | - | 0 |

| Boundary | Activations | False activations | Regressions |
| --- | ---: | ---: | ---: |
| `spokenRapBlackMusicBoundary` | 0 | 0 | 0 |
| `distributedDanceRockBoundary` | 0 | 0 | 0 |
| `postPunkRockConsensus` | 0 | 0 | 0 |

The non-regression gate passed. No threshold change is required for v97.

## Interpretation

The low absolute Top1 is evidence that the base classifier still generalizes
poorly to this independent source and that some single-tag controls are broad or
weak labels. It does not indicate a v97 regression because all 18 outputs are
identical with the new rerankers disabled.

The strongest next model-level boundaries exposed by this control are:

- Funk / Soul / Blues separation
- Techno / House / Trance separation
- vocal Opera / Classical / Drone separation
- avoiding J-POP promotion on non-Japanese electronic tracks

These should be addressed through source-heldout Fine training and calibrated
cross-fitting, not by adding track-specific URL rules.

Machine-readable details use hashed control IDs only:
`track-boundary-v97-independent-evaluation.json`.
