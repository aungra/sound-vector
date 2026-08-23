# MTG-Jamendo explicit Deep House audit

This audit joins the official MTG-Jamendo genre tags, metadata, and per-track Creative Commons license table.
Inference never uses title, artist, URL, or tags.

- Exact rights-safe candidates before caps: 38
- Selected after artist/album caps: 26
- Audio already present: 26
- New rows outside the fixed OOF: 13
- Training-ready rows outside the fixed OOF: 13
- Artists / albums: 13 / 24

## Limitation

Jamendo is already an outer source family. These rows can train non-Jamendo folds but cannot improve the Jamendo-held-out fold by themselves.

## Rejections

- album-cap: 8
- artist-cap: 4
- conflicting-fine-tag: 51
- non-production-cc-license: 338
