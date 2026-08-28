---
title: MUSICTee Sound Form API
colorFrom: gray
colorTo: red
sdk: gradio
sdk_version: 6.5.1
python_version: "3.11"
app_file: deploy/huggingface-audio-api/app.py
pinned: false
license: other
---

# MUSICTee Sound Form API

Production-parity audio analysis for `https://aun-graphic.jp/sound-form/`.
The Space downloads a signed, model-only runtime bundle at startup and then
runs the same Node and Python inference contracts as the exhibition service.

Training audio, decoded YouTube audio and transcripts are not included or
retained. Temporary request audio is removed after analysis.
