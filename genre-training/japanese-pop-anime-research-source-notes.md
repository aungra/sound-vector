# Japanese Pop / Anime Research Source Notes

Generated: 2026-06-21

Purpose: identify public research datasets or explicit licensed audio sources that can help fill
`シティ・ポップ` and `アニメソング` formal training gaps without using YouTube, iTunes previews,
or unclear commercial music.

## High-priority candidates

### IdolSongsJp Corpus

- Target use: `J-POP`, possible `アニメソング` adjacent / idol-pop support.
- Data type: mastered audio, stems, dry vocal tracks, chord annotations.
- Size: 15 commissioned tracks in the style of Japanese idol groups.
- Strength: real audio, Japanese idol-pop production style, stems can improve vocal/instrumental
  features.
- Limitation: not explicitly anime song; should not be labeled as `アニメソング` unless the corpus
  license/readme or metadata provides that label. Best first label is `J-POP` or `idol-pop`
  auxiliary label.
- Source: arXiv 2507.01349.

### jaCappella Corpus

- Target use: `J-POP` / pop macro support; possible `popular`, `edm`, `soulfunk`, `ballad`
  reference features.
- Data type: WAV audio for individual voice parts, MusicXML scores, metadata.
- Size: project page currently states 50 copyright-cleared Japanese a cappella vocal ensemble songs.
- Strength: Japanese vocals, clean rights handling, genre subsets, high-quality stems/parts.
- Limitation: terms prohibit general redistribution and commercial use without permission; use
  features only and keep source audio external. Not `シティ・ポップ` or `アニメソング` formal.
- Source: https://tomohikonakamura.github.io/jaCappella_corpus/

### AnimeTAB

- Target use: `アニメソング` symbolic / synthetic-audio support.
- Data type: MusicXML symbolic guitar tablature, structure annotations.
- Size: 412 full tracks and 547 labeled clips.
- Strength: explicit anime/game music focus, structure labels, symbolic data can be rendered locally
  to audio for feature extraction if license permits.
- Limitation: not original mastered audio; generated guitar renderings will describe harmony/melody
  more than full anime-song production. Treat as symbolic or synthetic-source training, not equivalent
  to commercial anime song audio.
- Source: arXiv 2210.03027.

### JVS-MuSiC

- Target use: Japanese singing-vocal feature support, not genre formal.
- Data type: Japanese multispeaker singing audio.
- Size: 100 singers recording the same song plus another song per singer.
- Strength: Japanese singing voice distribution, useful for vocal-band/vocal-presence features.
- Limitation: not a pop/anime/city-pop genre dataset. Use as auxiliary vocal-feature calibration only.
- Source: arXiv 2001.07044.

## Lower-priority / caution

### FMA

- Already used. FMA has explicit CC audio and enough metadata/tags for some sparse genres.
- It helped `トラップ`, but does not appear to have defensible `シティ・ポップ` or enough
  `アニメソング` formal audio.
- Avoid biography/description matches; use tags/title/album only.

### MTG-Jamendo

- Local search found `ANIME HOUSE`, `Trap`, and many `synthpop`/`future funk` adjacent labels.
- Current local audio subset contains very few of those exact candidates.
- Good for macro/electronic/pop support, but weak for formal `シティ・ポップ` and `アニメソング`
  unless the matching audio files are downloaded and license terms are verified.

## City-pop reality check

No clean public research audio dataset with an explicit `city pop` label was found in this search.
For formal training, avoid mapping generic `synthpop`, `future funk`, `AOR`, `disco`, or `soulfunk`
directly to `シティ・ポップ` unless the source metadata explicitly labels the item as city pop.

Recommended strategy:

1. Keep `シティ・ポップ` formal strict.
2. Add an auxiliary label such as `city-pop-adjacent` for synthpop/future-funk/AOR/boogie candidates.
3. Use those adjacent tracks only for macro `pop`/`electronic` support or a one-vs-rest city-pop
   prototype, not as exact `シティ・ポップ` ground truth.
4. If exact city-pop accuracy is required, obtain a rights-cleared curated set manually or use
   licensed/local tracks where the metadata explicitly says `city pop`.

## Next import priorities

1. Download/verify IdolSongsJp if an official distribution page is available.
2. Download jaCappella to external storage and import only features, with labels such as
   `ポップ`, `EDM`, `ソウルミュージック`, `バラード`, or macro-only depending on subset.
3. Download AnimeTAB and build a renderer path: MusicXML -> MIDI/WAV -> feature extraction. Mark
   source as `symbolic-rendered` so it does not silently mix with real mastered audio.
4. Continue searching for explicit city-pop research/licensed audio; do not promote adjacent labels
   automatically.
