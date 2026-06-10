# Genre Training

This folder calibrates the genre estimator from real YouTube audio.

## How to Use

1. Copy `genre-dataset.example.json` to `genre-dataset.json`.
2. Add known representative YouTube URLs for each genre.
3. Start the audio analysis server:

```bash
npm run audio-server
```

4. Run:

```bash
node scripts/genre-training.mjs
```

The script writes:

- `genre-training/results.json`: per-track prediction results.
- `genre-training/generated-profiles.json`: calibrated acoustic genre profiles loaded by the app.

## Policy

The estimator is audio-first. YouTube title/tags are only used as a last-resort fallback when acoustic confidence is low or the top genres are nearly tied.
