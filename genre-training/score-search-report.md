# Genre Score Search Report

Generated: 2026-06-22

## Purpose

30ジャンル以上のジャンル推定正答率80%を目標に、音源追加なしで分類器設定を自動探索した。

入力データは外付けへ退避済みの正式特徴量キャッシュのみを使った。

- `verifiedDatasetPath`: `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/verified-dataset.json`
- `featureCachePath`: `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/feature-cache.json`

## Search Script

追加:

- `apps/demo/scripts/genre-auto-score-search.mjs`

このスクリプトは設定ごとに `genre-training.mjs` をキャッシュのみで実行し、以下へ結果を保存する。

- `genre-training/score-search/summary.json`
- `genre-training/score-search/<config>/result.json`
- `genre-training/score-search/<config>/results.json`
- `genre-training/score-search/<config>/genre-model.json`

最後に objective score が最も高いモデルを `genre-training/genre-model.json` と `apps/demo/genre-training/genre-model.json` へ復元する。

## Best Configuration

最良設定:

- `distributionClassifierEnabled: true`
- `separabilityWeightsEnabled: true`
- `macroHeuristicsEnabled: false`
- `balancedKnnEnabled: false`
- `validationCalibrationEnabled: false`
- `theoryGenreFeaturesEnabled: false`

採用したコード変更:

- `MMFR_DISTRIBUTION_CLASSIFIER` はデフォルトON。`0`でOFF。
- `MMFR_SEPARABILITY_WEIGHTS` はデフォルトON。`0`でOFF。
- `MMFR_ENABLE_MACRO_HEURISTICS` はデフォルトOFF。`1`でON。
- ブラウザ側 `inferMusicGenresWithModel()` に distribution score を追加し、学習側モデルと推定ロジックを近づけた。

## Score Change

Before this search:

- Macro Top1: `32.5%`
- Fine Top1: `13.7%`
- Fine Top3: `26.0%`
- Formal Macro Top1: `34.2%`
- Formal Fine Top1: `15.8%`
- Formal Fine Top3: `29.3%`

After best configuration:

- Macro Top1: `31.6%`
- Fine Top1: `15.5%`
- Fine Top3: `26.3%`
- Formal Macro Top1: `33.4%`
- Formal Fine Top1: `17.9%`
- Formal Fine Top3: `29.9%`
- Needs review: `15.5%`
- Dub prediction rate: `6.8%`

解釈:

- 大分類Top1は少し下がった。
- 目的に近い細分類Top1は上がった。
- Formal Fine Top1 は `+2.1pt`、Fine Top3 は `+0.6pt` 改善。
- `passingGenres` は `1` になった。

## Important Findings

- `balancedKnn` は大きく悪化したため不採用。
- `advanced` / `extended` / `theory-features` は特徴量数を増やすだけでは悪化した。
- `calibration` は現validation splitでは過補正気味。
- `macroHeuristics` は現データでは細分類を誤誘導していたため、デフォルトOFFにした。
- `FMA_AUDIO_WEIGHT=1` はTop3を上げるがTop1を落としたため不採用。
- `best-theory-off` は一部改善したが、`best-no-macro-heuristics` の方が総合で高かった。

## Remaining Bottlenecks

`genre-goal-report` 上の優先課題:

- `シティ・ポップ`: formal rows `3`, missing `97`
- `ドローン`: formal rows `77`, missing `23`, Top1 `0`
- `J-POP`: Top1 `41.2`
- `ダブ`: Top1 `23.5`
- `テクノ`: Top1 `6.7`

次の改善は、設定探索よりも以下が効く可能性が高い。

1. `ドローン` と `テクノ` の誤判定サンプルを個別監査する。
2. `シティ・ポップ` の明示ラベル正式音源を増やす。
3. `テクノ` は four-on-floor / kick grid 特徴量を直接分類へ入れる前に、テクノ vs ハウス vs J-POP の分離度を検定する。
4. `ダブ` は reggae / hip-hop / dubstep との混同行列を見て、低域以外の特徴量を限定的に使う。
