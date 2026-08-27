# Unknown-source MusicFM boundary screen

## Decision

The best source-heldout candidate is **not production eligible**. It improves
the frozen v114 baseline without regressions, but remains below the 65% Top1
promotion gate. The production model must remain unchanged.

| candidate | Top1 | balanced Top1 | minimum source | Top3 |
|---|---:|---:|---:|---:|
| frozen v114 | 60.70% | 60.30% | 31.58% | 83.48% |
| phase 1 zero-harm chain | **61.50%** | **60.82%** | 31.58% | 83.48% |
| phase 2 full expansion | 61.13% | 60.59% | 31.58% | 83.48% |

The phase 1 chain improves 15 held-out rows and harms none. It uses seven
audio-only Top3 boundary rerankers: Ambient/Classical, Ambient/Dub,
Techno/Drum and Bass, Deep House/Techno, Jazz/Funk, Jazz/Rock, and Dub/Reggae.

Phase 2 added 409 MusicFM records for Drum and Bass, Dubstep, Trance,
Classical, Folk, Jazz, and Opera. Extraction completed with zero failures and
retained no audio. Retraining all boundaries on the larger cache reduced the
strict score to 61.13%, so that model is rejected. The expanded records remain
available for later source-domain experiments but are not promoted.

## Evaluation contract

- 1,883 fixed evaluation tracks from eight held-out providers.
- The held-out provider is excluded from each training fold.
- URL, title, artist, and source metadata are not inference features.
- The sealed final holdout is not opened.
- Top3 membership is unchanged; candidates may only reorder it.
- The frozen v114 reconstruction must exactly reproduce 60.70 / 60.30 /
  31.58 / 83.48 before a candidate is evaluated.

## Next gate

The remaining gap is 3.50 Top1 points. Additional production work should
target genuinely independent training providers and source-invariant
representation learning. Same-provider cache expansion alone is insufficient,
as shown by the rejected phase 2 result.
