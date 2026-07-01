# Genre Score Search Report

Generated: 2026-06-22T14:24:24Z

## Purpose

30ジャンル以上のジャンル推定正答率80%を目標に、音源追加なしで分類器設定を自動探索した。入力データは外付けへ退避済みの正式特徴量キャッシュのみを使う。

## Current Baseline

現在の正式基準は `advanced-validation-reranker`。設定は `strict CC/local only + theory priors off + validation calibration on + advanced genre features on + validation reranker on + distribution classifier on + separability weights on`。

## Result

Best: `advanced-validation-reranker` / objective `113.735`

| config | objective | Macro Top1 | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Needs review | Dub rate | decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| advanced-validation-reranker | 113.735 | 32.1% | 17.9% | 35.3% | 20.8% | 39.8% | 12.1% | 9.3% | adopted |
| advanced | 113.699 | 32.1% | 17.9% | 35.3% | 20.8% | 39.8% | 12.3% | 9.3% | near tie |
| advanced-reranker-style-boost-mid | 108.733 | 32.1% | 17.9% | 35.6% | 20.8% | 40.1% | 11.9% | 10.5% | reject: dub guardrail |
| advanced-reranker-style-boost-technoish | 108.805 | 32.1% | 17.3% | 35.3% | 20.1% | 39.8% | 11.9% | 10.1% | reject: Top1 drop / dub guardrail |
| advanced-reranker-style-boost-strong | 105.407 | 32.1% | 17.6% | 35.3% | 20.4% | 39.8% | 10.7% | 11.1% | reject: dub guardrail |
| advanced-fma-full | 113.254 | 32.5% | 17.9% | 35.0% | 20.8% | 39.4% | 14.0% | 8.4% | reject: lower Top3 / higher review |
| advanced-theory-priors-light | 111.973 | 32.1% | 17.6% | 35.0% | 20.4% | 39.4% | 13.0% | 9.3% | reject |
| current-formal | 111.691 | 32.1% | 17.9% | 34.7% | 20.4% | 39.1% | 14.6% | 7.6% | superseded |
| advanced-fma-light | 111.212 | 32.9% | 17.9% | 34.7% | 20.8% | 38.7% | 11.9% | 9.5% | reject: lower Formal Top3 |
| advanced-theory-features | 105.095 | 33.1% | 16.4% | 31.3% | 19.0% | 35.9% | 14.0% | 6.2% | reject |

Earlier rejected configurations remain rejected:

| config | reason |
| --- | --- |
| extended | Macro rose, but Fine Top1 / Formal Fine Top3 dropped. |
| advanced-extended | Too many extra features reduced Fine Top3 and Formal Fine Top3. |
| theory-features | Macro improved but Fine Top3 fell sharply. |
| hard-macro-gate | Formal Fine Top3 can rise, but Fine Top1 falls. |
| balanced-knn / strict-two-stage / macro-heuristics / no-distribution / no-separability | Lower objective than the formal baseline. |

## Score Movement

| metric | previous formal | adopted |
| --- | ---: | ---: |
| Macro Top1 | 32.1% | 32.1% |
| Fine Top1 | 17.9% | 17.9% |
| Fine Top3 | 34.7% | 35.3% |
| Formal Fine Top1 | 20.4% | 20.8% |
| Formal Fine Top3 | 39.1% | 39.8% |
| Style Top1 | 44.9% | 51.0% |
| Needs review | 14.6% | 12.1% |
| Dub prediction rate | 7.6% | 9.3% |

## Findings

- `advanced` features are now useful: MFCC, spectral rolloff, tempo stability, beat-grid strength, syncopation, and vocal presence improve Fine Top3 and Formal Fine scores.
- `validation-reranker` is a small but positive addition on top of `advanced`; it keeps Top1/Top3 unchanged while reducing needs-review rate.
- Stronger style-to-fine boosting can improve Formal Fine Top3 to 40.1%, but it pushes dub prediction rate above the 10% guardrail and is not adopted.
- `extended` features are not ready for the primary model. Band flux / percussive / pulse features currently push macro up but fine accuracy down.
- FMA weighting changes do not beat `advanced-validation-reranker`.
- The main remaining blocker is data/label quality, especially `テクノ`, `ドローン`, and long-tail genres with only a few formal rows.

## Next Best Move

1. Add cleaner explicit formal audio for `テクノ` before more global classifier tuning; advanced features currently drop genre Top1 for techno even while improving aggregate score.
2. Add the remaining 12 high-purity drone rows only if they pass a stricter sustain / low-onset / low-beat-grid review.
3. Keep dub prediction under the 10% guardrail while improving reggae / hip-hop / dub separation with source-level review rather than broad dub suppression.
