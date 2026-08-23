# Track 4x30 runtime parity

The server already planned four 30-second ranges, but embedding inference concatenated them and sampled three overlapping 45-second windows. The updated path passes the four planned files directly and preserves their real track offsets.

| expected | final before | final after | embedding before | embedding after | margin before | margin after |
|---|---|---|---|---|---:|---:|
| House | House | House | House 38.5% | House 41.3% | 25.5 | 29.3 |
| Techno | Funk | Funk | Techno 31.0% | Techno 33.4% | 18.8 | 21.9 |
| Trance | Deep House | Deep House | Deep House 20.9% | Deep House 21.1% | 2.6 | 1.2 |
| Deep House | Reggae | Reggae | Ambient 36.2% | Ambient 38.7% | 10.2 | 11.6 |

Final Top1 changed on 0/4 tracks. This is a runtime contract promotion, not an unknown-source accuracy claim.

The independent electronic reranker was rejected: strict source-heldout Top1 was 58.63% versus the v99 incumbent at 58.68%.
