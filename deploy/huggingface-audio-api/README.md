---
title: MUSICTee Audio Analysis API
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: other
---

# MUSICTee Audio Analysis API

Production-parity, rate-limited audio analysis for
`https://aun-graphic.jp/sound-form/`. The worker is designed to run without the
exhibition Mac or an external HDD.

## Runtime boundary

The container contains only promoted classifiers, public model weights,
feature-contract manifests and application code. Training audio, decoded
YouTube audio and transcripts are not included or retained. Temporary analysis
audio is removed by `audio-analysis-server.mjs` after each request.

The immutable runtime bundle contains:

- the promoted 65.59% source-heldout classifier;
- the promoted MusicFM and track-pair rerankers;
- Discogs EffNet, PANNs, YAMNet, AST and MusicFM model weights;
- the quantized faster-whisper language model.

Every file is checked against `runtime-assets.manifest.json` during the Docker
build and again before the service starts. A missing model, source audio file,
workstation path or SHA mismatch prevents startup.

## Build the private model bundle

The source root is used only by the release builder. It is not written to the
manifest or Docker image.

```bash
node deploy/huggingface-audio-api/build-runtime-bundle.mjs \
  --source-root "$MMFR_MODEL_SOURCE_ROOT" \
  --output /private/tmp/mmfr-runtime-assets

tar -C /private/tmp/mmfr-runtime-assets -czf /private/tmp/mmfr-runtime-assets.tar.gz .
shasum -a 256 /private/tmp/mmfr-runtime-assets.tar.gz
```

Upload the archive to access-controlled release storage. Configure
`RUNTIME_BUNDLE_URL` and `RUNTIME_BUNDLE_SHA256` as worker secrets. They are
read at startup and are not embedded in the image:

```bash
docker build -f deploy/huggingface-audio-api/Dockerfile -t musictee-audio-api .
docker run --rm -p 7860:7860 \
  -e RUNTIME_BUNDLE_URL \
  -e RUNTIME_BUNDLE_SHA256 \
  musictee-audio-api
```

## Shadow gate

The production proxy continues to use the Mac tunnel until all four shadow
fixtures pass with the same Top3 order, score delta within 1.5 points and full
rich-analysis evidence.

```bash
node deploy/huggingface-audio-api/compare-cloud-parity.mjs \
  --mac-endpoint "$MAC_ANALYSIS_ENDPOINT" \
  --cloud-endpoint "$CLOUD_ANALYSIS_ENDPOINT" \
  --output /private/tmp/cloud-parity.json

node deploy/huggingface-audio-api/promote-cloud-worker.mjs \
  --endpoint "$CLOUD_ANALYSIS_ENDPOINT" \
  --parity-report /private/tmp/cloud-parity.json
```

The second command is check-only unless `--promote` is explicitly supplied.
Promotion writes only `cloud-upstream-url.txt`; it never deploys or replaces the
SOUND FORM HTML. The PHP proxy tries the stable cloud worker first and keeps the
Mac tunnel as a rich-analysis fallback during migration.

The public mode accepts only HTTPS YouTube URLs and does not expose local-file
or arbitrary preview-URL analysis.
