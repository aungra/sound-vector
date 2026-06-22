# Genre Training

This folder calibrates the genre estimator from verified audio features.

The current policy is CC/public-research local audio first:

- Creative Commons / public research datasets are preferred for score improvement.
- Source audio should stay outside this repository.
- Persisted training data is limited to acoustic features, labels, license fields, and reference URLs.
- Apple iTunes Search API previews are useful only for experiments or candidate discovery, not for the official score.
- YouTube remains available for manual generation, but is no longer the preferred training source.
- Spotify / Apple Music catalog metadata, MusicBrainz, and Wikipedia can still strengthen search terms and labels.

## How to Use

## External Cache Storage

Large generated data should live outside this repository. The main targets are:

- `genre-training/feature-cache.json`: cached acoustic features.
- `.external-data/`: downloaded public dataset metadata/audio material.

Run the mover from `apps/demo`:

```bash
npm run genre-cache:externalize -- /Volumes/20251005_12TBskyhawk/MUSICTee-cache
```

Or double-click:

```text
apps/demo/Move Genre Cache To External.command
```

The mover writes `genre-training/cache-paths.local.json`, which is intentionally ignored by Git. After that, `genre-training.mjs` and `fma-metadata-import.mjs` automatically read the external paths.

You can also override paths per command:

```bash
MMFR_GENRE_FEATURE_CACHE_PATH=/Volumes/DRIVE/MUSICTee-cache/genre-training/feature-cache.json \
MMFR_EXTERNAL_DATA_DIR=/Volumes/DRIVE/MUSICTee-cache/external-data \
npm --prefix apps/demo run genre-train:cached
```

1. Start the audio analysis server:

```bash
npm run audio-server
```

2. Import Creative Commons / public research dataset audio:

Create a manifest from the example:

```bash
cp genre-training/cc-source-manifest.example.json genre-training/cc-source-manifest.json
```

### RWC Popular Music Database Flow

RWC audio is not redistributed by this repository. The intended flow is:

1. Obtain RWC on the user side.
2. Put the audio on an external drive.
3. Generate a manifest with `filePath` values pointing to that external drive.
4. Run `cc-import` so only acoustic features are saved.
5. Keep the audio files out of this repository.

Example:

```bash
npm --prefix apps/demo run rwc-popular-manifest -- /Volumes/DRIVE/RWC-MDB-P-2001
```

Or double-click the helper after placing audio at the default external path:

```text
apps/demo/Import RWC Popular Audio.command
```

Default expected folder:

```text
/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/rwc/RWC-MDB-P-2001
```

This writes:

```text
genre-training/rwc-popular-cc-source-manifest.json
```

The generated rows use:

- `genre: "J-POP"`
- `macroGenre: "pop"`
- `trainingRole: "fine"`
- `license: "research-use-copyright-cleared"`
- `audioStoragePolicy: "external-local-audio; persist-features-only"`

Start the audio analysis server in another terminal, then import:

```bash
npm --prefix apps/demo run audio-server
npm --prefix apps/demo run rwc-popular-import
```

After import, rebuild the formal cached model:

```bash
npm --prefix apps/demo run genre-train:formal-cached
npm --prefix apps/demo run genre-goal-report
```

The importer refuses repo-local audio paths, so the RWC files must remain on an external drive or another folder outside `MUSICTee`.

Or generate it from an external folder. Put audio files in genre-named folders, for example `/Volumes/DRIVE/cc-audio/テクノ/*.mp3`, then run:

```bash
MMFR_CC_DATASET_NAME="FMA Small" \
MMFR_CC_LICENSE="CC-BY" \
MMFR_CC_LICENSE_URL="https://creativecommons.org/licenses/by/4.0/" \
MMFR_CC_REFERENCE_URL="https://github.com/mdeff/fma" \
npm --prefix apps/demo run cc-manifest:from-folder -- /Volumes/DRIVE/cc-audio
```

For broader genre coverage, use MTG-Jamendo metadata as a manifest source. First download only the metadata and license files:

```text
apps/demo/Download MTG Jamendo Metadata.command
```

Preview how many app genres can be covered before downloading audio:

```bash
MMFR_MTG_ALLOW_MISSING_AUDIO=1 \
MMFR_MTG_LIMIT_PER_GENRE=120 \
npm --prefix apps/demo run cc-manifest:mtg-jamendo -- /Volumes/DRIVE/mtg-jamendo/raw_30s/audio-low
```

