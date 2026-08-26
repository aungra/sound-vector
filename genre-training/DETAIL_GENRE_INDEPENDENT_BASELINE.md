# 詳細ジャンル独立ソースベースライン

生成日時: 2026-08-26T16:29:08.198Z

CC0 / Public Domain / CC-BY / CC-BY-SAのフル楽曲だけを使用しています。NC・ND・研究限定・ループ素材は含みません。
この評価は対象分類が少ないため120分類全体の精度ではありません。

## MTG-Jamendo -> FMA

Top1 88.89% / Top3 100% / balanced Top1 92.16%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 10 | 5 | 100% | 100% |
| hip-hop | 10 | 14 | 100% | 100% |
| rock | 24 | 17 | 76.47% | 100% |

## FMA -> MTG-Jamendo

Top1 92% / Top3 100% / balanced Top1 93.75%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 59 | 9 | 100% | 100% |
| hip-hop | 84 | 16 | 87.5% | 100% |

## 昇格判定

独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。
次はElectronic / Blues / Jazz / Folkのproduction-safeな第2ソースtestを増やします。
