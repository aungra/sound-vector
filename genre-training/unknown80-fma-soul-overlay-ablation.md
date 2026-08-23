# Unknown80 FMA black-music overlay ablation

FMA Funk/Blues rows are training-only and are excluded from the FMA outer fold.

| candidate | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|
| incumbent | 58.73% | 58.71% | 31.58% | 83.48% |
| overlay-nested-rhythm-three-pair | 58.04% | 57.82% | 36.84% | 82.95% |
| overlay-nested | 57.99% | 57.77% | 36.84% | 82.95% |
| formal-nested-rhythm-three-pair | 57.73% | 57.50% | 36.84% | 83.43% |
| formal-nested | 57.67% | 57.45% | 36.84% | 83.43% |

Decision: **reject-no-robust-gain**
