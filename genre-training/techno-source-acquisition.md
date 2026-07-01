# Techno Source Acquisition

Generated: 2026-06-30

## Result So Far

既存の MTG-Jamendo `genre---techno` は、そのまま fine `テクノ` へ戻すと全体スコアを下げた。

| experiment | promoted | result |
| --- | ---: | --- |
| broad MTG restore | 81 | rejected |
| strict MTG restore | 20 | rejected |

Therefore, the next acquisition step should not be “promote more MTG techno”. It should be “add cleaner explicit techno evidence from a different source family”.

## Source Priority

1. Freesound Loop Dataset
   - Freesound由来のCreative Commons音源。
   - 専門家アノテーションで instrument / tempo / meter / key / genre tags を持つ。
   - フル曲ではなくloop中心だが、techno / house / drum and bass など electronic substyle 境界を学ばせる用途に向く。
   - Use as `sourceType: cc-dataset`, but mark `datasetName: Freesound Loop Dataset`.

2. Freesound API targeted collection
   - Freesound自体はCreative Commons音源の大規模リポジトリ。
   - `techno loop`, `minimal techno`, `warehouse techno`, `acid techno`, `four on floor`, `909`, `rave loop` などの検索語で候補を集める。
   - CC0 / CC-BY を優先し、CC-BY-NC は正式学習に入れる前に方針確認する。

3. Internet Archive / netlabel archives
   - techno / minimal techno / acid techno が明示されたCCリリースを探す。
   - アルバム単位のタグが広すぎる場合は fine ではなく macro-only にする。

4. Existing MTG-Jamendo
   - これ以上の broad promotion は行わない。
   - 使う場合は hard negative / macro electronic / contrast data として扱う。

## Acceptance Criteria

正式な fine `テクノ` に入れる条件:

- source page or metadata has explicit techno-family label.
- audio is CC / public research compatible.
- audio file stays outside repo.
- feature-only import succeeds.
- track is not a live DJ mix, long mixed set, generic “electronic”, or ambiguous trance/house label.
- if source is loop-only, mark `segmentType: loop` so later evaluation can separate full-track and loop evidence.

## Target Additions

For the next sprint:

| genre | target | role |
| --- | ---: | --- |
| テクノ | 50 | primary |
| ハウス | 20 | same-macro contrast |
| トランス | 20 | same-macro contrast |
| ドラムンベース | 20 | same-macro contrast |
| ダブステップ | 20 | same-macro contrast |
| チップチューン | 20 | same-macro contrast |

## Next Implementation

- Added a Freesound/FSLD candidate route instead of promoting MTG rows.
- Preserve source URL, license, license URL, Freesound id, tag list, and `segmentType`.
- Import with existing `cc-import` after files are placed outside the repo.
- Evaluate loop-only data separately before mixing it into full-track formal scores.

## Implemented Commands

Collect candidates:

```bash
FREESOUND_API_TOKEN='YOUR_TOKEN' npm --prefix apps/demo run freesound-cc-collect
```

Review candidates:

```text
genre-training/freesound-cc-review.tsv
```

Set `reviewStatus` to `approved` only for usable CC0 / CC-BY candidates.

After approved audio is downloaded outside the repo:

```bash
npm --prefix apps/demo run freesound-cc-manifest -- /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/freesound
MMFR_CC_MANIFEST_PATH='/Users/kahanishimoto/Documents/MUSICTee/genre-training/freesound-cc-source-manifest.json' MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import
npm --prefix apps/demo run genre-train:formal-cached
npm --prefix apps/demo run genre-goal-report
```

## Implemented Files

- `apps/demo/scripts/freesound-cc-collect.mjs`
- `apps/demo/scripts/freesound-cc-manifest.mjs`
- `genre-training/freesound-cc-candidates.json`
- `genre-training/freesound-cc-review.tsv`
- `genre-training/freesound-cc-collect-report.md`
- `genre-training/freesound-cc-source-manifest.json`
