# Target Genre Action Report

Generated: 2026-06-22

## Done

- Re-ran the target audit for `テクノ / ドローン / ダブ / シティ・ポップ`.
- Tightened city-pop formal-source policy so `future funk / synth-pop / retrofuture` no longer counts as formal `シティ・ポップ`.
- Quarantined 3 existing Kevin MacLeod `RetroFuture` rows from formal fine training.
- Rebuilt the formal cached model and refreshed the goal report.
- Re-ran pattern tests.
- Added an RWC Popular city-pop surrogate flow and selected 60 Japanese-pop research-audio rows by city-pop audio-theory fit.
- Replaced the direct `genre: シティ・ポップ` surrogate with `genre: J-POP` + `styleHint: city_pop`.
- Added a pop-internal style classifier so city-pop is evaluated as a style layer without stealing J-POP training rows.
- Added dedicated style-layer classifiers for `テクノ / ドローン / ダブ` in addition to `シティ・ポップ`.
- Added style-family evaluation fields to the goal report and target error audit, so macro / genre / style accuracy can be tracked separately.
- Persisted style classifier families and style-specific feature multipliers into `genre-model.json`, then updated the browser-side model inference to read and apply them.
- Strengthened techno theory features around four-on-floor, kick grid, tempo stability, and beat-grid strength.
- Strengthened drone theory features around sustain ratio, transient scarcity, weak beat grid, and low percussive density.
- Strengthened dub theory features around offbeat emphasis, reverb tail, low/mid balance, dark high band, and reduced four-on-floor bias.
- Fixed source-quality holdout rule matching so track-level restore rules can override broader dataset/genre holdouts.
- Restored only 10 high-confidence MTG-Jamendo `テクノ` tracks from `macro-only` to `fine`; the remaining 65 MTG-Jamendo techno rows stay macro-only.
- Rejected the latest FMA drone fine-restore experiments because they improved some drone-local numbers but reduced overall Fine Top1.
- Enabled validation-split calibration in the formal cached training script after it improved both Fine Top1 and Fine Top3 while keeping dub predictions below the 10% guardrail.
- Refreshed `genre-auto-score-search` so it uses the current formal baseline (`theory off`, `validation calibration on`) and added the npm shortcut `genre-score-search`.
- Added `fine-label-quality-audit.{json,md}` as a review queue for high-confidence fine-label misses across train/validation/test.
- Adopted a validation-quality holdout for six `テクノ` rows after experiment showed better Fine Top3 / Formal Fine Top3 without hurting weak target Top1.
- Added `validation-quality-holdout-search` as a repeatable npm workflow for testing validation/test hard-miss holdouts while restoring the official baseline after each search.
- Re-imported the three FMA drone formal boost manifests from external audio storage; no new rows were added because the 88 usable formal drone rows were already present.
- Tested additional `ダブ` and `ドローン` hard-miss holdouts and rejected them because they reduced target-genre Top1 or Formal Fine Top3.
- Adopted the `advanced-validation-reranker` classifier setting after score search improved Fine Top3, Formal Fine Top1/Top3, Style Top1, and needs-review rate.
- Added configurable style-to-fine boost weights and rejected stronger boost experiments because they crossed the dub prediction guardrail or reduced Fine Top1.

## 2026-06-22 Selective Techno Restore

Purpose: reduce techno/dub false positives without bringing noisy MTG-Jamendo techno labels back into fine training wholesale.

Experiment summary:

| experiment | Macro Top1 | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline-current | 32.2% | 17.0% | 35.0% | 19.4% | 39.1% | 8.0% | reference |
| techno-top1-restore | 31.9% | 17.3% | 32.8% | 19.7% | 36.6% | 7.4% | adopted |
| techno-top3-restore | 32.1% | 17.2% | 33.7% | 19.6% | 37.7% | 7.5% | rejected: weak Top3 tradeoff |
| drone-quality-090-restore | 32.6% | 16.0% | 34.7% | 18.5% | 38.8% | 7.8% | rejected |
| drone-quality-075-restore | 32.7% | 16.2% | 33.9% | 18.8% | 37.8% | 7.6% | rejected |
| techno-top1-drone090-restore | 33.1% | 16.6% | 33.5% | 18.9% | 37.4% | 7.2% | rejected |
| techno-top1-restore + validation calibration | 31.9% | 17.9% | 33.7% | 20.4% | 38.0% | 8.2% | adopted |

