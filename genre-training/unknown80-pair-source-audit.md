# Unknown80 pair source audit

A pair head is viable only when every outer fold retains at least two independent training sources per label.

| pair | status | sources | additional sources needed | blocked folds |
|---|---|---|---|---:|
| テクノ vs ハウス | viable-all-folds | テクノ 5 / ハウス 3 | テクノ +0 / ハウス +0 | 0 |
| ハウス vs ディープ・ハウス | blocked-source-coverage | ハウス 3 / ディープ・ハウス 2 | ハウス +0 / ディープ・ハウス +1 | 2 |
| テクノ vs トランス | blocked-source-coverage | テクノ 5 / トランス 1 | テクノ +0 / トランス +2 | 8 |
| レゲエ vs ダブ | blocked-source-coverage | レゲエ 4 / ダブ 2 | レゲエ +0 / ダブ +1 | 2 |
| アンビエント vs ドローン | blocked-source-coverage | アンビエント 3 / ドローン 2 | アンビエント +0 / ドローン +1 | 2 |
| ドローン vs ノイズミュージック | blocked-source-coverage | ドローン 2 / ノイズミュージック 2 | ドローン +1 / ノイズミュージック +1 | 2 |
| ロック vs メタル | viable-all-folds | ロック 4 / メタル 4 | ロック +0 / メタル +0 | 0 |
| ロック vs ファンク | blocked-source-coverage | ロック 4 / ファンク 2 | ロック +0 / ファンク +1 | 2 |
| ロック vs ブルース | blocked-source-coverage | ロック 4 / ブルース 2 | ロック +0 / ブルース +1 | 2 |
| クラシック音楽 vs オペラ | blocked-source-coverage | クラシック音楽 4 / オペラ 1 | クラシック音楽 +0 / オペラ +2 | 8 |

## Priority

- テクノ vs トランス: {'テクノ': 0, 'トランス': 2}
- クラシック音楽 vs オペラ: {'クラシック音楽': 0, 'オペラ': 2}
- ドローン vs ノイズミュージック: {'ドローン': 1, 'ノイズミュージック': 1}
- ハウス vs ディープ・ハウス: {'ハウス': 0, 'ディープ・ハウス': 1}
- レゲエ vs ダブ: {'レゲエ': 0, 'ダブ': 1}
- アンビエント vs ドローン: {'アンビエント': 0, 'ドローン': 1}
- ロック vs ファンク: {'ロック': 0, 'ファンク': 1}
- ロック vs ブルース: {'ロック': 0, 'ブルース': 1}

## Reproducibility

- Script SHA-256: `0aa7850af3bb1f9e7684f072b3b4f5a88be85c1333f6846403d311ed019d3b6d`
- OOF SHA-256: `a17948e1e07951e2d3891079afe573718a0c92c9ba15144fc64c03b34f9aed8f`
