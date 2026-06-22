# MTG-Jamendo Audio Plan

Generated: 2026-06-17T06:54:08.325Z

Audio root: `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/mtg-jamendo/raw_30s/audio-low`

Selected rows: 1199
Max per artist per genre: 8
Existing audio rows: 630
Missing audio rows: 569

The official MTG-Jamendo downloader fetches archive chunks for `raw_30s/audio-low`. This file narrows the target to the tracks this app would use after the audio is present.

## Next Commands

```bash
npm --prefix apps/demo run cc-manifest:mtg-jamendo -- /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/mtg-jamendo/raw_30s/audio-low
npm --prefix apps/demo run cc-import
npm --prefix apps/demo run genre-train:cached
npm --prefix apps/demo run genre-goal-report
npm --prefix apps/demo run genre-improvement-plan
```

## Required Audio By Genre

| Genre | Selected | Artists | Existing | Missing | Sample source paths |
|---|---:|---:|---:|---:|---|
| ノイズミュージック | 50/50 | 21 | 0 | 50 | 64/2264.mp3, 43/20743.mp3, 44/20744.mp3, 99/53499.mp3, 25/77425.mp3 |
| ヒップホップ | 50/50 | 11 | 0 | 50 | 11/43411.mp3, 12/43412.mp3, 13/43413.mp3, 15/43415.mp3, 16/43416.mp3 |
| ファンク | 50/50 | 19 | 0 | 50 | 11/2211.mp3, 12/2212.mp3, 13/2213.mp3, 15/2215.mp3, 16/2216.mp3 |
| ブルース | 50/50 | 16 | 0 | 50 | 63/4563.mp3, 36/4636.mp3, 80/4880.mp3, 88/5088.mp3, 84/11184.mp3 |
| メタル | 50/50 | 15 | 0 | 50 | 15/215.mp3, 16/216.mp3, 19/219.mp3, 23/223.mp3, 26/226.mp3 |
| ラテン | 50/50 | 18 | 0 | 50 | 57/30857.mp3, 58/30858.mp3, 60/30860.mp3, 61/30861.mp3, 62/30862.mp3 |
| レゲエ | 50/50 | 14 | 0 | 50 | 08/6008.mp3, 12/6012.mp3, 13/6013.mp3, 14/6014.mp3, 15/6015.mp3 |
| ロック | 50/50 | 14 | 0 | 50 | 41/241.mp3, 42/242.mp3, 43/243.mp3, 44/244.mp3, 45/245.mp3 |
| ワールドミュージック | 50/50 | 12 | 0 | 50 | 94/22894.mp3, 82/36982.mp3, 83/36983.mp3, 84/36984.mp3, 85/36985.mp3 |
| ハウス | 50/50 | 20 | 1 | 49 | 28/155328.mp3, 38/182138.mp3, 92/182492.mp3, 05/182505.mp3, 48/202948.mp3 |
| ダブステップ | 50/50 | 28 | 21 | 29 | 26/161326.mp3, 35/358735.mp3, 34/392534.mp3, 68/417368.mp3, 70/513470.mp3 |
| フォーク | 50/50 | 16 | 33 | 17 | 34/2634.mp3, 35/2635.mp3, 36/2636.mp3, 37/2637.mp3, 39/2639.mp3 |
| ディスコ | 50/50 | 23 | 36 | 14 | 51/851.mp3, 52/852.mp3, 53/853.mp3, 54/854.mp3, 55/855.mp3 |
| ソウルミュージック | 49/50 | 27 | 44 | 5 | 07/28107.mp3, 40/71540.mp3, 95/105095.mp3, 60/105160.mp3, 68/160068.mp3 |
| パンク | 50/50 | 9 | 46 | 4 | 14/214.mp3, 17/217.mp3, 18/218.mp3, 20/220.mp3, 21/221.mp3 |
| テクノ | 100/100 | 38 | 99 | 1 | 22/24022.mp3, 24/24024.mp3, 64/30664.mp3, 86/30686.mp3, 72/40572.mp3 |
| アンビエント | 50/50 | 15 | 50 | 0 | 46/946.mp3, 47/947.mp3, 48/948.mp3, 50/950.mp3, 51/951.mp3 |
| クラシック音楽 | 100/100 | 27 | 100 | 0 | 82/382.mp3, 83/383.mp3, 84/384.mp3, 85/385.mp3, 86/386.mp3 |
| ジャズ | 50/50 | 15 | 50 | 0 | 49/2249.mp3, 33/3933.mp3, 35/3935.mp3, 36/3936.mp3, 39/3939.mp3 |
| ダブ | 100/100 | 33 | 100 | 0 | 20/3520.mp3, 26/3526.mp3, 60/7760.mp3, 61/7761.mp3, 62/7762.mp3 |
| トランス | 50/50 | 24 | 50 | 0 | 21/40621.mp3, 35/49235.mp3, 95/135695.mp3, 93/185693.mp3, 94/185694.mp3 |