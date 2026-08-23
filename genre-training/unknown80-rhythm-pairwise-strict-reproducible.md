# Unknown80 rhythm pairwise screen

Audio-only source-heldout screen using cached librosa rhythm features.

| candidate | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|
| rhythm-pair9-w0.25 | 58.21% | 58.33% | 31.58% | 83.48% |
| rhythm-top3-extra-trees-pair3w0.75-pair9w0.25 | 58.21% | 58.33% | 31.58% | 83.48% |
| rhythm-top3-extra-trees-pair3w0.75-pair9w0.25-pair4w0.25 | 58.21% | 58.33% | 31.58% | 83.48% |
| rhythm-pair9-w0.5 | 58.15% | 58.29% | 31.58% | 83.48% |
| positions-rhythm-pair9-w1 | 58.15% | 58.29% | 31.58% | 83.48% |
| rhythm-top3-extra-trees-pair3w0.75-pair9w0.5 | 58.15% | 58.29% | 31.58% | 83.48% |
| positions-pair9-w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-pair9-w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| rhythm-pair2-w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| rhythm-pair2-w0.75 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-rhythm-pair9-w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-rhythm-pair9-w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-librosa-pair9-w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-librosa-pair9-w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-top3-extra-trees-pair3w0.75-pair9w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-top3-extra-trees-pair3w0.75-pair9w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-rhythm-top3-extra-trees-pair3w0.75-pair9w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-rhythm-top3-extra-trees-pair3w0.75-pair9w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-librosa-top3-extra-trees-pair3w0.75-pair9w0.25 | 58.15% | 58.28% | 31.58% | 83.48% |
| positions-librosa-top3-extra-trees-pair3w0.75-pair9w0.5 | 58.15% | 58.28% | 31.58% | 83.48% |
| rhythm-pair2-w0.5 | 58.10% | 58.25% | 31.58% | 83.48% |
| rhythm-pair2-w1 | 58.10% | 58.25% | 31.58% | 83.48% |
| incumbent | 58.10% | 58.24% | 31.58% | 83.48% |
| positions-pair3-w0.25 | 58.10% | 58.24% | 31.58% | 83.48% |

Selected: **rhythm-pair9-w0.25**

## Reproducibility

- Script SHA-256: `b1425f377619a9076528043107c6538c2e61aa5fbf26e4096ad66f0d97e2924b`
- OOF SHA-256: `a17948e1e07951e2d3891079afe573718a0c92c9ba15144fc64c03b34f9aed8f`
- Librosa SHA-256: `ccfbff2275442cfb0614f59674c9374f9fb93ca16145cbe3b505b0b89bb22160`
- Runtime: Python 3.9.6 / NumPy 2.0.2 / scikit-learn 1.6.1