This writes `genre-training/mtg-jamendo-manifest.preview.json`. After audio exists at the same root, rerun without `MMFR_MTG_ALLOW_MISSING_AUDIO`; that writes the active `cc-source-manifest.json` for `cc-import`.

To see exactly which MTG-Jamendo files this project would use for the 30-genre goal, generate the audio plan:

```bash
npm --prefix apps/demo run mtg-audio-plan
```

This writes `genre-training/mtg-jamendo-audio-plan.md`, `genre-training/mtg-jamendo-required-audio.tsv`, and `genre-training/mtg-jamendo-required-paths.txt`. The official MTG-Jamendo downloader may still require archive-level downloads, but the plan shows which track paths must exist under `raw_30s/audio-low` before formal import can improve the score. MTG selection is artist-balanced by default; override the per-artist cap with `MMFR_MTG_MAX_PER_ARTIST_PER_GENRE` for manifest generation or `MMFR_MTG_PLAN_MAX_PER_ARTIST_PER_GENRE` for the final audio plan.

To download the official low-bitrate audio package to the external cache, double-click:

```text
apps/demo/Download MTG Jamendo Audio.command
```

It requires typing `DOWNLOAD` before starting because `raw_30s/audio-low` is about 156 GB. After the download, it regenerates the MTG audio plan and writes the active `cc-source-manifest.json`.

Edit `genre-training/cc-source-manifest.json` so each item has:

- `genre` / `macroGenre`
- `filePath` or `audioPath` outside this repository
- `license` / `licenseUrl`
- `referenceUrl`
- `canonicalArtist` / `canonicalTitle`

Then run:

```bash
npm run cc-import
```

This imports only genres currently marked weak in `results.json`. To import all manifest rows:

```bash
npm run cc-import:all
```

For a safe partial import, first run a dry run, then import a small batch:

```bash
MMFR_CC_IMPORT_DRY_RUN=1 MMFR_CC_IMPORT_LIMIT_TOTAL=30 npm run cc-import
MMFR_CC_IMPORT_LIMIT_TOTAL=30 npm run cc-import
```

Useful importer controls:

- `MMFR_CC_IMPORT_DRY_RUN=1`: validate and report ready rows without analyzing audio or writing `verified-dataset.json`.
- `MMFR_CC_IMPORT_LIMIT_TOTAL=30`: stop after selecting 30 ready rows across all genres.
- `MMFR_CC_IMPORT_START_AFTER=<trackId-or-source-key>`: skip manifest rows until this cursor is reached, then continue.
- `MMFR_CC_IMPORT_REPORT_EVERY=10`: print progress every 10 processed outcomes.

The importer rejects rows when required fields are missing, the source audio is inside this repository, the license is outside `MMFR_CC_ALLOWED_LICENSES`, or the source is Artlist. The repository stores only extracted features and metadata; source audio remains on an external drive or dataset folder.

After importing CC/public research audio, rebuild the model:

```bash
npm --prefix apps/demo run cc-manifest:audit
npm --prefix apps/demo run genre-train:cached
npm --prefix apps/demo run genre-split-audit
npm --prefix apps/demo run genre-diversity-audit
```

Track the 30-genre / 80% goal:

```bash
npm --prefix apps/demo run genre-goal-report
npm --prefix apps/demo run genre-improvement-plan
```

This writes `genre-training/goal-report.json`, `genre-training/genre-improvement-plan.json`, and `genre-training/genre-improvement-plan.md`. The goal is considered achieved only when at least 30 seed genres have enough formal CC/local-audio training rows and reach 80% Top1 accuracy. Until then, `status` will usually be `needs-formal-cc-audio` or `needs-classifier-improvement`.

Check dataset coverage before downloading or importing audio:

```bash
npm --prefix apps/demo run cc-coverage-report
```

`cc-coverage-report.json` separates:

- `manifestCandidateRows`: metadata candidates such as MTG-Jamendo rows.
- `manifestAudioRows`: candidates whose audio file already exists locally.
- `fmaMetadataPotentialRows`: FMA metadata rows that may become usable after FMA audio is available.
- `verifiedFormalRows`: rows already imported as formal CC/local audio features.

Current MTG-Jamendo + FMA metadata coverage is enough for 23 of 30 fine-evaluable genres. The remaining target genres need another CC/public research source or hand-curated local CC audio: `シティ・ポップ`, `アニメソング`, `オペラ`, `トラップ`, `ハードコア`, `ディープ・ハウス`, and `ソウルミュージック`.

