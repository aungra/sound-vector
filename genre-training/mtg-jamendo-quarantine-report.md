# MTG-Jamendo Quarantine Report

Generated: 2026-06-21

Purpose: keep score-regressing MTG-Jamendo imports available as analyzed features, but exclude them from formal fine-genre training until manual review.

## Import Attempt

Manifest:

- `genre-training/cc-source-manifest.json`

Imported:

- 43 newly analyzed rows
- `クラシック音楽`: 6
- `ダブ`: 20
- `テクノ`: 17

## Score Before Import

Stable formal cached baseline:

- Macro Top1: 32.8%
- Fine Top1: 13.7%
- Fine Top3: 25.5%
- Needs review: 14.0%
- Dub prediction rate: 5.9%

## Score After Import

After adding the 43 rows as normal `cc-dataset` fine training rows:

- Macro Top1: 31.6%
- Fine Top1: 11.5%
- Fine Top3: 25.8%
- Needs review: 13.2%
- Dub prediction rate: 9.4%

Result:

- Fine Top1 dropped by 2.2 points.
- Dub prediction rate increased.
- `テクノ` remained 0% Top1.
- `ダブ` dropped from 29.4% to 11.8% in the goal report.

## Action Taken

The 43 rows were not deleted. They were changed to:

- `sourceType: "cc-dataset-quarantined"`
- `trainingRole: "macro-only"`
- `reviewStatus: "quarantined-score-regression"`

Because strict formal training only uses `cc-dataset` and `local-audio`, these rows are kept in `verified-dataset.json` for inspection but excluded from formal training/evaluation.

## Score After Quarantine

Stable formal cached score returned to baseline:

- Macro Top1: 32.8%
- Fine Top1: 13.7%
- Fine Top3: 25.5%
- Needs review: 14.0%
- Dub prediction rate: 5.9%

## Interpretation

The MTG-Jamendo batch is useful as candidate material, but the selected `ダブ` and `テクノ` rows are not safe to treat as fine-label ground truth without review. More data alone is not improving the classifier when label granularity or style distribution is noisy.

## Next Priority

1. Keep exact `シティ・ポップ` and `アニメソング` strict; do not fill them with adjacent labels.
2. Review quarantined MTG rows before re-promoting any to `cc-dataset`.
3. For `テクノ` and `ダブ`, prefer curated sources or stricter sub-style filters over bulk MTG tags.
4. Continue source acquisition for `シティ・ポップ`, `アニメソング`, and `ドローン`, because these remain the main formal-coverage blockers.