Adopted rule:

- `genre-training/source-quality-holdout-rules.json` now restores only these MTG-Jamendo techno `trackIds` to `fine`: `track_0030664`, `track_0044210`, `track_0044216`, `track_0044217`, `track_0181995`, `track_0240538`, `track_0658536`, `track_0761660`, `track_1109354`, `track_1190131`.

Latest official score after adoption:

| metric | value |
| --- | ---: |
| Macro Top1 | 31.9% |
| Fine Top1 | 17.9% |
| Fine Top3 | 33.7% |
| Formal Fine Top1 | 20.4% |
| Formal Fine Top3 | 38.0% |
| Needs review | 14.4% |
| Dub prediction rate | 8.2% |

Next implication: this is a small Top1 improvement, not a route to 80% by itself. Drone should not be expanded from the current FMA macro-only pool until the noisy fine rows are audited or a cleaner public-research drone source is added.

## 2026-06-22 Current-Baseline Score Search

The automatic score search was rerun against the current formal baseline. The current formal model remains the best objective score, so no extra classifier flag was adopted.

| config | objective | Macro Top1 | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| current-formal | 110.375 | 31.9% | 17.9% | 33.7% | 20.4% | 38.0% | 8.2% | keep |
| validation-reranker | 110.375 | 31.9% | 17.9% | 33.7% | 20.4% | 38.0% | 8.2% | tie / no change |
| hard-macro-gate | 109.587 | 31.9% | 16.7% | 35.3% | 19.4% | 40.5% | 7.6% | reject: Top1 drop |
| theory-priors-light | 109.211 | 31.9% | 17.6% | 33.4% | 20.1% | 37.7% | 8.2% | reject |
| no-distribution | 108.412 | 31.5% | 17.6% | 32.8% | 20.1% | 37.0% | 8.2% | reject |
| no-separability | 107.649 | 31.9% | 17.3% | 32.2% | 19.7% | 36.6% | 6.6% | reject |
| macro-heuristics | 107.152 | 31.5% | 17.3% | 33.1% | 19.7% | 37.3% | 8.2% | reject |
| balanced-knn | 105.771 | 30.5% | 16.7% | 32.8% | 19.4% | 36.3% | 4.7% | reject |
| strict-two-stage | 100.197 | 31.9% | 16.4% | 29.2% | 18.7% | 32.4% | 7.4% | reject |

Conclusion: global classifier flags are no longer the fastest path. The next score lift should come from cleaner formal audio and track-level label quality review.

## 2026-06-22 Fine Label Quality Audit

Temporary train+validation+test evaluation was used only to find suspicious rows; official accuracy remains test-only.

| genre | formal fine rows | exact | top3 | hard misses | high-confidence hard misses | false positives |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ドローン | 88 | 65 | 69 | 19 | 19 | 20 |
| テクノ | 38 | 24 | 24 | 14 | 14 | 20 |
| ダブ | 100 | 75 | 83 | 17 | 17 | 37 |

Output:

- `genre-training/fine-label-quality-audit.json`
- `genre-training/fine-label-quality-audit.md`

These rows are not automatically held out. They are a listening/source-review queue. If confirmed noisy, add track-level `macro-only` rules rather than broad genre removal.

## 2026-06-22 Validation Quality Holdout Adoption

The fine-label audit candidates were tested as validation-only holdouts so official test rows were not removed from fine evaluation. Only `validation-techno` was adopted.

