# MTG-Jamendo Soul evidence audit

## Label policy

- `genre---soul` is exact Soul evidence.
- `genre---rnb` is adjacent R&B evidence and is never silently relabeled as exact Soul.
- Only CC0, CC-BY, and CC-BY-SA rows with local audio are eligible for this experiment.
- Jamendo rows are excluded from training whenever Jamendo is the outer holdout.

The production-clear cohort contains 20 tracks from 10 artists: 5 exact Soul tracks and 15 adjacent R&B tracks. MuLan moments were generated for three segments per track. Decoded audio and transcripts were not persisted.

## Source-heldout results

| candidate | Top1 | balanced | minimum source | Top3 | decision |
|---|---:|---:|---:|---:|---|
| baseline backbone | 57.51% | 57.34% | 21.05% | 83.11% | reference |
| exact Soul training overlay | 57.83% | 57.98% | 31.58% | 83.16% | improves this experimental backbone only |
| adjacent R&B training overlay | 57.25% | 57.43% | 26.32% | 82.90% | reject |
| exact Soul + adjacent R&B | 57.20% | 57.50% | 21.05% | 83.06% | reject |

Adding the five exact Soul tracks to the Jamendo outer evaluation fold produced 0/5 Soul Top1 predictions. The full strict result fell to Top1 57.15%, balanced 56.75%, minimum-source 21.05%, and Top3 82.84%.

## Decision

Keep MTG-Jamendo Soul and R&B as macro-only evidence. Do not promote either overlay into the production Fine classifier. The result confirms a cross-source Soul representation gap rather than a missing-cache problem.

## Reproducibility

- Exact training manifest SHA-256: `b9d84418ae3ae3431ed11fdbd9260332d83a37ceb63b257fd31bf62f9ce2935a`
- Exact source-heldout manifest SHA-256: `66b6aa30b2f397261c56d86934117fd6e30852d43c1bf3bce7e19c6e8499e2d2`
- External MuLan cache SHA-256: `b2ce8ad575edc9020c641f8aa5a9308ea4f8d17bd3d256087ad1392092ee6740`
- Production model updated: `false`
