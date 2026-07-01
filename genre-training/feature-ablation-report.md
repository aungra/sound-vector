# Genre Feature Ablation Report

Generated: 2026-06-22

## Baseline

Stable source-quality holdout model:

| metric | score |
| --- | ---: |
| Macro Top1 | 32.2 |
| Fine Top1 | 16.8 |
| Fine Top3 | 28.5 |
| needsReview | 16.8 |
| Dub prediction rate | 7.2 |
| Formal Fine Top1 | 19.7 |
| Formal Fine Top3 | 32.1 |

## Experiments

| experiment | Macro Top1 | Fine Top1 | Fine Top3 | needsReview | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| advanced features | 31.3 | 15.4 | 29.3 | 13.4 | 7.8 | reject as primary |
| theory features | 33.8 | 14.5 | 27.7 | 14.5 | 6.0 | reject as primary |
| extended features | 33.6 | 14.0 | 30.2 | 11.9 | 8.1 | reject as primary |

## Decision

Do not enable the broad advanced/theory/extended feature sets as the primary classifier yet.

The useful signal is still there:

- `advanced` improves Fine Top3 slightly.
- `theory` improves Macro Top1 and dub control.
- `extended` improves Fine Top3 and lowers needsReview.

But all three reduce Fine Top1, so the stable primary model remains the source-quality holdout baseline. The next better move is a secondary reranker for low-margin predictions, or per-macro feature gates that only activate these features where validation proves they help.