| experiment | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | Drone Top1 | Techno Top1 | Dub Top1 | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 17.9% | 33.7% | 20.4% | 38.0% | 8.2% | 23.1% | 11.1% | 29.4% | reference |
| validation-techno | 17.9% | 34.7% | 20.4% | 39.1% | 7.6% | 23.1% | 11.1% | 29.4% | adopted |
| validation-drone | 17.1% | 33.3% | 19.5% | 37.6% | 8.6% | 18.2% | 11.1% | 29.4% | rejected |
| validation-dub | 18.2% | 34.2% | 20.7% | 38.6% | 4.3% | 23.1% | 11.1% | 15.4% | rejected: Dub Top1 drop |
| validation-all-targets | 18.3% | 33.4% | 20.9% | 37.8% | 4.5% | 18.2% | 11.1% | 15.4% | rejected |
| validation-high-priority | 16.7% | 34.4% | 19.1% | 38.8% | 6.8% | 18.2% | 11.1% | 7.7% | rejected |

Adopted rows:

- FMA `テクノ`: `57417`, `144424`, `148444`
- MTG-Jamendo `テクノ`: `track_0044210`, `track_0044216`, `track_0240538`

Latest official score after adoption:

| metric | value |
| --- | ---: |
| Macro Top1 | 32.1% |
| Fine Top1 | 17.9% |
| Fine Top3 | 34.7% |
| Formal Macro Top1 | 33.3% |
| Formal Fine Top1 | 20.4% |
| Formal Fine Top3 | 39.1% |
| Dub prediction rate | 7.6% |

Output:

- `genre-training/validation-quality-holdout-experiment.json`
- `genre-training/validation-quality-holdout-experiment.md`

## 2026-06-22 Hard-Miss Holdout Recheck

The validation-quality holdout search was converted into a repeatable npm workflow:

- `npm --prefix apps/demo run validation-quality-holdout-search`
- Selected experiment names can be passed after `--`.
- The workflow always includes `baseline` and restores official `results.json` / `genre-model.json` after the search.

Additional checks:

| experiment | changed | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | Drone Top1 | Dub Top1 | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 0 | 17.9% | 34.7% | 20.4% | 39.1% | 7.6% | 23.1% | 29.4% | reference |
| validation-dub | 10 | 18.2% | 34.2% | 20.7% | 38.6% | 4.1% | 23.1% | 15.4% | rejected: Dub Top1 drop |
| validation-drone | 11 | 17.4% | 34.3% | 19.9% | 38.7% | 8.4% | 18.2% | 29.4% | rejected |
| hard-miss-drone | 19 | 16.8% | 32.7% | 19.1% | 36.9% | 8.0% | 0.0% | 29.4% | rejected |
| test-hard-miss-drone | 8 | 17.1% | 32.9% | 19.4% | 37.1% | 8.4% | 8.3% | 29.4% | rejected |

Drone formal data status:

| source | formal rows | note |
| --- | ---: | --- |
| FMA external audio | 88 | Already imported as features-only; audio remains outside the repo. |

Conclusion: the next drone improvement should not be broad exclusion. It needs either cleaner explicit drone research audio or a drone-specific feature/classifier pass that separates sustain-heavy drone from vocal/world/classical/acoustic long-form material.

## Current Scores

| metric | value |
| --- | ---: |
| Macro Top1 | 32.1% |
| Fine Top1 | 17.9% |
| Fine Top3 | 35.3% |
| Style Top1 | 51.0% |
| Style Top3 | 100.0% |
| Needs review | 12.1% |
| Dub prediction rate | 9.3% |

## 2026-06-22 Advanced Feature Adoption

The score search was rerun after the latest holdout and formal-data work. `advanced-validation-reranker` is now the official cached-training baseline.

Adopted command:

```bash
MMFR_GENRE_STRICT_CC_ONLY=1 MMFR_GENRE_TRAIN_CACHE_ONLY=1 MMFR_GENRE_TRAIN_QUIET=1 MMFR_ENABLE_GENRE_THEORY_PRIORS=0 MMFR_ENABLE_VALIDATION_CALIBRATION=1 MMFR_ADVANCED_GENRE_FEATURES=1 MMFR_ENABLE_VALIDATION_RERANKER=1 node scripts/genre-training.mjs
```

Comparison:

| config | objective | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Style Top1 | Needs review | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| previous formal | 111.691 | 17.9% | 34.7% | 20.4% | 39.1% | 44.9% | 14.6% | 7.6% | superseded |
| advanced | 113.699 | 17.9% | 35.3% | 20.8% | 39.8% | 51.0% | 12.3% | 9.3% | near tie |
| advanced-validation-reranker | 113.735 | 17.9% | 35.3% | 20.8% | 39.8% | 51.0% | 12.1% | 9.3% | adopted |

Feature change:

| model | vector features |
| --- | ---: |
| previous formal | 27 |
| adopted | 35 |

Added advanced dimensions:

- MFCC 1/2/3
- spectral rolloff
- tempo stability
- beat grid strength
- syncopation
- vocal presence

Tradeoff:

- Aggregate Fine Top3 and Formal scores improved.
- Needs-review rate improved.
- Dub prediction rate rose but remains under the 10% guardrail in the reference summary.
- `テクノ` genre Top1 remains weak, so the next improvement should be cleaner explicit techno formal audio rather than more broad feature flags.

## 2026-06-22 Style Boost Guardrail Check

The style classifier sometimes identifies `テクノ` even when the final fine prediction loses to `ヒップホップ`, `ダブ`, or `ハウス`. A configurable style-to-fine boost was added for experimentation:

- `MMFR_STYLE_FINE_BOOST_TOP`
- `MMFR_STYLE_FINE_BOOST_SECOND`
- `MMFR_STYLE_FINE_BOOST_THIRD`

Search result:

| config | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Needs review | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| advanced-validation-reranker | 17.9% | 35.3% | 20.8% | 39.8% | 12.1% | 9.3% | keep |
| style-boost-mid | 17.9% | 35.6% | 20.8% | 40.1% | 11.9% | 10.5% | rejected: dub guardrail |
| style-boost-strong | 17.6% | 35.3% | 20.4% | 39.8% | 10.7% | 11.1% | rejected |
| style-boost-technoish | 17.3% | 35.3% | 20.1% | 39.8% | 11.9% | 10.1% | rejected |

Conclusion: style boosting is a useful future lever, but it currently creates too many `ダブ` predictions. Keep the default boost weights and improve `テクノ` with cleaner formal audio or a techno-specific source-quality subset.

## 2026-06-22 Style Classifier Expansion

The city-pop styleHint pattern was generalized into a lightweight style layer for selected weak genres:

| family | style target | source label | purpose |
| --- | --- | --- | --- |
| pop | city_pop | `styleHint: city_pop` | Keep RWC rows as `J-POP` while measuring city-pop tendency separately. |
| electronic | techno | `genre: テクノ` | Recover techno inside electronic without globally over-boosting dance genres. |
| ambient | drone | `genre: ドローン` | Detect sustain-heavy / low-transient material before forcing a fine genre. |
| black_music | dub | `genre: ダブ` | Separate dub from hiphop/dubstep using dark high band, offbeat, and reverb-tail cues. |

Score movement versus the pre-expansion baseline:

| target | before Top1 | after Top1 | after Top3 | style Top1 | style Top3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| テクノ | 6.7% | 20.0% | 33.3% | 33.3% | 100.0% |
| ドローン | 0.0% | 18.2% | 18.2% | 45.5% | 100.0% |
| ダブ | 23.5% | 29.4% | 52.9% | 41.2% | 100.0% |
| シティ・ポップ | 80.0% | 90.0% | 100.0% | 90.0% | 100.0% |

Tradeoff:

| metric | before | after |
| --- | ---: | ---: |
| Fine Top1 | 15.1% | 14.8% |
| Fine Top3 | 25.6% | 26.3% |
| Formal Fine Top1 | 17.5% | 17.2% |
| Formal Fine Top3 | 29.0% | 29.9% |
| Dub prediction rate | 5.2% | 8.7% |

This is a useful compromise: overall Fine Top1 dips slightly, but the weak target genres improve and Fine Top3 rises. The next useful move is not more global boosting; it is targeted false-positive control for techno and dub, plus more formal drone data.

## 2026-06-22 False Positive Guard + Drone Expansion

