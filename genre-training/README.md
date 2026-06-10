# Genre Training

This folder calibrates the genre estimator from verified YouTube audio.

The current policy is YouTube-centered:

- YouTube is the practical audio source for local analysis.
- Spotify / Apple Music / MusicBrainz / Wikipedia are metadata references only.
- Spotify content and Spotify audio features are not used for model training.
- Metadata is used to strengthen search terms and candidate review, not as the primary classifier.

## How to Use

1. Start the audio analysis server:

```bash
npm run audio-server
```

2. Collect source candidates from canonical artist/title seeds:

```bash
npm run genre-collect
```

This writes:

- `genre-training/source-candidates.json`: scored YouTube search candidates.
- `genre-training/verified-dataset.json`: empty unless validation is enabled.
- `genre-training/auto-collect-report.json`: query logs and errors.

3. Validate candidates by analyzing real YouTube audio:

```bash
npm run genre-collect:verify
```

This requires the audio analysis server to be running. It writes verified items to `verified-dataset.json`.

4. Promote verified data to the active training dataset:

```bash
npm run genre-collect:promote
```

This rewrites `genre-training/genre-dataset.json` from verified items. Use this only after reviewing `verified-dataset.json`.

5. Run training:

```bash
npm run genre-train
```

The trainer prefers `verified-dataset.json` when it contains items, then falls back to `genre-dataset.json`.

## Collection Targets

Default targets:

- 40 YouTube candidates per genre.
- 20 verified audio-analyzable tracks per genre.

You can override them:

```bash
MMFR_GENRE_COLLECT_PER_GENRE=30 MMFR_GENRE_CANDIDATES_PER_GENRE=50 npm run genre-collect:verify
```

## Seed Metadata

Canonical seed metadata lives in:

```text
genre-training/source-seeds.json
```

Each seed has:

- `macroGenre`: broad category such as `electronic`, `rock`, `black_music`, `pop`, `classical`, `ambient`, `jazz`, or `world`.
- `genre`: app-facing Japanese genre label.
- `tracks`: representative artist/title pairs used to build high-signal YouTube queries.
- `searchTerms`: fallback genre-level queries.

The script writes:

- `genre-training/results.json`: per-track prediction results.
- `genre-training/generated-profiles.json`: calibrated acoustic genre profiles loaded by the app.

The training summary reports:

- Macro Top1 accuracy.
- Fine genre Top1 accuracy.
- Fine genre Top3 accuracy.

## Policy

The estimator is audio-first. YouTube title/tags are only used as a last-resort fallback when acoustic confidence is low or the top genres are nearly tied.

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
