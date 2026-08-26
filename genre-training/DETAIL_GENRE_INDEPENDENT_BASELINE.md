# 詳細ジャンル独立ソースベースライン

生成日時: 2026-08-26T22:42:46.001Z

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

## FMA + MTG-Jamendo -> ccMixter

Top1 46.94% / Top3 79.59% / balanced Top1 41.78%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| blues | 12 | 6 | 50% | 83.33% |
| classical | 69 | 9 | 77.78% | 88.89% |
| electronic | 69 | 6 | 33.33% | 83.33% |
| folk | 36 | 3 | 100% | 100% |
| hip-hop | 94 | 5 | 40% | 80% |
| house | 13 | 3 | 0% | 66.67% |
| jazz | 36 | 3 | 0% | 33.33% |
| reggae | 15 | 8 | 50% | 87.5% |
| rock | 188 | 3 | 33.33% | 66.67% |
| techno | 21 | 3 | 33.33% | 66.67% |

## FMA + MTG-Jamendo + ccMixter -> IA netlabels

Top1 100% / Top3 100% / balanced Top1 100%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| metal | 10 | 5 | 100% | 100% |

## 昇格判定

独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。
次はHouse / Jazz / Disco / Deep Houseのproduction-safeな第2ソースtestを増やします。