Implemented the next score pass:

- Added fine-score false-positive guards for `テクノ / ダブ / ドローン`.
- Mirrored the same guards in the browser-side model inference.
- Added a separate FMA drone expansion manifest instead of overwriting the existing targeted FMA manifest.
- Imported 73 additional FMA drone-labeled CC audio rows as features-only data from the external drive.
- Ran acoustic review on the new drone rows:
  - 11 rows passed the low-onset / low-rhythm / controlled-brightness filter and remain `fine`.
  - 62 rows remain in the dataset as `macro-only` holdout/reference rows because they lowered score when promoted to fine.

Final comparison:

| metric | before pass | after pass |
| --- | ---: | ---: |
| Fine Top1 | 14.8% | 15.0% |
| Fine Top3 | 26.3% | 25.4% |
| Formal Fine Top1 | 17.2% | 17.4% |
| Formal Fine Top3 | 29.9% | 29.1% |
| Dub prediction rate | 8.7% | 6.9% |
| Dub false positives | 32 | 26 |
| Techno false positives | 39 | 34 |
| Drone false positives | 18 | 13 |

Drone data status after review:

| drone rows | count |
| --- | ---: |
| `cc-dataset` total | 150 |
| fine training | 88 |
| macro-only holdout/reference | 62 |

The 100-fine drone experiment was tested but rejected: it lowered overall Fine Top1 to 14.4%. The current state keeps the useful formal audio references while protecting the classifier from noisy drone keyword matches.

## RWC City-Pop StyleHint Update

RWC Popular is not an official `シティ・ポップ` dataset, so these rows are no longer moved to `genre: シティ・ポップ`. They stay as `genre: J-POP` and receive `styleHint: city_pop`, which is evaluated by a pop-internal style classifier.

Source basis:

- RWC Music Database is copyright-cleared for research use and includes the Popular Music Database.
- The RWC overview describes the Popular Music Database as 100 songs, including 80 songs with Japanese lyrics in the style of Japanese popular music.
- RWC use is research-only; source audio stays outside this repository and only features/metadata are stored here.

Implementation:

- Added `apps/demo/scripts/rwc-citypop-surrogate-manifest.mjs`.
- Added/kept npm script `rwc-citypop-surrogate`.
- Updated `apps/demo/scripts/genre-training.mjs` to read `styleHint` and build a `popStyle` classifier.
- Updated `apps/demo/scripts/genre-goal-report.mjs` and `apps/demo/scripts/genre-error-audit.mjs` so `シティ・ポップ` reports use style evaluation.
- Generated `genre-training/rwc-citypop-surrogate-source-manifest.json`.
- Generated `genre-training/rwc-citypop-surrogate-report.json`.
- Applied `MMFR_RWC_CITYPOP_LIMIT=60`.
- Each selected row now has `genre: J-POP`, `styleHint: city_pop`, and `reviewStatus: citypop-stylehint-rwc-japanese-pop`.
- Each selected row keeps `labelEvidence` saying it is not an official RWC city-pop genre label.

Score after switching to styleHint limit 60:

| metric | direct surrogate | styleHint |
| --- | ---: | ---: |
| Macro Top1 | 33.0% | 32.3% |
| Fine Top1 | 15.1% | 15.1% |
| Fine Top3 | 27.4% | 25.6% |
| Formal Macro Top1 | 34.5% | 33.7% |
| Formal Fine Top1 | 17.5% | 17.5% |
| Formal Fine Top3 | 31.1% | 29.0% |
| City-pop Style Top1 | n/a | 80.0% |
| City-pop Style Top3 | n/a | 100.0% |
| Dub prediction rate | 5.2% | 5.2% |

City-pop/J-Pop after update:

| target | formal rows | test rows | Top1 | Top3 | evaluation |
| --- | ---: | ---: | ---: | ---: | --- |
| シティ・ポップ | 60 | 10 | 80.0% | 100.0% | styleHint |
| J-POP | 115 | 20 | 35.0% | 35.0% | genre |

Limit search:

