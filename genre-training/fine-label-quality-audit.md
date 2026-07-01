# Fine Label Quality Audit

Generated: 2026-06-22T11:38:31.678Z

This audit uses a temporary train+validation+test evaluation to find formal fine rows that remain high-confidence misses even when the classifier has seen train data. It is not an official accuracy report.

## Summary

| genre | total | exact | top3 | hardMissCount | highConfidenceHardMissCount | falsePositiveCount |
| --- | --- | --- | --- | --- | --- | --- |
| ドローン | 88 | 65 | 69 | 19 | 19 | 20 |
| テクノ | 38 | 24 | 24 | 14 | 14 | 20 |
| ダブ | 100 | 75 | 83 | 17 | 17 | 37 |

## Review Candidates

| priority | genre | split | predicted | datasetName | trackId | title | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| high | ドローン | test | レゲエ | FMA | 45387 | Come Fly With Me | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | レゲエ | FMA | 45389 | Nort rv. | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | クラシック音楽 | FMA | 45391 | Like Summer Tempests Came His Tears | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | クラシック音楽 | FMA | 45392 | Intracellularisan | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | トランス | FMA | 133333 | Alien Samba Kollage and Subversive Intentions Symphodrone Mix | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | メタル | FMA | 7548 | First Movement | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | チップチューン | FMA | 7554 | Seventh Movement | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | ダブ | FMA | 19707 | Inside the Rain | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | メタル | FMA | 27856 | Rival | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | test | チップチューン | FMA | 35007 | Volker Goes to Spain | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | ラテン | FMA | 43016 | [conclusion] | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | トランス | FMA | 43018 | Oske Cherde | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | レゲエ | FMA | 43019 | [interview] | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | フォーク | FMA | 43020 | Sygyt | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | レゲエ | FMA | 43021 | [interview] | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | フォーク | FMA | 43022 | Kongurri | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | クラシック音楽 | FMA | 43024 | Kargyraa | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | ラテン | FMA | 43025 | [interview] | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ドローン | validation | ラテン | FMA | 43026 | Chyraa Khoor | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | validation | レゲエ | FMA | 57417 | Opasenye [NONIMX] | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | test | ファンク | FMA | 125154 | Hipster's Call | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | test | ドローン | FMA | 125156 | Big Fatty | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | test | パンク | FMA | 125157 | The Far Land | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | test | ダブステップ | FMA | 125159 | Reel Life | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| medium | テクノ | test | ノイズミュージック | FMA | 125160 | Stargate Pumpin | actual-not-in-top3, high-confidence-wrong, broad-fma-label |
| medium | テクノ | test | チップチューン | FMA | 125161 | Love Is All | actual-not-in-top3, high-confidence-wrong, broad-fma-label |
| medium | テクノ | test | ハウス | FMA | 125999 | Zon | actual-not-in-top3, high-confidence-wrong, broad-fma-label |
| high | テクノ | test | ヒップホップ | FMA | 126292 | Universal Warrior (Special Edition) | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | validation | レゲエ | FMA | 144424 | Happy Jambo Remix | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | validation | ソウルミュージック | FMA | 148444 | Haka | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | テクノ | validation | ヒップホップ | MTG-Jamendo | track_0044210 | Noize-R & NTX 13 - Industrial Drummers | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-mtg-label |
| high | テクノ | validation | ヒップホップ | MTG-Jamendo | track_0044216 | DJ Guit - Fuck Everybody | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-mtg-label |
| high | テクノ | validation | ダブ | MTG-Jamendo | track_0240538 | Elise (remix) | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-mtg-label |
| medium | ダブ | test | レゲエ | FMA | 25603 | Tribute to Volfoniq (Auverne Mix) | actual-not-in-top3, high-confidence-wrong, broad-fma-label |
| medium | ダブ | test | ヒップホップ | FMA | 25605 | Tribute to Disrupt (Nah Fuk Round Riddim) | actual-not-in-top3, high-confidence-wrong, broad-fma-label |
| high | ダブ | test | ノイズミュージック | FMA | 25609 | Leipzig Im Winter | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ダブ | test | J-POP | FMA | 25797 | Adubando | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ダブ | test | ダブステップ | FMA | 53157 | Dub Stepping Version B | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ダブ | test | J-POP | FMA | 53301 | Ephemeral Dub | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |
| high | ダブ | validation | J-POP | FMA | 54436 | Balkanyk Dub | actual-not-in-top3, macro-mismatch, high-confidence-wrong, broad-fma-label |

## Recommendation

- Do not auto-holdout these rows yet; use this as a listening/source-review queue.
- Prioritize `ドローン` rows with `macro-mismatch` and FMA/MTG broad labels, because previous drone fine expansion lowered official Fine Top1.
- If confirmed noisy, add track-level `macro-only` rules rather than broad genre removal.
