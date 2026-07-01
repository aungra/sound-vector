# Genre Goal Reset Summary

Generated: 2026-06-29

## Goal

30ジャンル以上で、ジャンル推定の正答率を80%に近づける。

ただし、正式学習に使う音源は Creative Commons / 公開研究用 / ローカルで権利確認済みの実音声に限定する。音源本体はrepoに入れず、外付けストレージへ置く。

## Current Score

| metric | value |
| --- | ---: |
| Macro Top1 | 32.1% |
| Fine Top1 | 17.9% |
| Fine Top3 | 35.3% |
| Formal Fine Top1 | 20.8% |
| Formal Fine Top3 | 39.8% |
| Style Top1 | 51.0% |
| Needs review | 12.1% |
| Dub prediction rate | 9.3% |
| Formal stable genre count | 27 |

## What Has Been Done

- YouTube収集はbot確認・rate limitが不安定なため、正式学習ソースから外した。
- iTunes preview / Artlist / broad FMA metadata は、権利や分布差の問題があるため正式学習から外した。
- Creative Commons / 公開研究用 / ローカル音源を正式ルートにした。
- 外付けキャッシュへ `feature-cache.json` と `verified-dataset.json` を逃がした。
- `formal-cached` 学習を安定版として固定した。
- `styleHint` を導入し、シティ・ポップのような曖昧なスタイルを exact genre と分離した。
- source-quality holdout と validation reranker を入れて、ノイズの強い行が学習を壊しにくくした。
- MFCC系・ロールオフ・テンポ安定性・拍グリッド・ボーカル帯域系など、ジャンル識別向け特徴量を追加した。

## Why The Old Approach Is Inefficient

現在の残り課題は、分類器の重みだけでは解けない。

- 多くのジャンルで formal fine rows が50件未満。
- test rows が10件未満のジャンルが多く、評価がブレる。
- broad label と fine label が混ざり、exact accuracy が下がる。
- テクノ / ドローン / ダブなどは、問題の種類が違うのに同じ重み調整で扱っていた。
- global score search は一方の指標を上げると別の指標が落ちる段階に入っている。

## New Approach

今後は、全ジャンル一括の再学習ループではなく、失敗タイプごとのスプリントに分ける。

1. `data-gap`
   明示ラベル音源を追加する。モデル調整より先にデータを増やす。

2. `label-noise`
   音源追加ではなく、ラベル監査・holdout・macro-only化を先に行う。

3. `ranker-gap`
   Top3には入るがTop1で落ちるジャンル。大分類内の局所rerankerを作る。

4. `model-and-data-gap`
   データはあるが混同が強いジャンル。誤判定先との contrast pairs を追加してから特徴量を見直す。

## First Sprint

最初の対象は `テクノ`。

理由:

- formal fine rows: 32
- test rows: 9
- Fine Top1: 0%
- Fine Top3: 11.1%
- 誤判定先が `ダブ / ヒップホップ / ハウス` に偏っている

方針:

- `テクノ` の明示ラベル音源を48曲追加する。
- `ハウス / トランス / ドラムンベース / ダブステップ / チップチューン` を近接対照として各15曲追加する。
- `ダブ / ヒップホップ / ファンク` を hard negative として各10曲追加する。
- 音源は外付けの `acquisition-sprints/techno-20260629/` に置く。
- 追加後、manifest化、features-only import、formal-cached再学習、goal report、roadmap再生成を1回だけ行う。

## New Files

- `apps/demo/scripts/genre-reset-roadmap.mjs`
- `apps/demo/scripts/genre-acquisition-sprint.mjs`
- `genre-training/genre-reset-roadmap.md`
- `genre-training/genre-reset-roadmap.json`
- `genre-training/techno-acquisition-sprint.md`
- `genre-training/techno-acquisition-sprint.json`

## Next Action

テクノ第一スプリント用の外付けフォルダへ音源を置く。

Expected root:

```text
/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629
```

音源配置後は `genre-training/techno-acquisition-sprint.md` のコマンドを順に実行する。