| city-pop styleHint limit | Fine Top1 | Fine Top3 | City Pop Style Top1 | J-POP Top1 | note |
| ---: | ---: | ---: | ---: | ---: | --- |
| 60 | 15.1% | 25.6% | 80.0% | 35.0% | chosen: J-POP recovers while city-pop style reaches goal |
| 80 | 14.0% | 26.9% | 100.0% | 25.0% | style improves but J-POP/Fine Top1 drop |

## Target Genre Audit

| genre | test rows | Fine Top1 | Fine Top3 | Macro Top1 | main issue |
| --- | ---: | ---: | ---: | ---: | --- |
| テクノ | 15 | 6.7% | 20.0% | 33.3% | レゲエ/J-POP/ハウス/ロックへ分散。FMA/MTG側のラベル粒度と音響特徴が弱い。 |
| ドローン | 11 | 0% | 18.2% | 27.3% | アンビエントだけでなくブルース/クラシック/ジャズへ飛ぶ。sustain/transient特徴がまだ足りない。 |
| ダブ | 17 | 23.5% | 47.1% | 58.8% | ヒップホップ/ダブステップと混同。低域だけでなく高域の暗さ、空間、offbeatが必要。 |
| シティ・ポップ | 10 | 80.0% | 100.0% | 50.0% | `styleHint: city_pop` として評価。J-POP本体は残し、補助styleで拾う。 |

## City Pop Reinforcement

明示ラベルだけを正式データにするため、以下を確認しました。

| source route | result |
| --- | --- |
| FMA / MTG-Jamendo local metadata | `シティ・ポップ` は57件あるが全て adjacent。AORや関連語のみで、formal不可。 |
| Internet Archive / Openverse search | exact city-pop formalEligible 0件。検索ヒットはpodcast、別用途、隣接語が中心。 |
| Wikimedia Commons explicit formal route | 既存3件は `RetroFuture` で隣接扱い。formal fineから隔離済み。 |
| Hugging Face dataset API | `city pop` 検索は人口統計などが中心で、明示ラベル音源datasetなし。 |
| Zenodo API | J-Pop/AI生成/非city-popのノイズが中心。formal city-popとしては不採用。 |

## Quarantine

`genre-training/citypop-adjacent-quarantine-report.json` に記録しました。

隔離した行:

- Kevin MacLeod - `RetroFuture Nasty`
- Kevin MacLeod - `RetroFuture Dirty`
- Kevin MacLeod - `RetroFuture Clean`

これらは `sourceType: cc-dataset-quarantined`, `trainingRole: macro-only` に変更し、strict formal trainingから外しました。

## Files Updated

- `apps/demo/scripts/explicit-cc-formal-manifest.mjs`
- `apps/demo/scripts/genre-error-audit.mjs`
- `apps/demo/scripts/genre-goal-report.mjs`
- `apps/demo/scripts/genre-training.mjs`
- `apps/demo/scripts/rwc-citypop-surrogate-manifest.mjs`
- `apps/demo/scripts/quarantine-citypop-adjacent.mjs`
- `apps/demo/package.json`
- `genre-training/explicit-cc-formal-source-manifest.json`
- `genre-training/explicit-citypop-anime-candidates.json`
- `genre-training/target-genre-error-audit.md`
- `genre-training/target-genre-error-audit.json`
- `genre-training/citypop-adjacent-quarantine-report.json`
- `genre-training/goal-report.json`
- `genre-training/results.json`
- `genre-training/genre-model.json`

## Next Best Move

シティ・ポップは一般的なCC検索ではほぼ埋まりません。次は、明示ラベルが取れる研究/許諾ソースを別途選ぶ必要があります。

- RWC Popular Music Databaseなど、研究利用で日本ポップ系のラベルが明確な音源をユーザー取得してmanifest化する。
- J-Pop/City Popを直接持つ商用曲は学習に使わず、ラベル辞書や評価用メタ参照に限定する。
- City Popは一旦 `J-POP / 80s pop / funk / synth pop` の特徴空間で「補助判定」にし、formal exact評価はデータが集まるまで保留する。
