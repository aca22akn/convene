# convene
Open-source live member intros and speaker finder for London community events

## Evaluation

<!-- EVAL:START -->
| Assignment | Scoring | Precision@2 | Recall | should_not_meet produced | Intros | Grounded reasons |
|---|---|---|---|---|---|---|
| greedy | tags (keyword extraction, no API key) | 94% | 70% (16/23) | 1 | 36 | — |
| blossom | tags (keyword extraction, no API key) | 90% | 78% (18/23) | 2 | 37 | — |
| greedy | tags (Grok extraction) | 100% | 65% (15/23) | 0 | 37 | — |
| blossom | tags (Grok extraction) | 87% | 57% (13/23) | 2 | 39 | — |
| greedy | reranked (tags + Grok) | 100% | 65% (15/23) | 0 | 37 | 0% |
| blossom | reranked (tags + Grok) | 87% | 57% (13/23) | 2 | 39 | 0% |

- Data: 40 fictional sample members, 23 `should_meet` and 6 `should_not_meet` human-reviewed pairs. Each person gets at most 2 intros.
- Precision@2 = should_meet / (should_meet + should_not_meet) among produced intros that were labelled; recall = labelled should_meet pairs produced / all should_meet pairs.
- Extraction: 33/40 by Grok (p50 13714 ms). Join-to-intro latency (extraction + one rerank call + assignment): p50 43157 ms, p95 60986 ms. Grounded reasons (blossom, reranked): 0% — the rest fall back to tag templates.
- Model: grok-4.7. Run on 2026-10-22 19:32 UTC with `npm run eval`.
<!-- EVAL:END -->
