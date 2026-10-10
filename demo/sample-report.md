# Sample report: SYNTHETIC data, days 1–90. Rules v0.2

> Synthetic fixture (`generate_synthetic.py`, seed 42). It contains no real user data. Used to check the rules end to end.

## Headline: A few things to watch
Your resting heart rate is up on your normal and your HRV has dipped, with sleep and Body Battery pointing the same way. Your training itself looks well judged, so this is more likely a busy week, a short run of poor nights, or something coming on. No red flags fired.

| Metric | Computed values | Rule hit (concern → watch → good) | Verdict |
|---|---|---|---|
| VO2 max | no values | min_data not met | **Not enough data** |
| Resting HR | 7-day mean 57.4 vs 30-day baseline 52 (+5.4); ≥+5 for 3 consecutive days | concern: ≥+5 for ≥3 days | **Concern** |
| HRV | baseline band 49.4–61.8 ms (10th–90th percentile, days 63–83); 7-day mean 46.3 ms; rolling 7-day mean below the band on 3 of the last 7 days; nightly values in the band on nights 86 and 89 | no Garmin status, so status is inferred from the weekly average: below the band = UNBALANCED; concern needs ≥7 days, not met | **Watch** |
| Sleep | 14-night median 6.67 h, score 72, midpoint SD 34 min; 0 of 14 nights under 6 h | watch: 6–7 h, score 60–79, SD 30–60 | **Watch** |
| Body Battery | 7-day median of daily highs 60 vs baseline 76.5 (−16.5); charged/drained ignored (v0.2) | watch: 51–75 and drop of 10 or more | **Watch** |
| Training load | ratio 1.13; no Garmin status in the synthetic data; chronic load +20% over 28 days | no concern or watch trigger; good: 0.8–1.3 | **Good** |
| Aerobic efficiency | EF change −0.6% (days 63–90 vs 35–62); decoupling 3.7% on the last long run, but the synthetic data has no HR zones, so the zone 1–2 filter can't be applied and decoupling is skipped | good: EF ≥ −3% | **Good** |
| Cadence | median 167 spm (last 30 days) | good: ≥165 | **Good** |

Overall-summary rule: 7 metrics rated, 3 good (43%), 3 watch, 1 concern. Concerns among the recovery metrics: 1, below the 2 needed for "prioritise recovery". That gives the default headline, **"A few things to watch"**.
Red flags: 3-day resting HR mean is about 58 (under 100); there's no 7-day run at +10 or more; sleep median is above 5 h. **None fired.**

### What the person sees
- **Resting HR (concern):** "Your resting heart rate has been noticeably higher than your normal for several days. It's worth taking it easy and seeing whether it settles."
- **HRV (watch):** "Your HRV has moved outside your usual range this week. That can follow hard training, stress, travel or a short night."
- **Sleep (watch):** "Your sleep is a bit short and irregular at the moment. Even 20–30 extra minutes or a steadier bedtime tends to help."
- **Body Battery (watch):** "You're starting days with a bit less energy than ideal. Recovery isn't quite keeping up with what the days are taking."
- **Training load (good):** "Your training load is building at a sensible pace for what you're used to."
- **Aerobic efficiency (good):** "You're running at about the same pace for the same heart rate as last month, so your aerobic engine is holding steady."
- **Cadence (good):** "Your cadence of about 167 steps a minute looks comfortable and efficient."
- **VO2 max:** "Not enough data yet. Do a few outdoor runs with your watch and this will appear."

**Next step:** take 2–3 easy days and keep bedtimes steady. Check whether resting HR returns to around 52 bpm. If it stays 10+ bpm above normal for a week with no obvious reason, mention it to a GP.

### Changes from the v0.1 synthetic report
- HRV changed from Concern to **Watch**. v0.1 wrongly treated all 7 nights as below the band, but nights 86 and 89 are in it. The v0.2 rule reads the weekly average (UNBALANCED); concern needs LOW/POOR for 7 or more days.
- The headline changed from "Time to prioritise recovery" to **"A few things to watch"**, because only 1 recovery metric is a concern now.
- The EF change went from 0.0% to **−0.6%**. The reference script's windows were off by one day (36–63 vs 64–90); they are now two 28-day windows, 35–62 vs 63–90. The verdict stays Good.
- Decoupling is no longer used for this fixture (no HR zones, v0.2 filter). Body Battery charged/drained is no longer used.
- The data files are byte-identical; only the evaluation changed.

---
*This report is for general fitness and wellbeing information only. It is not medical advice, and it can't diagnose or rule out any condition. Wearable measurements are estimates and can be wrong. If you have symptoms or concerns, please talk to a qualified healthcare professional.*
