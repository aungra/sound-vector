# GTZAN production transfer evaluation

GTZAN is used only as an unseen research evaluation source. Its license is
unspecified, so none of its audio, labels, or predictions may enter training or
production export.

## Result

| configuration | Top1 | balanced Top1 | Top3 |
|---|---:|---:|---:|
| production backbone | 75.65% | 75.62% | 95.22% |
| legacy pairwise rerankers | 74.78% | 74.74% | 95.22% |

The legacy rerankers changed four Top1 decisions: one improved and three
regressed, for a net loss of two correct tracks. They are not promotion
eligible and are now opt-in at runtime.

## Genre recall

| genre | Top1 | Top3 | tracks |
|---|---:|---:|---:|
| Classical | 100.00% | 100.00% | 31 |
| Jazz | 100.00% | 100.00% | 27 |
| Hip-hop | 77.78% | 92.59% | 27 |
| Blues | 67.74% | 100.00% | 31 |
| Rock | 65.62% | 87.50% | 32 |
| Disco | 65.52% | 96.55% | 29 |
| Reggae | 65.38% | 84.62% | 26 |
| Metal | 62.96% | 100.00% | 27 |

## Priority boundaries

- Blues vs Folk: 8 errors
- Metal vs Rock: 8 errors
- Disco vs Funk: 6 errors
- Rock vs Blues: 5 errors
- Reggae vs Dub: 4 errors
- Disco vs House: 3 errors

The 95.22% Top3 result means candidate extraction is strong on this cohort.
The next rights-clear additions should target these boundaries with independent
sources, then train rerankers only after every outer fold retains at least two
training sources per label.

## Reproducibility

- Filtered rows: 230 across 8 mapped genres
- Excluded rows: 60 country or generic-pop tracks outside the 32-genre contract
- Dataset revision: `d2146561ecc7df707d9e6b8318885fe6a39668a2`
- Archive SHA-256: `b28cc067ff6199bd826f5d1a6931458586d64acae7f44b2e882b7a97af057531`
- PyTorch split commit: `4e3e282b0e23a0b9133abc8f719e2fa39be2a6e3`
- PyTorch split SHA-256: `2397513ff406b90d63a17591c19c2dbe9c22db6b994dbf10666f4caf65b9e4c8`
- Model SHA-256: `07ea3e2859415507a30a2e740f90bf021eaa7f6f72b1ea035384b3b50968b19c`
- Runtime contract SHA-256: `95bfd247ab1b5c5b23dca946d6b67a11a2d70894cd6d9703105b4c79caa2a885`
