# Target Genre Error Audit

Generated: 2026-06-22T05:23:37.455Z

## Summary

| genre | total | top1 | top3 | macro | needsReview |
| --- | --- | --- | --- | --- | --- |
| テクノ | 15 | 6.7 | 20 | 33.3 | 1 |
| ドローン | 11 | 0 | 18.2 | 27.3 | 1 |
| ダブ | 17 | 23.5 | 47.1 | 58.8 | 2 |
| シティ・ポップ | 10 | 80 | 100 | 30 | 0 |

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
| ダブ | 2 |
| トラップ | 2 |
| トランス | 2 |
| ヒップホップ | 2 |
| ブルース | 2 |
| アフリカ音楽 | 1 |
| アンビエント | 1 |
| チップチューン | 1 |
| ディスコ | 1 |
| ノイズミュージック | 1 |
| メタル | 1 |

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
| ジャズ | 1 |
| ディスコ | 1 |
| ドラムンベース | 1 |
| ヒップホップ | 1 |

### ダブ

| label | count |
| --- | --- |
| ヒップホップ | 4 |
| ダブステップ | 3 |
| テクノ | 2 |
| ドラムンベース | 1 |
| ハウス | 1 |
| ラテン | 1 |
| レゲエ | 1 |

False positives from:

| label | count |
| --- | --- |
| アンビエント | 3 |
| ダブステップ | 3 |
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

| label | count |
| --- | --- |
| pop_other | 2 |

False positives from:

| label | count |
| --- | --- |
| ダブ | 15 |
| ハウス | 11 |
| テクノ | 10 |
| ワールドミュージック | 9 |
| トランス | 8 |
| ヒップホップ | 8 |
| ファンク | 8 |
| チップチューン | 7 |
| ディスコ | 7 |
| ジャズ | 6 |
| 電子音楽 | 6 |
| ソウルミュージック | 5 |

## City Pop Label Quality

Verified rows: 60

Formal rows: 60

Formal evidence:

| sourceType | datasetName | title | evidence | review |
| --- | --- | --- | --- | --- |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.002 - RWC P002 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.004 - RWC P004 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.006 - RWC P006 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.007 - RWC P007 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.008 - RWC P008 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.010 - RWC P010 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.011 - RWC P011 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.012 - RWC P012 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.014 - RWC P014 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.015 - RWC P015 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.016 - RWC P016 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.017 - RWC P017 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.018 - RWC P018 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.019 - RWC P019 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.020 - RWC P020 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.021 - RWC P021 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.022 - RWC P022 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.023 - RWC P023 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.024 - RWC P024 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.025 - RWC P025 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.029 - RWC P029 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.031 - RWC P031 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.032 - RWC P032 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.033 - RWC P033 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.035 - RWC P035 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.036 - RWC P036 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.038 - RWC P038 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.040 - RWC P040 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.041 - RWC P041 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.042 - RWC P042 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.044 - RWC P044 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.045 - RWC P045 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.047 - RWC P047 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.048 - RWC P048 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.049 - RWC P049 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.050 - RWC P050 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.051 - RWC P051 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.052 - RWC P052 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.053 - RWC P053 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.054 - RWC P054 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.056 - RWC P056 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.057 - RWC P057 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.058 - RWC P058 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.059 - RWC P059 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.061 - RWC P061 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.063 - RWC P063 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.068 - RWC P068 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.073 - RWC P073 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.074 - RWC P074 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.081 - RWC P081 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.084 - RWC P084 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.085 - RWC P085 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.088 - RWC P088 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.090 - RWC P090 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.091 - RWC P091 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.092 - RWC P092 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.093 - RWC P093 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.096 - RWC P096 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.098 - RWC P098 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |
| cc-dataset | RWC Music Database: Popular Music Database | RWC Popular No.100 - RWC P100 | RWC Popular Japanese-pop source selected as J-POP with city_pop styleHint; not an official RWC city-pop genre label. | citypop-stylehint-rwc-japanese-pop |

Adjacent formal rows:

_none_

## Recommendations

- テクノはJ-POP/ハウスへの混同が残る。four-on-floor/kick gridを直接入れる前に、テクノtest誤判定だけで分離度検定する。
- ドローンは現在Top1が0。ambient/classical/blues系との混同を個別に見て、sustain/transient特徴量の局所適用を検討する。
- ダブはヒップホップ/ダブステップと混同。低域だけでなくreverbTail/offbeat/highBand暗さの複合条件をダブ候補内に限定して使う。
- シティ・ポップはgenre正解ではなくcity_pop styleHintとして評価する。RWC由来の代理情報なので、J-POP正解を壊さない補助判定として扱う。
