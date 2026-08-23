# Unknown80 v102 macro reranker screen

Provider-cross-fitted, audio-only models only reorder existing v102 Top3 values.

| candidate | Top1 | balanced | minimum source | Top3 | + / - |
|---|---:|---:|---:|---:|---:|
| combined-roots-electric+bass-groove+acoustic-structural | 59.59% | 59.31% | 31.58% | 83.48% | 8 / 2 |
| combined-roots-electric+acoustic-structural | 59.53% | 59.28% | 31.58% | 83.48% | 7 / 2 |
| combined-bass-groove+acoustic-structural | 59.48% | 59.22% | 31.58% | 83.48% | 6 / 2 |
| combined-roots-electric+bass-groove | 59.43% | 59.23% | 31.58% | 83.48% | 3 / 0 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.75-mass0.5 | 59.43% | 59.19% | 31.58% | 83.48% | 5 / 2 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.75-mass0 | 59.43% | 59.16% | 31.58% | 83.48% | 6 / 3 |
| roots-electric-extra-trees-rhythm-base-w0.25-confidence0.75-mass0 | 59.37% | 59.19% | 31.58% | 83.48% | 2 / 0 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.75-mass0.7 | 59.37% | 59.15% | 31.58% | 83.48% | 4 / 2 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0-mass0.5 | 59.37% | 59.14% | 31.58% | 83.48% | 6 / 4 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.45-mass0.5 | 59.37% | 59.14% | 31.58% | 83.48% | 6 / 4 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.6-mass0.5 | 59.37% | 59.14% | 31.58% | 83.48% | 6 / 4 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0-mass0 | 59.37% | 59.12% | 31.58% | 83.48% | 7 / 5 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.45-mass0 | 59.37% | 59.12% | 31.58% | 83.48% | 7 / 5 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.6-mass0 | 59.37% | 59.12% | 31.58% | 83.48% | 7 / 5 |
| roots-electric-extra-trees-rhythm-base-w0.25-confidence0.75-mass0.5 | 59.32% | 59.14% | 31.58% | 83.48% | 1 / 0 |
| bass-groove-extra-trees-librosa-base-w0.25-confidence0.75-mass0 | 59.32% | 59.14% | 31.58% | 83.48% | 1 / 0 |
| bass-groove-extra-trees-librosa-base-w0.25-confidence0.75-mass0.5 | 59.32% | 59.14% | 31.58% | 83.48% | 1 / 0 |
| acoustic-structural-logistic-pca64-librosa-base-w0.25-confidence0.75-mass0.7 | 59.32% | 59.13% | 31.58% | 83.48% | 2 / 1 |
| acoustic-structural-logistic-pca64-librosa-base-w0.25-confidence0.75-mass0.5 | 59.32% | 59.12% | 31.58% | 83.48% | 4 / 3 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0-mass0.7 | 59.32% | 59.11% | 31.58% | 83.48% | 5 / 4 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.45-mass0.7 | 59.32% | 59.11% | 31.58% | 83.48% | 5 / 4 |
| acoustic-structural-logistic-pca64-rhythm-base-w0.25-confidence0.6-mass0.7 | 59.32% | 59.11% | 31.58% | 83.48% | 5 / 4 |
| club-extra-trees-librosa-base-w0.25-confidence0.75-mass0.5 | 59.32% | 59.07% | 31.58% | 83.48% | 2 / 1 |
| club-extra-trees-librosa-base-w0.5-confidence0.75-mass0.5 | 59.32% | 58.94% | 31.58% | 83.48% | 4 / 3 |
| club-extra-trees-librosa-base-w0.5-confidence0.75-mass0 | 59.32% | 58.88% | 31.58% | 83.48% | 5 / 4 |
| v102 | 59.27% | 59.10% | 31.58% | 83.48% | 0 / 0 |
| club-extra-trees-librosa-base-w0.25-confidence0.75-mass0.7 | 59.27% | 59.10% | 31.58% | 83.48% | 0 / 0 |
| club-extra-trees-librosa-base-w0.5-confidence0.75-mass0.7 | 59.27% | 59.10% | 31.58% | 83.48% | 0 / 0 |
| club-extra-trees-librosa-base-w0.75-confidence0.75-mass0.7 | 59.27% | 59.10% | 31.58% | 83.48% | 0 / 0 |
| club-extra-trees-librosa-base-w1-confidence0.75-mass0.7 | 59.27% | 59.10% | 31.58% | 83.48% | 0 / 0 |

Decision: **continue-production-gate**
