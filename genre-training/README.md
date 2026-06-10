# Genre Training

This folder calibrates the genre estimator from real YouTube audio.

## How to Use

1. Start the audio analysis server:

```bash
npm run audio-server
```

2. Collect 10 representative URLs for every genre:

```bash
MMFR_GENRE_COLLECT_PER_GENRE=10 MMFR_GENRE_SEARCH_LIMIT=60 MMFR_GENRE_COLLECT_VALIDATE=1 npm run genre-collect
```

3. Run training:

```bash
npm run genre-train
```

The script writes:

- `genre-training/results.json`: per-track prediction results.
- `genre-training/generated-profiles.json`: calibrated acoustic genre profiles loaded by the app.

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
