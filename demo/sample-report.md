# Sample report (SYNTHETIC data, days 1–90)

> Built from synthetic data because the Garmin connector needs re-authentication. Purpose: check the rules in `../coaching-rules.md` end to end.

## Headline: Time to prioritise recovery
Two recovery signals (resting HR and HRV) have shifted together this week, and Body Battery and sleep point the same way. Your training itself looks well judged, so this is probably life stress, a short run of poor nights, or something coming on. No red flags fired.

| Metric | Computed values | Rule hit | Verdict |
|---|---|---|---|
| VO2 max | no values | min_data not met | **Not enough data** |
| Resting HR | 7-day mean 57.4 vs 30-day baseline 52 (+5.4); ≥+5 for 3 consecutive days | concern: ≥+5 for ≥3 days | **Concern** |
| HRV | 7-day mean 46.3 ms vs baseline band 49–62 ms (10th–90th pct of days 63–83); below band all 7 days | treated as LOW ≥7 days | **Concern** |
| Sleep | 14-night median 6.67 h, score 72, midpoint SD 34 min | watch (6–7 h; score 60–79; SD 30–60) | **Watch** |
| Body Battery | 7-day median high 60 vs baseline 76.5 (−16.5); charged<drained 6/7 days | watch | **Watch** |
| Training load | load ratio 1.13 (no Garmin status in synthetic data) | good: 0.8–1.3 | **Good** |
| Aerobic efficiency | EF change last 4 wk vs prior 4 wk 0.0%; last long-run decoupling 3.7% | good: <5% | **Good** |
| Cadence | median 167 spm (last 30 days) | good: ≥165 | **Good** |

### What it says to the person
- **Resting HR — concern:** "Your resting heart rate has been noticeably higher than your normal for several days. It's worth taking it easy and seeing whether it settles."
- **HRV — concern:** "Your HRV has stayed below your normal range for a while. Your body may be asking for more recovery."
- **Sleep — watch:** "Your sleep is a bit short at the moment. Even 20–30 extra minutes or a steadier bedtime tends to help."
- **Body Battery — watch:** "You're starting days with a bit less energy than ideal. Recovery isn't quite keeping up with what the days are taking."
- **Training load — good:** "Your training load is building at a sensible pace for what you're used to."
- **Aerobic efficiency — good:** "You're holding pace without your heart rate drifting. Your aerobic engine is in good shape."
- **Cadence — good:** "Your cadence of about 167 steps a minute looks comfortable and efficient."
- **VO2 max:** "Not enough data yet. Do a few outdoor runs with your watch and this will appear."

### Next step
Take 2–3 easy or rest days, aim for an earlier, consistent bedtime, and check whether resting HR returns to around 52 bpm. If it stays 10+ bpm above normal for a week with no obvious reason, mention it to a GP.

### Rule-check notes
- The HRV band was computed from the data, as a stand-in for Garmin's `baseline_low/high_ms` (synthetic data has no Garmin status).
- The red-flag check ran: max 3-day RHR mean ~58 (<100); no 7-day run ≥+10. Nothing fired.

---
*This report is for general fitness and wellbeing information only. It is not medical advice, and it can't diagnose or rule out any condition. Wearable measurements are estimates and can be wrong. If you have symptoms or concerns, please talk to a qualified healthcare professional.*
