# Source Holdout Experiment

Generated: 2026-06-30T14:29:14.599Z

## Result

Best candidate: _none_

| experiment | changed | objective | Formal Fine Top1 | Formal Fine Top3 | Formal Macro | Formal Dub | stable genres | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mtg-funk-macro-only | 50 | 119.682 | 23% | 41.5% | 34.2% | 10.7% | 27 | reject-dub-guardrail |
| baseline | 0 | 117.174 | 21.7% | 40.8% | 33.6% | 10% | 27 | reference |

## Interpretation

This experiment tests whether a source/genre group should become `macro-only` because it behaves as noisy fine-label evidence. It restores the previous official model/results after each run.
