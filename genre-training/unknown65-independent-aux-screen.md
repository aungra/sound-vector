# Unknown65 independent auxiliary screen

Production-safe full tracks only; outer holdout source is removed from auxiliary training.

| candidate | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|
| nested-top1-router | 60.81% | 60.28% | 31.58% | 83.32% |
| centroid-global-a0.3 | 60.75% | 59.14% | 26.32% | 83.86% |
| centroid-top3-a0.3 | 60.75% | 57.91% | 21.05% | 83.48% |
| track-effnet-top3-a0.1 | 60.75% | 57.70% | 31.58% | 83.48% |
| incumbent | 60.70% | 60.30% | 31.58% | 83.48% |
| track-punk-rock-pair | 60.70% | 60.30% | 31.58% | 83.48% |
| centroid-global-a0.05 | 60.65% | 60.28% | 31.58% | 83.54% |
| centroid-global-a0.2 | 60.65% | 59.08% | 31.58% | 83.91% |
| centroid-top3-a0.2 | 60.65% | 57.86% | 21.05% | 83.48% |
| centroid-top3-a0.05 | 60.59% | 59.04% | 31.58% | 83.48% |
| centroid-top3-a0.5 | 60.59% | 58.31% | 21.05% | 83.48% |
| centroid-top3-a0.1 | 60.59% | 57.84% | 26.32% | 83.48% |
| centroid-global-a0.5 | 60.59% | 57.80% | 21.05% | 84.07% |
| centroid-global-a0.1 | 60.54% | 59.00% | 31.58% | 83.59% |
| nested-pair-router | 60.54% | 57.84% | 31.58% | 83.38% |
| logistic-global-a0.05 | 60.44% | 57.70% | 31.58% | 84.17% |
| logistic-top3-a0.05 | 60.17% | 57.44% | 31.58% | 83.48% |
| logistic-top3-a0.1 | 60.17% | 57.24% | 31.58% | 83.48% |
| logistic-global-a0.1 | 59.85% | 57.16% | 31.58% | 84.60% |
| logistic-global-a0.2 | 59.59% | 57.23% | 36.84% | 84.07% |
| logistic-top3-a0.2 | 59.16% | 56.25% | 36.84% | 83.48% |
| logistic-top3-a0.3 | 58.05% | 54.89% | 31.58% | 83.48% |
| logistic-global-a0.3 | 57.62% | 55.00% | 31.58% | 83.64% |
| logistic-top3-a0.5 | 54.43% | 47.95% | 6.67% | 83.48% |
| logistic-global-a0.5 | 52.73% | 48.37% | 21.05% | 82.10% |

Selected: **incumbent**

