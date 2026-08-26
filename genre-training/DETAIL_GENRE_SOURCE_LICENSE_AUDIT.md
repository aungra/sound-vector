# 詳細ジャンル学習ライセンス監査

生成日時: 2026-08-26T16:27:53.228Z

| source | rows | detail labels | production | support only | research only | ND excluded | verify |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| existing-explicit-formal | 385 | 14 | 46 | 0 | 254 | 85 | 0 |
| MTG-Jamendo-candidates | 1819 | 39 | 498 | 0 | 809 | 417 | 95 |
| FMA-independent-candidates | 4514 | 7 | 1288 | 0 | 1841 | 1377 | 8 |
| WaivOps-rhythm-support | 49 | 2 | 0 | 49 | 0 | 0 | 0 |
| RWC-research-only | 200 | 21 | 0 | 0 | 200 | 0 | 0 |

## 独立ソースcoverage

- 本番利用可能なソースあり: 33/120
- 本番利用可能な2ソース以上: 9/120
- 本番利用可能なソースなし: 87/120
- 2ソース達成: classical / blues / jazz / folk / electronic / funk / hip-hop / dub / rock

## 採用規則

- `CC0 / Public Domain / CC-BY / CC-BY-SA`: 本番学習候補。帰属とライセンス証拠をmanifestに保持する。
- `CC-BY-NC / CC-BY-NC-SA / RWC`: 研究比較専用。本番モデルへ混入しない。
- `CC-BY-ND / CC-BY-NC-ND`: 保守的に学習対象外。
- ライセンスが `Creative Commons` としか分からない曲: 曲単位の確認まで保留。
- ループ、stem、sound-event: 許諾があっても補助特徴専用。フル楽曲のジャンル正解にはしない。

## 確認した一次情報

- RWC Music Database 2026 release: CC BY-NC 4.0, research purposes. https://zenodo.org/records/18656623
- MTG-Jamendo: per-track Creative Commons licenses in `audio_licenses.txt`. https://github.com/MTG/mtg-jamendo-dataset
- WaivOps EDM-HSE: CC BY 4.0 and explicitly intended for machine learning. https://doi.org/10.5281/zenodo.13769544
- WaivOps EDM-TECH: CC BY 4.0 and explicitly intended for model development. https://doi.org/10.5281/zenodo.17584890
- Creative Commons license conditions. https://creativecommons.org/share-your-work/cclicenses/

この分類はプロジェクトの保守的な運用規則であり、法律上の助言ではありません。
