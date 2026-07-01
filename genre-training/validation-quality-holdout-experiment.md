# Validation Quality Holdout Experiment

Generated: 2026-06-22T13:34:12.565Z

This search tests validation-split high-confidence hard-miss rows as temporary `macro-only` holdouts. It restores the baseline official model/results after the search.

## Result

Adopted candidate: _none_

| experiment | changed | objective | Macro | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | Drone Top1 | Techno Top1 | Dub Top1 | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 0 | 111.691 | 32.1% | 17.9% | 34.7% | 20.4% | 39.1% | 7.6% | 23.1% | 11.1% | 29.4% | reference |
| test-hard-miss-drone | 8 | 106.226 | 31.6% | 17.1% | 32.9% | 19.4% | 37.1% | 8.4% | 8.3% | 11.1% | 29.4% | reject-target-drop |
| hard-miss-drone | 19 | 105.177 | 32.2% | 16.8% | 32.7% | 19.1% | 36.9% | 8% | 0% | 11.1% | 29.4% | reject-target-drop |

## Notes

- Candidate status requires no weak-target Top1 drop and no Fine Top1 drop.
- This script does not edit `source-quality-holdout-rules.json`; adoption still requires an explicit track-level rule.
- Official `results.json` is restored to the baseline run after the search.
