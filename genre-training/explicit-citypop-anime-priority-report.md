# Explicit City Pop / Anime Song Priority Report

Generated: 2026-06-21

Purpose: increase `シティ・ポップ` and `アニメソング` with explicit labels only, while keeping formal training limited to Creative Commons / public research / local audio sources.

## Current Formal Counts

- `J-POP`: enough formal rows for the current target, but accuracy is still weak and needs better feature separation.
- `シティ・ポップ`: critically short. Goal report shows only 3 formal training rows against the 100-row priority target.
- `アニメソング`: still short. Local count is higher than before, but explicit defensible formal rows remain limited.

## Priority 1: Existing Local FMA / MTG-Jamendo

Status: checked.

Result:

- FMA has one strong explicit `アニメソング` metadata candidate:
  - `Anime Theme` / The Antti Jädertpolm Quartet / `Anime EP`
  - License metadata: CC-BY-NC-SA
  - FMA subset: `medium`
  - Current local audio: not present in `fma_small`
- MTG-Jamendo did not provide enough exact `シティ・ポップ` or `アニメソング` local-audio candidates. Most useful matches are adjacent labels such as `anime house`, `future funk`, `synthpop`, or AOR-like tags, so they should not be promoted as exact formal labels.

Decision:

- Do not formal-promote metadata-only rows.
- If FMA medium/full audio is acquired externally, `Anime Theme` can be reviewed and then imported as a defensible `アニメソング` row.

## Priority 2: Internet Archive / Wikimedia / Openverse

Status: collected and separated into exact vs adjacent review queues.

Outputs:

- `genre-training/explicit-citypop-anime-candidates.json`
- `genre-training/explicit-citypop-anime-review.tsv`
- `genre-training/explicit-citypop-anime-review.html`

Result:

- 271 candidates collected.
- Exact candidates:
  - `アニメソング`: 6
  - `シティ・ポップ`: 19
- Adjacent candidates:
  - `アニメソング`: 189
  - `シティ・ポップ`: 57
- Formal eligible without manual approval: 0

Decision:

- Internet Archive exact rows are review-only for now.
- Many `シティ・ポップ` rows are commercial artist uploads, best compilations, CD boxes, or unclear-license uploads.
- `Plastic Love` by Astrophysics is explicit and CC-marked, but it is a cover/derivative of a commercial city-pop work. Keep it out of formal unless we explicitly decide that derivative CC covers are acceptable.
- Use `reviewStatus=approved` only when the page, license, and listening review support exact use.

## Priority 3: Hugging Face / Zenodo Research Sources

Status: investigated.

Findings:

- IdolSongsJp is useful for `J-POP`, not exact `アニメソング` or `シティ・ポップ`.
- jaCappella is useful for Japanese vocal/pop macro support, not exact `アニメソング` or `シティ・ポップ`.
- AnimeTAB and related anime-song research sources are symbolic/annotation-oriented, not mastered audio formal data.
- J-POP singing-technique datasets are annotation datasets over commercial recordings; they are useful for feature design, not formal audio import.

Decision:

- Keep these as auxiliary or reference sources unless they include redistributable or locally acquired audio with explicit labels.
- Do not relabel IdolSongsJp as `アニメソング`.

## Priority 4: Review TSV

Status: ready.

Rule:

- Only rows with `reviewStatus=approved` are eligible for manifest generation.
- Adjacent labels are rejected by default.
- Rows with safety flags are rejected by default.
- Audio must exist locally or be explicitly downloaded to external storage.

Most defensible first review target:

- FMA `Anime Theme`, but it requires external acquisition of FMA medium/full audio because it is not in local `fma_small`.

Rows to avoid for formal exact labels:

- Commercial city-pop artist uploads with unclear license.
- Best albums, CD box sets, album rips, vinyl rips.
- OST/opening/soundtrack rows with commercial rights risk.
- Future funk, synthpop, AOR, vocaloid, game music, anime house unless treated as adjacent/auxiliary labels.

## Priority 5: Approved-only Formal Import

Status: implemented and dry-run checked.

Command:

```bash
npm --prefix apps/demo run explicit-citypop-anime-manifest
```

Current result:

- selected: 0
- rejected: 0

This is correct because no review rows have been approved yet.

## Priority 6: Retrain

Status: not run for this queue because there are no approved formal imports.

Current goal report:

- formal-ready genres: 23 / 30
- fine-evaluable genres: 30
- passing genres: 0
- reference Macro Top1: 32.8%
- reference Fine Top1: 13.7%
- reference Fine Top3: 25.5%

## Recommended Next Action

1. Acquire FMA medium/full audio externally, then import the `Anime Theme` row after listening review.
2. Treat exact city-pop as a manual acquisition problem, not an automatic web-scraping problem.
3. Add a separate `city-pop-adjacent` auxiliary label for future funk / AOR / synthpop / Japanese boogie so the classifier can learn the boundary without corrupting `シティ・ポップ` ground truth.
4. Keep `シティ・ポップ` formal strict until a rights-cleared curated set is available.
5. For near-term score gain, focus on feature/model improvements and genres with enough formal rows. For 30 genres at 80%, exact sparse genres need acquired audio, not label relaxation.
