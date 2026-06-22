# Target Genre Error Audit

Generated: 2026-06-21T18:06:15.834Z

## Summary

| genre | total | top1 | top3 | macro | needsReview |
| --- | --- | --- | --- | --- | --- |
| テクノ | 15 | 6.7 | 26.7 | 26.7 | 1 |
| ドローン | 11 | 0 | 18.2 | 27.3 | 1 |
| ダブ | 17 | 23.5 | 52.9 | 58.8 | 3 |
| シティ・ポップ | 0 |  |  |  | 0 |

## Wrong Prediction Patterns

### テクノ

| label | count |
| --- | --- |
| レゲエ | 3 |
| J-POP | 2 |
| ハウス | 2 |
| ロック | 2 |
| アンビエント | 1 |
| ジャズ | 1 |
| ダブ | 1 |
| ダブステップ | 1 |
| ブルース | 1 |

False positives from:

| label | count |
| --- | --- |
| ハウス | 3 |
| トラップ | 2 |
| トランス | 2 |
| ブルース | 2 |
| J-POP | 1 |
| アフリカ音楽 | 1 |
| アンビエント | 1 |
| ダブ | 1 |
| チップチューン | 1 |
| ディスコ | 1 |
| ノイズミュージック | 1 |
| ヒップホップ | 1 |

### ドローン

| label | count |
| --- | --- |
| ブルース | 3 |
| アンビエント | 2 |
| クラシック音楽 | 1 |
| ジャズ | 1 |
| ダブ | 1 |
| ノイズミュージック | 1 |
| メタル | 1 |
| レゲエ | 1 |

False positives from:

| label | count |
| --- | --- |
| パンク | 2 |
| ディスコ | 1 |
| ドラムンベース | 1 |
| ヒップホップ | 1 |

### ダブ

| label | count |
| --- | --- |
| ヒップホップ | 4 |
| ダブステップ | 3 |
| J-POP | 1 |
| テクノ | 1 |
| ドラムンベース | 1 |
| ハウス | 1 |
| ラテン | 1 |
| レゲエ | 1 |

False positives from:

| label | count |
| --- | --- |
| ダブステップ | 4 |
| アンビエント | 3 |
| ジャズ | 2 |
| ハウス | 2 |
| ブルース | 2 |
| テクノ | 1 |
| ドローン | 1 |
| パンク | 1 |
| ロック | 1 |
| ワールドミュージック | 1 |
| 電子音楽 | 1 |

### シティ・ポップ

_none_

False positives from:

_none_

## City Pop Label Quality

Verified rows: 24

Formal rows: 0

Formal evidence:

_none_

Adjacent formal rows:

_none_

## Recommendations

- テクノはJ-POP/ハウスへの混同が残る。four-on-floor/kick gridを直接入れる前に、テクノtest誤判定だけで分離度検定する。
- ドローンは現在Top1が0。ambient/classical/blues系との混同を個別に見て、sustain/transient特徴量の局所適用を検討する。
- ダブはヒップホップ/ダブステップと混同。低域だけでなくreverbTail/offbeat/highBand暗さの複合条件をダブ候補内に限定して使う。
