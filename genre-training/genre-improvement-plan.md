# Genre Improvement Plan

Generated: 2026-06-21T11:32:27.168Z

## Current Score

- Status: needs-formal-cc-audio
- Formal status: available
- Reference Macro Top1: 32.8%
- Reference Fine Top1: 13.7%
- Reference Fine Top3: 25.5%
- Formal ready genres: 23
- Passing genres: 0
- MTG selected audio: 630/1199 ready
- Manifest ready rows: 2 / rejected rows: 0
- Average reference artists per genre: 9.5
- Low artist-diversity genres: 16

## Blockers

- No reviewed CC/public candidates are approved yet.
- No approved audio files are ready on external storage yet.
- MTG-Jamendo audio-low is missing 569 selected file(s).
- 16 genre(s) are below the artist-diversity target.
- Formal test coverage is below the 30-genre target.

## Next Five Actions

| Genre | Band | Formal | Potential | Test | Top1 | Top3 | Next action |
|---|---:|---:|---:|---:|---:|---:|---|
| シティ・ポップ | unstable-test | 3/100 | 63 | 0 | n/a | n/a | Place verified CC/public-research audio in genre-named folders on an external drive, generate a manifest with cc-manifest:from-folder, then import with cc-import. |
| アニメソング | unstable-test | 6/50 | 8 | 1 | 0% | 0% | Place verified CC/public-research audio in genre-named folders on an external drive, generate a manifest with cc-manifest:from-folder, then import with cc-import. |
| ハードコア | unstable-test | 11/50 | 55 | 2 | 0% | 0% | Place verified CC/public-research audio in genre-named folders on an external drive, generate a manifest with cc-manifest:from-folder, then import with cc-import. |
| ディープ・ハウス | unstable-test | 18/50 | 64 | 3 | 0% | 33.3% | Resume Download FMA Small.command, unzip outside the repo, then run cc-import:fma against the FMA tracks.csv and audio root. |
| トラップ | unstable-test | 41/50 | 41 | 9 | 0% | 11.1% | Place verified CC/public-research audio in genre-named folders on an external drive, generate a manifest with cc-manifest:from-folder, then import with cc-import. |

## No Formal Data

_None._

## Classifier Confusion Hints

- ダブ -> ヒップホップ: 4 example(s). Increase reviewed formal audio for ダブ, then tune features that separate it from ヒップホップ.
- テクノ -> J-POP: 4 example(s). Increase reviewed formal audio for テクノ, then tune features that separate it from J-POP.
- トランス -> テクノ: 4 example(s). Increase reviewed formal audio for トランス, then tune features that separate it from テクノ.
- ハウス -> クラシック音楽: 4 example(s). Increase reviewed formal audio for ハウス, then tune features that separate it from クラシック音楽.
- ファンク -> ヒップホップ: 4 example(s). Increase reviewed formal audio for ファンク, then tune features that separate it from ヒップホップ.
- フォーク -> アンビエント: 4 example(s). Increase reviewed formal audio for フォーク, then tune features that separate it from アンビエント.
- J-POP -> ヒップホップ: 3 example(s). Increase reviewed formal audio for J-POP, then tune features that separate it from ヒップホップ.
- アンビエント -> ノイズミュージック: 3 example(s). Increase reviewed formal audio for アンビエント, then tune features that separate it from ノイズミュージック.
- アンビエント -> ダブ: 3 example(s). Increase reviewed formal audio for アンビエント, then tune features that separate it from ダブ.
- ジャズ -> レゲエ: 3 example(s). Increase reviewed formal audio for ジャズ, then tune features that separate it from レゲエ.
- ジャズ -> チップチューン: 3 example(s). Increase reviewed formal audio for ジャズ, then tune features that separate it from チップチューン.
- ジャズ -> ロック: 3 example(s). Increase reviewed formal audio for ジャズ, then tune features that separate it from ロック.