Candidate source guidance lives in:

```text
genre-training/cc-source-registry.json
```

The coverage report reads this registry and prints recommended sources/search terms for missing genres. Use it as the working queue for closing the 30-genre gap:

1. Download or mount MTG-Jamendo audio-low to cover the 20+ genres already mapped from metadata.
2. Finish FMA small/full audio for FMA-covered genres such as `ドローン`, `チップチューン`, `ドラムンベース`, and `ディープ・ハウス`.
3. For the remaining gap genres, add verified local CC audio folders and generate a manifest with `cc-manifest:from-folder`.

### FMA Small audio import

FMA Small is a practical first public-research audio source because it is much smaller than MTG-Jamendo audio-low. Keep the ZIP and extracted MP3 files on the external drive:

```text
/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small.zip
/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small
```

After the download finishes, either double-click:

```text
apps/demo/Import FMA Small Audio.command
```

Or run the same flow manually:

```bash
shasum -a 1 /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small.zip
unzip /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small.zip \
  -d /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma

MMFR_CC_MANIFEST_PATH=/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_metadata/tracks.csv \
MMFR_CC_AUDIO_ROOT=/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small \
npm --prefix apps/demo run cc-import:fma
```

The importer reads MP3 files from the external drive, posts temporary PCM analysis to the local audio server, and persists only extracted features and license/reference metadata in `genre-training/verified-dataset.json`.

You can also discover Creative Commons candidates from Internet Archive without downloading audio:

```bash
MMFR_IA_CC_LIMIT_PER_GENRE=20 npm --prefix apps/demo run ia-cc-collect
npm --prefix apps/demo run wiki-cc-collect
npm --prefix apps/demo run wiki-cc-manifest
```

This writes:

- `genre-training/internet-archive-cc-candidates.json`
- `genre-training/internet-archive-cc-collect-report.json`
- `genre-training/wikimedia-commons-audio-candidates.json`
- `genre-training/wikimedia-commons-audio-collect-report.json`
- `genre-training/wikimedia-commons-review-queue.tsv`
- `genre-training/wikimedia-commons-cc-source-manifest.json`

These rows are candidate discovery only. Before they become formal training data, manually verify the item page, license URL, genre label, and audio quality, then download selected audio to the external cache or another external drive. After that, create or append `genre-training/cc-source-manifest.json` and import with `cc-import`. The coverage report counts Internet Archive rows as potential coverage, not as formal training rows.

To create a review sheet and an import manifest:

```bash
npm --prefix apps/demo run ia-cc-manifest
npm --prefix apps/demo run ia-cc-review-page
npm --prefix apps/demo run ia-cc-shortlist
npm --prefix apps/demo run cc-review-shortlist
```

This writes `genre-training/internet-archive-review-queue.tsv`, `genre-training/wikimedia-commons-review-queue.tsv`, `genre-training/cc-review-shortlist.md`, `genre-training/cc-review-shortlist.tsv`, and `genre-training/cc-review-shortlist.html`. Open the HTML for fast listening/checking, or use the combined TSV for the quickest pass. Inspect each `referenceUrl`, then set `reviewStatus` to `approved`, `rejected`, or `needs-review` only for tracks whose license, genre label, and audio content you have checked. The script will not formalize unreviewed rows by default.

If you edited the combined shortlist instead of the original source TSV files, sync the review decisions back to their source queues:

```bash
npm --prefix apps/demo run cc-review:apply-shortlist
```

After this sync, rerun the manifest steps so approved rows become downloadable/importable manifest items:

```bash
npm --prefix apps/demo run ia-cc-manifest
npm --prefix apps/demo run wiki-cc-manifest
```

After marking approved rows in `internet-archive-review-queue.tsv`, download approved audio outside the repo and write the manifest:

```bash
npm --prefix apps/demo run ia-cc-approval-report
npm --prefix apps/demo run ia-cc-download-approved
npm --prefix apps/demo run ia-cc-approval-report
npm --prefix apps/demo run cc-import:ia
npm --prefix apps/demo run wiki-cc-download-approved
npm --prefix apps/demo run cc-import:wiki
```

For experiments only, `MMFR_IA_ACCEPT_UNREVIEWED=1` can build a manifest from unreviewed candidates, but do not use that route for the official score.

`results.json` contains two score views:

- `summary`: reference score across currently enabled legacy/bootstrap sources.
- `summary.formalSummary`: formal score using only `cc-dataset` / `local-audio` rows with at least 10 test items per genre.

Use a strict CC-only training run after enough CC audio has been imported:

```bash
npm --prefix apps/demo run genre-train:cc-only
```

Priority fill targets are 100 tracks for `シティ・ポップ`, `J-POP`, `ドローン`, `クラシック音楽`, `ダブ`, and `テクノ`; other fine genres default to 50 tracks.

For FMA-style metadata:

```bash
MMFR_CC_MANIFEST_PATH=/path/to/fma_metadata/tracks.csv \
MMFR_CC_AUDIO_ROOT=/path/to/fma_small \
npm run cc-import:fma
```

FMA audio is expected in the usual `000/000002.mp3` directory layout. The importer maps FMA genre text to this app's Japanese fine labels where possible.

To download FMA small to the configured external cache, double-click:

```text
apps/demo/Download FMA Small.command
```

The command uses `curl -C -`, so an interrupted download can be resumed. After the zip is complete and verified, unzip it outside the repo:

```bash
unzip /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small.zip \
  -d /Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma
```

Then import the real audio features:

```bash
MMFR_CC_MANIFEST_PATH=/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_metadata/tracks.csv \
MMFR_CC_AUDIO_ROOT=/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/fma/fma_small \
npm --prefix apps/demo run cc-import:fma
```

If local disk space is too low for `fma_small.zip`, use FMA precomputed metadata/features first:

```bash
mkdir -p .external-data/fma
curl -L -C - -o .external-data/fma/fma_metadata.zip https://os.unil.cloud.switch.ch/fma/fma_metadata.zip
unzip .external-data/fma/fma_metadata.zip -d .external-data/fma
npm --prefix apps/demo run fma-metadata-import
npm --prefix apps/demo run genre-train:cached
```

This route does not download or store source audio. It converts `features.csv` statistics into this app's local feature vector. It is less precise than analyzing audio directly, but useful for legal and storage-safe score improvement.

This writes:

- `genre-training/verified-dataset.json`: verified items with features only.
- `genre-training/cc-source-import-report.json`: imported/rejected counts and reasons.

3. Collect source candidates from iTunes previews:

```bash
npm run preview-collect
```

This writes:

- `genre-training/preview-source-candidates.json`: scored iTunes preview candidates.
- `genre-training/verified-dataset.json`: verified items with features only.
- `genre-training/preview-collect-report.json`: query logs and errors.

Use small smoke runs while tuning:

```bash
MMFR_PREVIEW_COLLECT_PER_GENRE=1 MMFR_PREVIEW_CANDIDATES_PER_GENRE=20 npm run preview-collect
```

4. YouTube candidate collection is still available as a fallback:

```bash
npm run genre-collect
```

This writes:

- `genre-training/source-candidates.json`: scored YouTube search candidates.
- `genre-training/verified-dataset.json`: empty unless validation is enabled.
- `genre-training/auto-collect-report.json`: query logs and errors.

5. Validate YouTube candidates by analyzing real YouTube audio:

```bash
npm run genre-collect:verify
```

This requires the audio analysis server to be running. It writes verified items to `verified-dataset.json`.

6. Promote verified data to the active training dataset:

```bash
npm run genre-collect:promote
```

This rewrites `genre-training/genre-dataset.json` from verified items. Use this only after reviewing `verified-dataset.json`.

7. Run training:

```bash
npm run genre-train
```

The trainer prefers `verified-dataset.json` when it contains items, then falls back to `genre-dataset.json`. It supports mixed sources:

- `sourceType: "itunes-preview"` with `previewUrl`, `sourceUrl`, `referenceUrl`, and persisted `features`.
- `sourceType: "cc-dataset"` with `filePath`, `sourceUrl`, `referenceUrl`, `license`, `licenseUrl`, and persisted `features`.
- YouTube legacy rows with `youtubeUrl`.

## Collection Targets

Default YouTube targets:

- 40 YouTube candidates per genre.
- 20 verified audio-analyzable tracks per genre.

You can override them:

```bash
MMFR_GENRE_COLLECT_PER_GENRE=30 MMFR_GENRE_CANDIDATES_PER_GENRE=50 npm run genre-collect:verify
```

Preview targets:

```bash
MMFR_PREVIEW_COLLECT_PER_GENRE=20 MMFR_PREVIEW_CANDIDATES_PER_GENRE=80 npm run preview-collect
```

