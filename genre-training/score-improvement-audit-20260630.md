# Score Improvement Audit 2026-06-30

## Current Score

| metric | before | after | delta |
| --- | ---: | ---: | ---: |
| Macro Top1 | 32.1% | 32.5% | +0.4 |
| Fine Top1 | 17.9% | 18.6% | +0.7 |
| Fine Top3 | 35.3% | 36.0% | +0.7 |
| Formal Fine Top1 | 20.8% | 21.7% | +0.9 |
| Formal Fine Top3 | 39.8% | 40.8% | +1.0 |
| Formal Macro Top1 | 33.3% | 33.6% | +0.3 |
| Dub prediction rate | 9.3% | 9.3% | 0 |
| Formal dub prediction rate | 10.0% | 10.0% | 0 |

## What Improved

`MTG-Jamendo / ロック` を fine teacher から外し、`macro-only` に変更した。

Reason:

- source/genre scoring showed `MTG-Jamendo / ロック` test rows had 0% Top1, 0% Top3, and 0% macro accuracy.
- A temporary source-holdout experiment improved Formal Fine Top1 from 20.8% to 21.7%.
- Formal Fine Top3 improved from 39.8% to 40.8%.
- Stable formal genre count stayed at 27.
- Dub guardrail stayed at 10.0%.

Changed rule:

- `source-quality-holdout-mtg-jamendo-rock`

## Rejected Fixes

| experiment | result | reason |
| --- | --- | --- |
| advanced-reranker-balanced | rejected | Formal Fine Top1/Top3 dropped. |
| advanced-reranker-loose-safe | rejected | Almost identical to current best, slightly lower objective. |
| advanced-reranker-loose-balanced | rejected | Same degradation as balanced kNN. |
| advanced-reranker-no-distribution | rejected | Formal Fine Top1/Top3 dropped and formal dub exceeded guardrail. |
| MTG-Jamendo ambient holdout | rejected | Formal Fine Top1/Top3 dropped. |
| MTG-Jamendo techno broad restore | rejected | Techno rose, but global Formal Fine dropped. |
| MTG-Jamendo techno strict restore | rejected | Techno and global Formal Fine dropped. |

## Main Remaining Problems

1. `テクノ`
   - Still 0% exact Top1.
   - Existing MTG-Jamendo techno is too broad/noisy for fine training.
   - Next fix is cleaner Freesound/FSLD techno-family loop evidence.

2. `ファンク`
   - Top1 is 0%, but Top3 is 63.6%.
   - This is a ranker problem, not purely a data-gap problem.
   - Needs a black_music specialist reranker after validation examples are stable.

3. `アンビエント`
   - MTG ambient holdout did not help.
   - The problem is not one noisy source alone; it needs better ambient/drone/noise separation features or cleaner contrast data.

4. `J-POP`
   - Formal rows are enough, but Top1 dropped to 30%.
   - Needs pop-specific contrast against hiphop / metal / punk false predictions.

## Next Improvements

- Run Freesound/FSLD acquisition for `テクノ / ハウス / トランス / DnB / ダブステップ / チップチューン`.
- Add a black_music local reranker focused on `ファンク / レゲエ / ヒップホップ / ダブ / ディスコ`.
- Continue source-holdout experiments one at a time, not in bulk.
- Do not loosen global reranker thresholds unless a single-source experiment proves no Formal Fine Top1 drop.
