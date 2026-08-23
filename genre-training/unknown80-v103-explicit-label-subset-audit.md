# Unknown80 v103 explicit-label subset audit

The production baseline remains the complete fixed OOF. The subset is diagnostic only and must not be reported as an engine gain.

| scope | rows | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|---:|
| fixed OOF | 1883 | 59.59% | 59.31% | 31.58% | 83.48% |
| known weak labels excluded | 1876 | 59.70% | 59.29% | 33.33% | 83.53% |

Known weak rows excluded: 7

Decision: keep v103 unchanged; audit or replace weak labels before using them in future model selection.