CC dataset targets:

```bash
MMFR_CC_LIMIT_PER_GENRE=80 MMFR_CC_ANALYSIS_SECONDS=60 npm run cc-import
```

`cc-import` defaults to weak genres only. Use `MMFR_CC_WEAK_ONLY=0` or `npm run cc-import:all` for a full import.

## Seed Metadata

Canonical seed metadata lives in:

```text
genre-training/source-seeds.json
```

Each seed has:

- `macroGenre`: broad category such as `electronic`, `rock`, `black_music`, `pop`, `classical`, `ambient`, `jazz`, or `world`.
- `genre`: app-facing Japanese genre label.
- `tracks`: representative artist/title pairs used to build high-signal preview/API queries.
- `searchTerms`: fallback genre-level queries.

The script writes:

- `genre-training/results.json`: per-track prediction results.
- `genre-training/generated-profiles.json`: calibrated acoustic genre profiles loaded by the app.

The training summary reports:

- Macro Top1 accuracy.
- Fine genre Top1 accuracy.
- Fine genre Top3 accuracy.
- needsReview rate.
- per-genre accuracy in `byGenre`.
- low-scoring target genres in `weakGenres`.

The model also applies a light validation-only calibration step by default. It learns small per-genre score multipliers from the validation split when the correct genre appears in the Top5 but not Top1, then evaluates the test split with those multipliers. Disable it for comparison with:

```bash
MMFR_ENABLE_VALIDATION_CALIBRATION=0 npm --prefix apps/demo run genre-train:cached
```

## Policy

The estimator is audio-first. Catalog metadata such as iTunes `primaryGenreName` or YouTube title/tags is used for candidate selection and low-confidence explanation, not as the primary classifier.

## Preview Audio Policy

iTunes preview audio is not stored, cached, or promoted as a repo artifact. The collector sends each `previewUrl` to the local audio analysis server, ffmpeg decodes it to PCM in memory, and only the resulting acoustic features plus reference metadata are saved.

## Creative Commons / Research Dataset Policy

Use datasets whose licenses allow this research/training use. FMA is a good first target because the dataset was published for music analysis research and contains Creative Commons-licensed tracks. Keep these fields on every imported row:

- `datasetName`
- `trackId`
- `referenceUrl`
- `license`
- `licenseUrl`

The importer does not copy audio into this repository. It reads local audio through ffmpeg, extracts features, and saves only those features to `verified-dataset.json`.

Allowed licenses default to:

```text
CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, CC-BY-ND, CC-BY-NC-ND
```

For user-acquired RWC audio, the importer also accepts:

```text
RESEARCH-USE-COPYRIGHT-CLEARED
```

Override this if the project policy needs to exclude NC/ND material:

```bash
MMFR_CC_ALLOWED_LICENSES=CC0,CC-BY,CC-BY-SA npm run cc-import
```

## YouTube Cookie Automation

The collector and audio server pass browser cookies to `yt-dlp` so YouTube URLs that require a signed-in browser session can still be analyzed.

On macOS the default order is:

```bash
chrome, safari, firefox, then no-cookie fallback
```

You can override the browser order:

```bash
MMFR_YTDLP_COOKIES_FROM_BROWSER=chrome,safari npm run audio-server
```

Or use an exported cookie file:

```bash
MMFR_YTDLP_COOKIES_FILE=/path/to/cookies.txt npm run audio-server
```

If `genre-training/youtube-cookies.txt` exists, it is used automatically. The same variables are used by `npm run genre-collect`. If a browser refuses cookie access, the scripts fall back to the next browser and then non-cookie mode, while recording failed URLs in the report.

Recommended fully automatic setup:

1. Export YouTube cookies as Netscape-format `cookies.txt` from a browser where YouTube is already logged in.
2. Rename/copy it to:

```text
genre-training/youtube-cookies.txt
```

3. Restart the audio server with `Start Audio Analysis Server.command`.

After that, both the app and `npm run genre-collect` will use the cookie file automatically.

For fully automatic collection, keep YouTube logged in on at least one configured browser, then run:

```bash
MMFR_GENRE_COLLECT_PER_GENRE=10 MMFR_GENRE_SEARCH_LIMIT=60 MMFR_GENRE_COLLECT_VALIDATE=1 npm run genre-collect
```

macOS may block direct Safari cookie access unless the terminal app has permission to read browser data. Chrome is tried first by default because it is usually easier for `yt-dlp` to read.
