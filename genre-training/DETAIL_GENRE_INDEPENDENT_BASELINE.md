# 詳細ジャンル独立ソースベースライン

生成日時: 2026-08-27T01:04:40.087Z

CC0 / Public Domain / CC-BY / CC-BY-SAのフル楽曲だけを使用しています。NC・ND・研究限定・ループ素材は含みません。
この評価は対象分類が少ないため120分類全体の精度ではありません。

## MTG-Jamendo -> FMA

Top1 64.48% / Top3 89.19% / balanced Top1 63.17%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 10 | 26 | 92.31% | 100% |
| hip-hop | 10 | 89 | 70.79% | 95.51% |
| house | 13 | 15 | 53.33% | 100% |
| metal | 10 | 25 | 48% | 88% |
| rock | 24 | 72 | 58.33% | 72.22% |
| techno | 21 | 32 | 56.25% | 96.88% |

## FMA -> MTG-Jamendo

Top1 66.92% / Top3 98.5% / balanced Top1 71.15%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| classical | 25 | 19 | 63.16% | 100% |
| hip-hop | 78 | 26 | 88.46% | 100% |
| house | 13 | 13 | 69.23% | 84.62% |
| metal | 22 | 10 | 100% | 100% |
| rock | 66 | 27 | 48.15% | 100% |
| techno | 32 | 38 | 57.89% | 100% |

## FMA + MTG-Jamendo -> ccMixter

Top1 36.11% / Top3 66.67% / balanced Top1 34.64%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| ambient | 79 | 5 | 0% | 60% |
| blues | 12 | 6 | 66.67% | 83.33% |
| classical | 35 | 9 | 66.67% | 77.78% |
| dubstep | 13 | 2 | 50% | 50% |
| electronic | 21 | 6 | 0% | 66.67% |
| folk | 26 | 3 | 66.67% | 100% |
| funk | 27 | 3 | 0% | 33.33% |
| hip-hop | 88 | 5 | 20% | 40% |
| house | 26 | 3 | 66.67% | 100% |
| idm | 10 | 3 | 0% | 100% |
| jazz | 26 | 3 | 0% | 0% |
| noise | 53 | 5 | 60% | 60% |
| punk | 23 | 5 | 20% | 100% |
| reggae | 15 | 8 | 37.5% | 62.5% |
| rock | 90 | 3 | 33.33% | 33.33% |
| techno | 53 | 3 | 66.67% | 66.67% |

## FMA + MTG-Jamendo + ccMixter -> IA netlabels

Top1 52% / Top3 100% / balanced Top1 70%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| metal | 32 | 5 | 100% | 100% |
| post-punk | 14 | 20 | 40% | 100% |

## FMA + MTG-Jamendo + ccMixter -> Wikimedia category origins

Top1 85.96% / Top3 100% / balanced Top1 84.13%

| detail | train | test | Top1 | Top3 |
| --- | ---: | ---: | ---: | ---: |
| chiptune | 68 | 17 | 82.35% | 100% |
| house | 26 | 8 | 75% | 100% |
| jazz | 26 | 24 | 91.67% | 100% |
| opera | 15 | 8 | 87.5% | 100% |

## FMA詳細ラベルablation

FMA詳細ラベルなし -> ccMixter: Top1 48.98% / Top3 81.63% / balanced Top1 43.53%
FMA詳細ラベルあり -> ccMixter: Top1 51.02% / Top3 77.55% / balanced Top1 48.53%

## 昇格判定

Operaを含む独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。
Post-punkは独立IAでTop3 100%に対してTop1 40%のため昇格せず、ChoralとDeep Houseの第2originを5曲以上へ補完します。
