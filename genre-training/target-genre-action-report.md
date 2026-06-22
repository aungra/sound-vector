# Target Genre Action Report

Generated: 2026-06-22

## Done

- Re-ran the target audit for `テクノ / ドローン / ダブ / シティ・ポップ`.
- Tightened city-pop formal-source policy so `future funk / synth-pop / retrofuture` no longer counts as formal `シティ・ポップ`.
- Quarantined 3 existing Kevin MacLeod `RetroFuture` rows from formal fine training.
- Rebuilt the formal cached model and refreshed the goal report.
- Re-ran pattern tests.
- Added an RWC Popular city-pop surrogate flow and selected 60 Japanese-pop research-audio rows by city-pop audio-theory fit.

## Current Scores

| metric | value |
| --- | ---: |
| Macro Top1 | 33.0% |
| Fine Top1 | 15.1% |
| Fine Top3 | 27.4% |
| Needs review | 13.4% |
| Dub prediction rate | 5.2% |

## RWC City-Pop Surrogate Update

RWC Popular is not an official `シティ・ポップ` dataset, so these rows are not treated as exact city-pop evidence. They are transparent surrogate labels for shaping the classifier until exact city-pop research audio is available.

Source basis:

- RWC Music Database is copyright-cleared for research use and includes the Popular Music Database.
- The RWC overview describes the Popular Music Database as 100 songs, including 80 songs with Japanese lyrics in the style of Japanese popular music.
- RWC use is research-only; source audio stays outside this repository and only features/metadata are stored here.

Implementation:

- Added `apps/demo/scripts/rwc-citypop-surrogate-manifest.mjs`.
- Added npm script `rwc-citypop-surrogate`.
- Generated `genre-training/rwc-citypop-surrogate-source-manifest.json`.
- Generated `genre-training/rwc-citypop-surrogate-report.json`.
- Applied `MMFR_RWC_CITYPOP_LIMIT=60`.
- Each selected row has `reviewStatus: citypop-surrogate-rwc-japanese-pop`.
- Each selected row keeps `labelEvidence` saying it is not an official RWC city-pop label.

Score after applying limit 60:

| metric | before | after |
| --- | ---: | ---: |
| Macro Top1 | 32.5% | 33.0% |
| Fine Top1 | 14.9% | 15.1% |
| Fine Top3 | 26.8% | 27.4% |
| Formal Macro Top1 | 34.2% | 34.5% |
| Formal Fine Top1 | 17.3% | 17.5% |
| Formal Fine Top3 | 30.4% | 31.1% |
| Dub prediction rate | 5.5% | 5.2% |

City-pop/J-Pop after update:

| genre | formal rows | test rows | Fine Top1 | Fine Top3 |
| --- | ---: | ---: | ---: | ---: |
| シティ・ポップ | 60 | 10 | 60.0% | 60.0% |
| J-POP | 55 | 10 | 10.0% | 30.0% |

Limit search:

| city-pop surrogate limit | Fine Top1 | Fine Top3 | City Pop Top1 | J-POP Top1 | note |
| ---: | ---: | ---: | ---: | ---: | --- |
| 30 | 14.9% | 26.0% | 20.0% | 25.0% | conservative, but city-pop weak |
| 40 | 15.2% | 26.5% | 50.0% | 27.3% | best Fine Top1, but city-pop test rows below formal threshold |
| 50 | 14.3% | 25.8% | 30.0% | 10.0% | worse |
| 60 | 15.1% | 27.4% | 60.0% | 10.0% | best balance for formal threshold |
| 70 | 14.4% | 25.8% | 40.0% | 0.0% | too many J-POP rows moved |

## Target Genre Audit

| genre | test rows | Fine Top1 | Fine Top3 | Macro Top1 | main issue |
| --- | ---: | ---: | ---: | ---: | --- |
| テクノ | 15 | 6.7% | 26.7% | 26.7% | レゲエ/J-POP/ハウス/ロックへ分散。FMA/MTG側のラベル粒度と音響特徴が弱い。 |
| ドローン | 11 | 0% | 18.2% | 27.3% | アンビエントだけでなくブルース/クラシック/ジャズへ飛ぶ。sustain/transient特徴がまだ足りない。 |
| ダブ | 17 | 23.5% | 52.9% | 58.8% | ヒップホップ/ダブステップと混同。低域だけでなく高域の暗さ、空間、offbeatが必要。 |
| シティ・ポップ | 10 | 60.0% | 60.0% | 50.0% | RWC Popular由来の日本ポップ系代理ラベルで評価可能化。J-POPとの境界監査が次課題。 |

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
