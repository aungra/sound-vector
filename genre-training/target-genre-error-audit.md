# Target Genre Error Audit

Generated: 2026-06-22T12:08:48.236Z

## Summary

| genre | total | top1 | top3 | styleTop1 | styleTop3 | macro | needsReview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| テクノ | 19 | 5.3 | 5.3 | 10.5 | 47.4 | 36.8 | 3 |
| ドローン | 26 | 11.5 | 19.2 | 23.1 | 50 | 23.1 | 1 |
| ダブ | 17 | 29.4 | 58.8 | 29.4 | 100 | 64.7 | 2 |
| シティ・ポップ | 10 | 90 | 100 | 90 | 100 | 40 | 1 |

## Wrong Prediction Patterns

### テクノ

| label | count |
| --- | --- |
| ダブ | 3 |
| トランス | 2 |
| ハウス | 2 |
| レゲエ | 2 |
| クラシック音楽 | 1 |
| ソウルミュージック | 1 |
| チップチューン | 1 |
| ドローン | 1 |
| ノイズミュージック | 1 |
| パンク | 1 |
| ヒップホップ | 1 |
| ファンク | 1 |

Style-layer wrong predictions:

| label | count |
| --- | --- |
| (empty) | 10 |
| electronic_other | 7 |

False positives from:

| label | count |
| --- | --- |
| ノイズミュージック | 1 |
| ハウス | 1 |
| ヒップホップ | 1 |

### ドローン

| label | count |
| --- | --- |
| クラシック音楽 | 4 |
| アンビエント | 3 |
| チップチューン | 3 |
| レゲエ | 3 |
| ダブ | 2 |
| トランス | 2 |
| ドローン | 2 |
| J-POP | 1 |
| ソウルミュージック | 1 |
| ディスコ | 1 |
| メタル | 1 |

Style-layer wrong predictions:

| label | count |
| --- | --- |
| (empty) | 13 |
| ambient_other | 7 |

False positives from:

| label | count |
| --- | --- |
| オペラ | 4 |
| ディスコ | 2 |
| ノイズミュージック | 2 |
| インド音楽 | 1 |
| ジャズ | 1 |
| ソウルミュージック | 1 |
| テクノ | 1 |
| パンク | 1 |
| フラメンコ | 1 |
| ブルース | 1 |
| メタル | 1 |
| レゲエ | 1 |

### ダブ

| label | count |
| --- | --- |
| ヒップホップ | 4 |
| J-POP | 2 |
| ダブステップ | 2 |
| レゲエ | 2 |
| トランス | 1 |
| ノイズミュージック | 1 |

Style-layer wrong predictions:

| label | count |
| --- | --- |
| black_music_other | 12 |

False positives from:

| label | count |
| --- | --- |
| ダブステップ | 4 |
| アンビエント | 3 |
| テクノ | 3 |
| トランス | 3 |
| オペラ | 2 |
| ドラムンベース | 2 |
| ドローン | 2 |
| ハウス | 2 |
| フォーク | 2 |
| ソウルミュージック | 1 |
| ハードコア | 1 |
| パンク | 1 |

### シティ・ポップ

| label | count |
| --- | --- |
| pop_other | 1 |

Style-layer wrong predictions:

| label | count |
| --- | --- |
| pop_other | 1 |

False positives from:

| label | count |
| --- | --- |
| J-POP | 3 |

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

- ドローンはstyle補助でsustain/transient scarcityをさらに強める。genre本体へ直接入れるよりambient内補助分類で先に分離度を上げる。
- ダブはヒップホップ/ダブステップと混同。低域だけでなくreverbTail/offbeat/highBand暗さの複合条件をダブ候補内に限定して使う。
- シティ・ポップはgenre正解ではなくcity_pop styleHintとして評価する。RWC由来の代理情報なので、J-POP正解を壊さない補助判定として扱う。
