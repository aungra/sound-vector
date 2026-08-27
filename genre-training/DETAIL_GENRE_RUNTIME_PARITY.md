# 詳細ジャンルと本番推論の同一性監査

監査日: 2026-08-27

## 結論

現在の詳細ジャンル独立ソース評価と本番32構図ジャンル推論は、同じ音声モデル系列を使いますが、同一のfeature contractではありません。したがって、詳細評価の数値をそのまま本番サイトの精度として表示したり、詳細分類器を本番へ昇格したりしません。

本番ランタイムの欠落していたPython依存はGit管理へ移し、クリーンなチェックアウトから再現可能にしました。本番モデル自体は変更していません。

## 本番32構図ジャンル

- モデル: `runtime-audio-fixed-blend-20260815T175636.113979+0000`
- contract: `mmfr-runtime-audio-v2.3-discogs-prior-isolated`
- contract SHA-256: `95bfd247ab1b5c5b23dca946d6b67a11a2d70894cd6d9703105b4c79caa2a885`
- 区間: 45秒 x 3、曲内等間隔
- 入力: Discogs EffNet末尾3,840次元 + librosa 547次元
- 補助prior: Discogs400タグheadを別プロセスで実行
- 集約: 区間ごとの校正確率の平均、区間一致度と変動を診断
- メタ情報: 不使用

`--validate-model`で、保存モデルと実行時contractのSHA一致を確認済みです。

## 詳細ジャンル独立ソース評価

- 区間: 先頭から最大45秒の1区間
- 入力: MTG-Jamendo genre headのmean / standard deviation / maximum
- 次元: 261
- 分類器: standardized nearest centroid baseline
- 用途: 独立ソースで詳細ラベルの音響分離可能性を測る評価専用
- メタ情報: 学習・推論には不使用

詳細分類のCommons holdoutはChiptune 82.35%、House 75%、Jazz 100%ですが、3ラベル49曲に限った値です。120詳細ジャンル全体や本番32分類の精度ではありません。

## 差分と判断

| 項目 | 本番 | 詳細評価 | 同一性 |
| --- | --- | --- | --- |
| 音声サンプル | 45秒 x 3 | 45秒 x 1 | 不一致 |
| 埋め込み | Discogs EffNet tail | MTG genre head | 不一致 |
| librosa | 547次元 | なし | 不一致 |
| Discogs tag prior | あり | なし | 不一致 |
| 区間診断 | あり | なし | 不一致 |
| URL・曲名・作者 | 不使用 | 不使用 | 一致 |
| ライセンス方針 | production-safe | production-safe | 一致 |

以前の30秒 x 4区間案と異なり、現在の昇格済みモデルcontractは45秒 x 3区間です。区間方式だけを変更すると保存モデルのcontract SHAと不一致になるため、30秒 x 4へ戻す場合は学習、source-heldout評価、モデル書き出し、本番配備を一つの変更として行います。

## 昇格条件

詳細分類器は次を満たしたラベルだけfeature flag下で段階的に有効化します。

1. production-safeな独立originを2系統以上、各5曲以上確保する。
2. 本番と同じ複数区間feature contractでcross-fittingする。
3. origin-heldoutでTop1とbalanced Top1が既存32分類を悪化させない。
4. 本番API、保存モデル、オフライン評価で同じ入力に対する確率一致を確認する。
5. House、Jazz、Chiptuneから開始し、feature flagで即時rollback可能にする。

現段階ではデータ候補と評価結果だけを保持し、詳細モデルの本番昇格は行いません。
