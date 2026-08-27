# 詳細ジャンル独立ソースベースライン

生成日時: 2026-08-27T00:12:54.473Z

CC0 / Public Domain / CC-BY / CC-BY-SAのフル楽曲だけを使用しています。NC・ND・研究限定・ループ素材は含みません。
この評価は対象分類が少ないため120分類全体の精度ではありません。

## MTG-Jamendo -> FMA

Top1 65.21% / Top3 84.67% / balanced Top1 60.79%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 10 | 61 | 68.85% | 73.77% |
| disco | 5 | 11 | 63.64% | 100% |
| hip-hop | 10 | 98 | 68.37% | 92.86% |
| house | 13 | 33 | 36.36% | 100% |
| rock | 24 | 172 | 69.19% | 77.91% |
| techno | 21 | 36 | 58.33% | 94.44% |

## FMA -> MTG-Jamendo

Top1 68.99% / Top3 96.9% / balanced Top1 67.72%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 56 | 19 | 84.21% | 100% |
| disco | 11 | 6 | 50% | 66.67% |
| hip-hop | 84 | 26 | 84.62% | 100% |
| house | 31 | 13 | 53.85% | 92.31% |
| rock | 156 | 27 | 88.89% | 96.3% |
| techno | 36 | 38 | 44.74% | 100% |

## FMA + MTG-Jamendo -> ccMixter

Top1 49.15% / Top3 74.58% / balanced Top1 50.28%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| ambient | 94 | 5 | 20% | 80% |
| blues | 12 | 6 | 50% | 83.33% |
| classical | 66 | 9 | 66.67% | 77.78% |
| electronic | 53 | 6 | 16.67% | 66.67% |
| folk | 36 | 3 | 100% | 100% |
| hip-hop | 94 | 5 | 40% | 60% |
| house | 44 | 3 | 100% | 100% |
| jazz | 36 | 3 | 0% | 33.33% |
| noise | 67 | 5 | 60% | 60% |
| reggae | 15 | 8 | 50% | 87.5% |
| rock | 180 | 3 | 33.33% | 66.67% |
| techno | 57 | 3 | 66.67% | 66.67% |

## FMA + MTG-Jamendo + ccMixter -> IA netlabels

Top1 100% / Top3 100% / balanced Top1 100%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| metal | 10 | 5 | 100% | 100% |

## FMA + MTG-Jamendo + ccMixter -> Wikimedia category origins

Top1 96.88% / Top3 100% / balanced Top1 93.75%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| house | 44 | 8 | 87.5% | 100% |
| jazz | 36 | 24 | 100% | 100% |

## FMA詳細ラベルablation

FMA詳細ラベルなし -> ccMixter: Top1 46.94% / Top3 77.55% / balanced Top1 41.78%
FMA詳細ラベルあり -> ccMixter: Top1 53.06% / Top3 77.55% / balanced Top1 53.44%

## 昇格判定

独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。
次はHouse / Jazz / Disco / Deep Houseのproduction-safeな第2ソースtestを増やします。
