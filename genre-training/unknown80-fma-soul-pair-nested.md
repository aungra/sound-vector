# Unknown80 FMA Soul pair nested confirmation

The 13 FMA Soul-RnB rows are training-only. They are excluded whenever FMA is
an outer or inner holdout, and outer-source rows never select the pair or its
strength.

| candidate | Top1 | balanced | minimum source | Top3 |
|---|---:|---:|---:|---:|
| incumbent | 58.15% | 58.29% | 31.58% | 83.48% |
| nested Soul pair | 58.15% | 58.29% | 31.58% | 83.48% |

Decision: **reject-no-nested-gain**

The non-nested screen reached 58.20%, but that gain did not survive the outer
source-blind confirmation. The overlay remains research evidence and is not
promoted to production inference.
