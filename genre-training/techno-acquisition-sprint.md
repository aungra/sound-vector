# Acquisition Sprint: テクノ

Generated: 2026-06-29T13:40:27.268Z

## Why This Sprint

このスプリントは、全ジャンル一括の重み調整を止め、1つの失敗タイプだけを潰すためのものです。対象ジャンルの明示ラベル音源と、近いジャンルの対照音源を追加してから、再学習は1回だけ行います。

## Current Target State

| field | value |
| --- | ---: |
| Genre | テクノ |
| Macro | electronic |
| Bucket | data-gap |
| Formal fine rows | 32 |
| Test rows | 9 |
| Fine Top1 | 0% |
| Fine Top3 | 11.1% |
| Style Top1 | 22.2% |

## Collect

| genre | role | target rows | reason |
| --- | --- | ---: | --- |
| テクノ | primary | 48 | Exact formal fine rows for the target label. Use only tracks whose source explicitly labels this genre/style. |
| ハウス | same-macro-contrast | 15 | Close contrast inside electronic; prevents the target from absorbing neighboring electronic/pop/acoustic styles. |
| トランス | same-macro-contrast | 15 | Close contrast inside electronic; prevents the target from absorbing neighboring electronic/pop/acoustic styles. |
| ドラムンベース | same-macro-contrast | 15 | Close contrast inside electronic; prevents the target from absorbing neighboring electronic/pop/acoustic styles. |
| ダブステップ | same-macro-contrast | 15 | Close contrast inside electronic; prevents the target from absorbing neighboring electronic/pop/acoustic styles. |
| チップチューン | same-macro-contrast | 15 | Close contrast inside electronic; prevents the target from absorbing neighboring electronic/pop/acoustic styles. |
| ダブ | hard-negative | 10 | Frequent wrong prediction for the target; add clean examples so the classifier learns the boundary. |
| ヒップホップ | hard-negative | 10 | Frequent wrong prediction for the target; add clean examples so the classifier learns the boundary. |
| ファンク | hard-negative | 10 | Frequent wrong prediction for the target; add clean examples so the classifier learns the boundary. |

## External Folder Layout

Audio root: `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629`

- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/テクノ` : 48 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ハウス` : 15 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/トランス` : 15 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ドラムンベース` : 15 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ダブステップ` : 15 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/チップチューン` : 15 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ダブ` : 10 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ヒップホップ` : 10 tracks
- `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629/ファンク` : 10 tracks

## Commands

外付けドライブへ音源を置いたあと、以下を順番に実行します:

```bash
MMFR_CC_DATASET_NAME='explicit-techno-sprint-20260629' MMFR_CC_LICENSE='REPLACE_WITH_LICENSE' MMFR_CC_LICENSE_URL='REPLACE_WITH_SOURCE_LICENSE_URL' MMFR_CC_REFERENCE_URL='REPLACE_WITH_DATASET_OR_COLLECTION_URL' MMFR_CC_MANIFEST_OUTPUT='/Users/kahanishimoto/Documents/MUSICTee/genre-training/techno-acquisition-sprint-manifest.json' npm --prefix apps/demo run cc-manifest:from-folder -- '/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/acquisition-sprints/techno-20260629'
MMFR_CC_MANIFEST_PATH='/Users/kahanishimoto/Documents/MUSICTee/genre-training/techno-acquisition-sprint-manifest.json' MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import
npm --prefix apps/demo run genre-train:formal-cached
npm --prefix apps/demo run genre-goal-report
npm --prefix apps/demo run genre-reset-roadmap
npm --prefix apps/demo run genre-acquisition-sprint -- 'テクノ'
```

## Score Gate

- Minimum formal fine rows after import: 80
- Minimum test rows: 10
- Next step: Only tune weights after formal rows and test coverage are stable. If Top3 remains low, audit source labels/features before reranking.

## Experiment Update

2026-06-30 に既存の MTG-Jamendo `genre---techno` 行を使って、fine 昇格実験を2回行った。

- Broad restore: 81行を戻すと、テクノ Top1 / Top3 は上がったが、全体 Fine Top1、Fine Top3、Formal Fine が下がったため不採用。
- Strict restore: 20行に絞って戻しても、テクノ Top3 と全体指標が下がったため不採用。

結論:

- 既存 MTG-Jamendo techno は broad electronic としては有効だが、fine `テクノ` の教師データとしてはまだノイズが強い。
- 次の音源補強は、MTGの追加昇格ではなく、明示的な techno / minimal techno / warehouse techno / acid techno 等のラベルを持つ別ソースを優先する。
- 候補としては Freesound Loop Dataset / Freesound API / CC系電子音楽アーカイブを優先し、フル曲でなくても loop 単位の electronic substyle 境界データとして扱う。

## Review Checklist

- Folder names must match source-seeds genre labels exactly.
- Each accepted track must have explicit genre/style labeling from the dataset, collection page, or metadata.
- Prefer full-length or stable 30s+ public research/CC files; avoid previews with unclear licensing.
- Reject live sets, DJ mixes, covers, and broad electronic-only labels for exact techno/pop substyle targets.
- After import, inspect target confusion before changing model weights.

## Fail Fast Rules

- Do not promote broad macro labels as exact fine labels.
- Do not mix AI-training-prohibited commercial stock music into formal training.
- Do not copy source audio into this repository.
- If a source uses mixed licenses, generate separate manifests or edit per-track license fields before import.
