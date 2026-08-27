# Unknown65 independent auxiliary screen

Production-safe full tracks only; outer holdout source is removed from auxiliary training.

| candidate | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|
| centroid-top3-a0.5 | 58.84% | 56.92% | 21.05% | 83.48% |
| logistic-global-a0.2 | 58.74% | 56.25% | 36.84% | 84.01% |
| nested-top1-router | 58.68% | 58.60% | 36.84% | 83.17% |
| centroid-top3-a0.3 | 58.58% | 56.19% | 21.05% | 83.48% |
| logistic-top3-a0.1 | 58.58% | 55.90% | 31.58% | 83.48% |
| track-effnet-top3-a0.1 | 58.58% | 55.86% | 31.58% | 83.48% |
| logistic-global-a0.05 | 58.52% | 56.12% | 31.58% | 84.12% |
| logistic-global-a0.1 | 58.52% | 56.07% | 31.58% | 84.49% |
| centroid-global-a0.5 | 58.42% | 56.12% | 21.05% | 84.12% |
| centroid-global-a0.3 | 58.36% | 57.22% | 26.32% | 83.91% |
| centroid-top3-a0.2 | 58.36% | 56.08% | 21.05% | 83.48% |
| track-punk-rock-pair | 58.26% | 58.32% | 31.58% | 83.48% |
| centroid-global-a0.2 | 58.20% | 57.11% | 31.58% | 83.91% |
| centroid-top3-a0.1 | 58.15% | 55.88% | 26.32% | 83.48% |
| incumbent | 58.10% | 58.24% | 31.58% | 83.48% |
| logistic-top3-a0.05 | 58.10% | 55.83% | 31.58% | 83.48% |
| logistic-top3-a0.2 | 58.10% | 55.41% | 36.84% | 83.48% |
| centroid-global-a0.05 | 58.05% | 58.21% | 31.58% | 83.54% |
| centroid-top3-a0.05 | 57.99% | 56.96% | 31.58% | 83.48% |
| nested-pair-router | 57.99% | 55.83% | 31.58% | 83.54% |
| centroid-global-a0.1 | 57.94% | 56.93% | 31.58% | 83.59% |
| logistic-top3-a0.3 | 57.51% | 54.44% | 31.58% | 83.48% |
| logistic-global-a0.3 | 57.25% | 54.68% | 31.58% | 83.64% |
| logistic-top3-a0.5 | 54.33% | 47.91% | 6.67% | 83.48% |
| logistic-global-a0.5 | 52.68% | 48.38% | 21.05% | 81.89% |

Selected: **nested-top1-router**

