# Genre Reset Roadmap

Generated: 2026-06-30T14:58:15.613Z

## Why Reset

Recent work improved the reference model, but the remaining gap to 80% is no longer mainly a classifier-weight problem. The current bottleneck is mixed evaluation quality: sparse formal rows, broad/noisy source labels, and under-separated macro families are being optimized together.

## Current Baseline

| metric | value |
| --- | ---: |
| Macro Top1 | 32.5% |
| Fine Top1 | 18.6% |
| Fine Top3 | 35.7% |
| Formal Fine Top1 | 21.7% |
| Formal Fine Top3 | 40.4% |
| Style Top1 | 46.7% |
| Needs review | 13% |
| Dub prediction rate | 8.6% |
| Best config | advanced-validation-reranker |

## Buckets

| bucket | genres | meaning |
| --- | ---: | --- |
| data-gap | 36 | Not enough explicit formal fine rows or stable test rows. |
| label-noise | 3 | Enough rows exist, but broad labels/holdouts dominate. |
| ranker-gap | 3 | Top3 is more promising than Top1; use local reranking. |
| model-and-data-gap | 10 | Low accuracy despite some data; add contrast data before tuning. |
| passing-or-style-passing | 1 | Meets exact or style target; freeze as control. |

## Stop Doing

- Stop broad global score-search runs unless a new feature family is added; recent global flags mostly traded one metric for another.
- Stop promoting broad FMA/MTG genre labels directly to fine labels without source-level review.
- Stop optimizing against a single weak target if it crosses the dub guardrail or drops Fine Top1.

## Continue Doing

- Keep advanced-validation-reranker as the reference model because it improved Fine Top3, Formal Fine Top3, Style Top1, and needs-review rate.
- Keep styleHint evaluation for city-pop and similar ambiguous substyles instead of forcing exact fine labels.
- Keep source-quality holdouts and track-level overrides; they prevent noisy formal rows from dominating fine training.

## Start Doing

- Run data-first sprints: each sprint selects 3-5 genres, adds explicit formal rows, then retrains once.
- Create per-macro specialist evaluation sets before adding more weighting knobs.
- Treat techno as the first acquisition sprint: explicit techno rows, explicit non-techno electronic contrast rows, and no broad electronic labels.

## Next Priority Rows

| genre | bucket | formal fine | test | Top1 | Top3 | style Top1 | next action |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| テクノ | data-gap | 32 | 9 | 0% | 11.1% | 22.2% | Add 18 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| アニメソング | data-gap | 6 | 1 | 0% | 0% | 0% | Add 44 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ドローン | label-noise | 88 | 13 | 23.1% | 30.8% | 46.2% | Review source/track labels first; promote only explicit substyle rows and keep broad labels macro-only. |
| ダブ | ranker-gap | 100 | 17 | 29.4% | 70.6% | 47.1% | Use validation examples to train a narrow per-macro reranker; avoid global boosts. |
| J-POP | model-and-data-gap | 115 | 20 | 30% | 30% | 0% | Collect cleaner contrast pairs against the most common wrong predictions before changing weights. |
| クラシック音楽 | needs-incremental-improvement | 100 | 16 | 75% | 75% | 0% | Collect cleaner contrast pairs against the most common wrong predictions before changing weights. |
| ドラムンベース | data-gap | 0 | 0 | 0% | 0% | 0% | Add 50 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| 電子音楽 | data-gap | 0 | 0 | 0% | 0% | 0% | Add 50 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ワールドミュージック | data-gap | 0 | 0 | 0% | 0% | 0% | Add 50 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| アカペラ | data-gap | 1 | 0 | 0% | 0% | 0% | Add 49 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| オペラ | data-gap | 3 | 1 | 0% | 100% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ロック | data-gap | 3 | 1 | 0% | 100% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ブルース | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ビッグバンド | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| フュージョン | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| サンバ | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| タンゴ | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| バロック | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| クラシック | data-gap | 3 | 1 | 0% | 0% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |
| ロマン派 | data-gap | 3 | 1 | 0% | 100% | 0% | Add 47 explicit formal fine row(s) and keep at least 10 test rows before more tuning. |

## New Approach

1. Run acquisition sprints instead of open-ended tuning. Each sprint chooses 3-5 genres, adds explicit formal rows, retrains once, then stops.
2. Split the work by failure bucket. Data-gap genres get audio first; label-noise genres get review/holdouts first; ranker-gap genres get local rerankers only after data is stable.
3. Make `テクノ` the first sprint. It needs explicit techno audio and explicit electronic contrast examples, not stronger global style boosting.
4. Treat 80% as a data-quality target before a model target. Do not count a genre toward the 30-genre goal until it has enough formal fine rows and stable test coverage.

## Output

- `genre-training/genre-reset-roadmap.json`
- `genre-training/genre-reset-roadmap.md`
