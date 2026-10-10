# Garmin Insights — Coaching Rules Spec (v0.2)

Purpose: turn uploaded Garmin data into a warm, plain-English fitness report. Each metric gets a verdict of **good**, **watch** or **concern** (or **not enough data**).

Conventions
- "Baseline" = the person's own rolling median over the stated window, excluding the most recent 7 days unless noted. If the source caps history (e.g. Garmin tools return max 28 days), a **21-day baseline** is allowed and must be labelled "short baseline" in the report **[heuristic]**.
- **Evaluation order:** for every metric, test **concern → watch → good**; the first match wins. If a sub-measure is missing, it is skipped (not counted as good); if all sub-measures are missing, the verdict is **not available**.
- **Not available vs. not enough data:** "not available" = the source never provides the field (e.g. no HRV on this device); "not enough data" = field exists but below minimum history. Both are shown neutrally and excluded from the summary counts.
- Thresholds marked **[heuristic]** are product choices based on common coaching practice, not clinical cut-offs. Tune them with real users.
- Thresholds marked **[Garmin]** use Garmin's own documented categories; when Garmin supplies a status/category field, prefer it over recomputing.
- Sources are listed at the end; reviewers should re-check figures against them before launch.

---

## 1. VO2 max
- **Fields:** `vo2_max_running` (and/or `vo2_max_cycling`), `fitness_age`; user `age`, `sex`.
- **Minimum data:** at least 1 value in the last 30 days; trend needs ≥2 values ≥28 days apart. Garmin only estimates VO2 max from outdoor runs/rides with HR (and power for cycling).
- **Healthy ranges:** use Garmin's age- and sex-specific category table (Poor / Fair / Good / Excellent / Superior), which Garmin says is based on Cooper Institute data **[Garmin]**. Do not hard-code our own numbers; ship Garmin's table as a lookup and cite it.
- **Trend:** change vs. value ~90 days earlier. A drop of ≥2 ml/kg/min **[heuristic]** = notable; ±1 is within normal estimate noise **[heuristic]**.
- **Rating:** good = Good/Excellent/Superior and not dropping ≥2; watch = Fair, or any category with a drop ≥2; concern = Poor (for coaching purposes only — not a medical signal on its own).
- **Text:**
  - good: "Your aerobic fitness sits in the {category} range for your age and sex. That's a real asset for long-term health."
  - watch: "Your VO2 max is {value}, in the {category} range{, and it has dipped a little lately}. Small, steady changes in routine usually move this number."
  - concern: "Your estimated aerobic fitness is currently on the lower side for your age. The good news is that this is one of the most trainable numbers there is."
- **Next steps:** build toward ~150 min/week of moderate activity (NHS/WHO); add one weekly session of harder intervals once comfortable; re-check in 6–8 weeks.

## 2. Resting heart rate (RHR)
- **Fields:** daily `resting_hr` (bpm).
- **Minimum data:** 14 days for a verdict; 30 days for a baseline trend (21-day short baseline allowed, see conventions).
- **Healthy range:** 60–100 bpm is the usual adult resting range (AHA, NHS). Lower values (e.g. 40s–50s) are common and normal in fit people. No separate age/sex table is used; trends matter more than absolute values.
- **Trend:** 7-day mean vs. 30-day baseline. +5 bpm or more **[heuristic]** = elevated; sustained ≥3 consecutive days counts.
- **Rating:** good = 7-day mean within 40–100 and < baseline+3; watch = baseline+3 to +5, or isolated days > +5; concern = ≥ +5 for ≥3 days, or 7-day mean >100 (see red flags).
- **Text:**
  - good: "Your resting heart rate is steady at about {value} bpm — a sign your body is recovering well."
  - watch: "Your resting heart rate has crept up a few beats. That's often just a busy week, poor sleep, alcohol or a cold coming on."
  - concern: "Your resting heart rate has been noticeably higher than your normal for several days. It's worth taking it easy and seeing whether it settles."
- **Next steps:** prioritise sleep and hydration; swap hard sessions for easy ones until it returns to baseline; if it stays high over a week without an obvious reason, check in with a GP.

## 3. HRV (overnight)
- **Availability:** some watches do not record HRV status; if all fields are null, report **not available**.
- **Fields:** `hrv_status` (BALANCED / UNBALANCED / LOW / POOR / no status), `last_night_avg_ms`, `weekly_avg_ms`, `baseline_low_ms`, `baseline_high_ms`.
- **Minimum data:** Garmin needs about 3 weeks of overnight wear to establish a baseline **[Garmin]**; before that, report "still learning your baseline".
- **Healthy range:** HRV is highly individual and falls with age; there is no useful population "normal". Use only the personal baseline band **[Garmin]**.
- **Trend:** 7-day average vs. baseline band.
- **Rating:** good = BALANCED (weekly avg inside band); watch = UNBALANCED (outside band, either side); concern = LOW or POOR for ≥7 days.
- **Text:**
  - good: "Your overnight HRV is inside your usual range, which suggests your body is handling its current load well."
  - watch: "Your HRV has moved outside your usual range this week. That can follow hard training, stress, travel or a short night."
  - concern: "Your HRV has stayed below your normal range for a while. Your body may be asking for more recovery."
- **Next steps:** an easier few days, consistent bedtimes, less late alcohol; look at it alongside RHR and sleep rather than alone.

## 4. Sleep (duration, score, consistency)
- **Fields:** `sleep_duration_s`, `sleep_score`, `sleep_start_local`, `sleep_end_local` (start/end are optional; some sources do not provide them).
- **Minimum data:** 7 nights for duration/score; 14 nights for consistency.
- **Healthy ranges:** adults 18–64: 7+ hours/night (AASM/SRS consensus; NSF 7–9 h); adults 65+: 7–8 h (NSF). Garmin sleep score: 90–100 Excellent, 80–89 Good, 60–79 Fair, <60 Poor **[Garmin]**.
- **Consistency:** standard deviation of sleep-midpoint over 14 nights. ≤30 min good, 30–60 min watch, >60 min concern **[heuristic]**. If start/end times are missing, mark consistency **not available** and rate sleep on duration and score only.
- **Short nights:** count nights <6 h in the last 14. ≥3 → at least watch **[heuristic]**. Nights <4 h followed by a normal day are flagged **low confidence** (possible partial detection) and reported, but still counted.
- **Rating (combine, worst wins, but score alone can't make "concern"):**
  - good = median duration ≥7 h, median score ≥80, consistency ≤30 min.
  - watch = median 6–7 h, or score 60–79, or consistency 30–60 min, or ≥3 of 14 nights <6 h **[heuristic]**.
  - concern = median <6 h **[heuristic]**, or consistency >60 min.
- **Text:**
  - good: "You're getting around {hours} hours a night with good regularity — a great foundation for everything else."
  - watch: "Your sleep is a bit {short/irregular} at the moment. Even 20–30 extra minutes or a steadier bedtime tends to help."
  - concern: "You've been averaging under 6 hours, or your sleep times are swinging a lot. Sleep is the cheapest performance boost there is."
- **Next steps:** fixed wake time 7 days a week; wind-down routine; if loud snoring, gasping, or daytime sleepiness, see a GP.

## 5. Body Battery
- **Fields:** daily `bb_max` (morning high), `bb_min`, `bb_charged`, `bb_drained`.
- **Minimum data:** 7 days.
- **Range:** 5–100 scale **[Garmin]**. Garmin describes 76–100 high, 51–75 medium, 26–50 low, 0–25 very low energy reserve **[Garmin]**.
- **Trend:** 7-day median of morning high vs. 30-day (or short 21-day) baseline; drop ≥10 points **[heuristic]**. The daily `charged`/`drained` totals are **not used**: on real data they did not match the Body Battery timeline.
- **Rating:** good = morning-high median ≥76 **[Garmin band]**; watch = 51–75, or drop ≥10; concern = ≤50 median.
- **Text:**
  - good: "You're typically waking with plenty in the tank (around {value})."
  - watch: "You're starting days with a bit less energy than ideal. Recovery isn't quite keeping up with what the days are taking."
  - concern: "Your Body Battery isn't recharging much overnight. More rest and lower-stress days would help you bounce back."
- **Next steps:** protect sleep; schedule easy days; short daytime breaks for stress.

## 6. Training load
- **Fields:** daily `acute_load` (Garmin 7-day weighted EPOC load), `chronic_load`, `training_status`, `acwr_status`, `load_focus` (low aerobic / high aerobic / anaerobic, with shortage/balanced/excess).
- **Parsing:** Garmin `training_status` values carry a numeric suffix (e.g. `MAINTAINING_2`, `OVERREACHING_5`); match on the **prefix** before the underscore. Compute `load_ratio = acute_load / chronic_load` yourself, or use Garmin's `acwr_status`. Never treat `acwr_percent` as a ratio (illustrative example: a source could report `acwr_percent: 25` while acute 300 ÷ chronic 400 = 0.75; use the 0.75).
- **Minimum data:** 28 days for chronic load / ratio; Garmin needs ~4 weeks to give load focus **[Garmin]**.
- **Ranges:** Garmin colours the acute-load ratio and status itself — prefer that. If computing, use acute:chronic workload ratio 0.8–1.3 as "sweet spot", >1.5 as "danger zone" (Gabbett, BJSM 2016) **[heuristic — research contested]**.
- **Look-back:** today's value is not enough. Also check the last 14 days of status and the last 28 days of chronic load.
- **Rating:** good = ratio 0.8–1.3 and status Productive/Maintaining/Peaking and no look-back trigger; watch = ratio 1.3–1.5 or <0.8 for ≥14 days, or status Unproductive/Strained, or any load-focus "shortage", or OVERREACHING on ≥3 of the last 14 days **[heuristic]**, or chronic load up >50% over 28 days **[heuristic]**; concern = ratio >1.5, or current status Overreaching.
- **Text:**
  - good: "Your training load is building at a sensible pace for what you're used to."
  - watch: "Your recent training is {a step up / lighter} compared with your usual. That's fine short-term; keep an eye on how you feel."
  - concern: "You've ramped up quickly compared with your normal. Big jumps like this are when niggles and fatigue often appear."
- **Next steps:** increase weekly load gradually; insert an easy week every 3–4; address load-focus shortage (e.g. more easy runs if low-aerobic shortage).

## 7. Pace at heart rate (aerobic efficiency & decoupling)
- **Fields (per run):** `distance_m`, `duration_s`, `avg_hr`, split-level `pace` and `hr` (from activity details), `elevation_gain_m`, `temperature`.
- **Derived:**
  - Efficiency Factor (EF) = speed (m/min) ÷ avg HR, on easy flat-ish runs (avg HR < ~80% of max, gain < 10 m/km) **[heuristic filter]**.
  - Aerobic decoupling = (EF first half − EF second half) ÷ EF first half, on steady runs ≥45 min. A run qualifies only if ≥70% of its time is in Garmin HR zones 1–2 (from `hr_zones`) **[heuristic]**; drop any split whose HR is >15 bpm above the previous split **[heuristic]**.
- **Minimum data:** ≥4 qualifying easy runs in each of two 4-week windows for EF trend; ≥1 steady run ≥45 min for decoupling.
- **Thresholds:** decoupling <5% indicates good aerobic endurance for that duration (Friel / TrainingPeaks) **[heuristic]**; 5–10% watch; >10% concern. EF trend: +≥3% = improving, −≥3% = declining **[heuristic]**. Heat >25 °C invalidates the comparison.
- **Rating (concern → watch → good):** concern = decoupling >10% or EF falling >5%; watch = decoupling 5–10% or EF falling 3–5%; good = every available sub-measure is within its good band (decoupling <5%, EF change ≥ −3%). A missing sub-measure is skipped; if both are missing → not enough data.
- **Text:**
  - good: "You're running {faster at the same heart rate / holding pace without your heart rate drifting} — your aerobic engine is in good shape."
  - watch: "Your heart rate drifts up a fair bit later in longer runs. More easy, steady running usually fixes this."
  - concern: "Your heart rate climbs a lot in the second half of longer runs. Slowing your easy runs down and building duration gradually will help."
- **Next steps:** most running at conversational pace; extend the long run by ~10 min every 1–2 weeks; compare like-for-like conditions.

## 8. Running cadence
- **Fields (per run):** `avg_cadence_spm` (steps/min, both feet), `avg_speed`, `height` if known. Some sources (e.g. the current Garmin connector's activity summary) omit cadence; then report **not available**. FIT-file uploads normally include it.
- **Minimum data:** ≥3 runs in 30 days.
- **Ranges:** there is no single ideal. ~180 spm is a widely quoted guide (Daniels) but cadence rises with speed and varies with height **[heuristic]**. Research suggests a 5–10% increase from a person's own cadence can reduce loading on knee and hip (Heiderscheit et al., 2011).
- **Rating:** good = easy-run median ≥165 spm, or stable vs. baseline **[heuristic]**; watch = 155–164 spm **[heuristic]**; concern = never "concern" by itself — use watch at most (cadence is a technique cue, not a health marker).
- **Text:**
  - good: "Your cadence of about {value} steps a minute looks comfortable and efficient."
  - watch: "Your cadence is on the lower side ({value}). Slightly quicker, lighter steps can reduce impact for some runners."
- **Next steps:** try +5% using a metronome on a few easy runs; don't force it; stop if anything hurts.

---

## Overall summary rule
1. Collect verdicts for metrics with enough data.
2. If any red flag fires → lead with the red-flag message, gently.
3. Else headline = "Looking good" if ≥75% good and no concern; "A few things to watch" if any watch and no more than one concern; "Time to prioritise recovery" if ≥2 concerns among RHR / HRV / Sleep / Body Battery / Load **[heuristic]**.
4. Mention at most 3 strengths and 3 focus areas, ordered: recovery metrics (sleep, RHR, HRV, BB) → load → fitness (VO2, efficiency, cadence).
5. Always end with one concrete next step and the disclaimer.

## Data quality & missing data
- Coverage: a metric needs its minimum data; otherwise show "Not enough data yet — wear your watch overnight for {n} more nights".
- Wear-time: discard days with <16 h wear or no sleep detected for overnight metrics.
- Outliers: drop RHR outside 25–150, HRV outside 5–250 ms, sleep <2 h or >14 h as likely artefacts **[heuristic]**; mention excluded count.
- Device change: if device model changes, restart baselines (different sensors).
- Activity data: ignore runs with HR dropouts (>10% missing samples), treadmill runs without calibration for pace, and runs >25 °C for EF comparisons.
- Never fill gaps by interpolation for verdicts; plots may show gaps.
- Always show the date range and number of days used.

## Red flags — suggest seeing a doctor
Wording: "This isn't a diagnosis, but it would be sensible to mention this to a GP or doctor."
- Resting HR >100 bpm averaged over ≥3 days while not ill or training heavily (tachycardia threshold, AHA/NHS).
- Resting HR <40 bpm in a non-athlete, or any low HR with dizziness/fainting (AHA).
- Resting HR ≥10 bpm above baseline for ≥7 days with no clear cause **[heuristic]**.
- Any user-reported chest pain, fainting, palpitations, or breathlessness at rest → urgent: "please seek medical help now (NHS 111 / 999 in the UK, or local emergency number)".
- Garmin irregular-rhythm / ECG alerts if present in the upload.
- Sleep median <5 h for ≥14 days, or reported loud snoring with pauses **[heuristic]**.

## Medical disclaimer (show on every report)
> This report is for general fitness and wellbeing information only. It is not medical advice, and it can't diagnose or rule out any condition. Wearable measurements are estimates and can be wrong. If you have symptoms, a health condition, or any concern about your heart or sleep, please talk to a qualified healthcare professional. In an emergency, call your local emergency number.

## Machine-readable rules
```yaml
version: 0.2
verdicts: [good, watch, concern, insufficient_data, not_available]
evaluation_order: [concern, watch, good]   # first match wins; missing sub-measures skipped
baseline:
  default_days: 30
  short_baseline_days: 21        # heuristic; label as "short baseline"
metrics:
  vo2max:
    fields: [vo2_max_running, vo2_max_cycling]
    min_data: {values_last_days: 30, count: 1}
    lookup: garmin_vo2_category(age, sex)        # Garmin/Cooper table
    trend: {window_days: 90, drop_watch: 2.0}    # heuristic
    rules:
      good: "category in [good, excellent, superior] and drop < 2"
      watch: "category == fair or drop >= 2"
      concern: "category == poor"
  resting_hr:
    fields: [resting_hr]
    min_data: {days: 14, baseline_days: 30, short_baseline_days: 21}
    valid_range: [25, 150]
    rules:
      good: "mean7 <= 100 and mean7 - baseline30 < 3"
      watch: "3 <= mean7 - baseline30 < 5"
      concern: "consecutive_days(rhr - baseline30 >= 5) >= 3 or mean7 > 100"
  hrv:
    fields: [hrv_status, weekly_avg_ms, baseline_low_ms, baseline_high_ms]
    if_all_null: not_available
    min_data: {nights: 21}
    rules:
      good: "status == BALANCED"
      watch: "status == UNBALANCED"
      concern: "status in [LOW, POOR] for >= 7 days"
  sleep:
    fields: [sleep_duration_s, sleep_score]
    optional_fields: [sleep_start_local, sleep_end_local]   # consistency -> not_available if missing
    min_data: {nights: 7, consistency_nights: 14}
    low_confidence_night_h: 4                                # heuristic: possible partial detection
    target_hours: {age_18_64: 7, age_65_plus: 7}
    rules:
      good: "median_h >= 7 and median_score >= 80 and midpoint_sd_min <= 30"
      watch: "6 <= median_h < 7 or 60 <= median_score < 80 or 30 < midpoint_sd_min <= 60 or count14(sleep_h < 6) >= 3"  # last clause heuristic
      concern: "median_h < 6 or midpoint_sd_min > 60"
    combine: worst
  body_battery:
    fields: [bb_max, bb_min]
    ignored_fields: [bb_charged, bb_drained]   # inconsistent with timeline on real data
    min_data: {days: 7}
    rules:
      good: "median7(bb_max) >= 76"
      watch: "51 <= median7(bb_max) < 76 or baseline - median7(bb_max) >= 10"
      concern: "median7(bb_max) <= 50"
  training_load:
    fields: [acute_load, chronic_load, training_status, acwr_status, load_focus]
    ignored_fields: [acwr_percent]             # not a ratio
    derived: {ratio: "acute_load / chronic_load", status: "prefix(training_status, '_')"}
    min_data: {days: 28}
    rules:
      concern: "ratio > 1.5 or status == OVERREACHING"
      watch: "1.3 < ratio <= 1.5 or (ratio < 0.8 for 14 days) or status in [UNPRODUCTIVE, STRAINED] or focus_shortage or count14(status == OVERREACHING) >= 3 or chronic_change_28d_pct > 50"  # last two heuristic
      good: "0.8 <= ratio <= 1.3 and status in [PRODUCTIVE, MAINTAINING, PEAKING]"
  aerobic_efficiency:
    fields: [distance_m, duration_s, avg_hr, splits, elevation_gain_m, temperature_c]
    filters: {max_temp_c: 25, max_gain_m_per_km: 10, min_share_hr_zone_1_2: 0.70, drop_split_hr_jump_bpm: 15}  # heuristics
    min_data: {easy_runs_per_window: 4, windows_days: [28, 28], steady_run_min: 45}
    rules:
      concern: "decoupling_pct > 10 or ef_change_pct < -5"
      watch: "5 <= decoupling_pct <= 10 or -5 <= ef_change_pct < -3"
      good: "all_available(decoupling_pct < 5, ef_change_pct >= -3)"
    if_all_missing: insufficient_data
  cadence:
    fields: [avg_cadence_spm]
    if_all_null: not_available
    min_data: {runs_last_30d: 3}
    rules:
      good: "median_spm >= 165"
      watch: "median_spm < 165"
      concern: never
red_flags:
  - "mean3(resting_hr) > 100"
  - "resting_hr < 40 and not athlete"
  - "consecutive_days(rhr - baseline30 >= 10) >= 7"
  - "median14(sleep_h) < 5"
  - "garmin_irregular_rhythm_alert == true"
summary:
  red_flag_first: true
  headline:
    looking_good: "share_good >= 0.75 and concerns == 0"
    prioritise_recovery: "concerns_in([resting_hr, hrv, sleep, body_battery, training_load]) >= 2"
    default: "a_few_things_to_watch"
```

## Sources
- Garmin — VO2 max (categories based on Cooper Institute data): https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/vo2-max/
- Garmin — HRV status: https://www.garmin.com/en-US/garmin-technology/health-science/hrv-status/
- Garmin — Body Battery: https://www.garmin.com/en-US/garmin-technology/health-science/body-battery/
- Garmin — Sleep score: https://www.garmin.com/en-US/garmin-technology/health-science/sleep-score/
- Garmin — Training load / load focus: https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/training-load/
- American Heart Association — resting heart rate: https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse
- NHS — pulse/heart rate and physical activity guidelines: https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/
- AASM/SRS adult sleep consensus (Watson et al., 2015): https://jcsm.aasm.org/doi/10.5664/jcsm.4758
- National Sleep Foundation duration recommendations (Hirshkowitz et al., 2015): https://doi.org/10.1016/j.sleh.2014.12.010
- Gabbett 2016, training–injury prevention paradox (ACWR): https://bjsm.bmj.com/content/50/5/273
- Heiderscheit et al. 2011, step rate and joint loading: https://doi.org/10.1249/MSS.0b013e3181ebedf4
- TrainingPeaks — aerobic decoupling: https://www.trainingpeaks.com/blog/aerobic-endurance-and-decoupling/

## Changelog
- **v0.2 (2026-10-10)**, after the first test on real anonymised Garmin data:
  1. Training status is matched on its prefix (Garmin adds suffixes like `_2`).
  2. `acwr_percent` is ignored; the ratio is acute ÷ chronic, or Garmin's `acwr_status` is used.
  3. Training load has a look-back: OVERREACHING on ≥3 of 14 days, or chronic load up >50% in 28 days, gives "watch" **[heuristic]**.
  4. Sleep: ≥3 of 14 nights under 6 h gives "watch" **[heuristic]**; nights under 4 h are flagged low confidence.
  5. Sleep consistency is "not available" when start/end times are missing.
  6. Body Battery charged/drained totals were dropped (they didn't match the timeline).
  7. A labelled 21-day short baseline is allowed when the source caps history **[heuristic]**.
  8. Decoupling only counts runs with ≥70% of time in HR zones 1–2, and drops spike splits **[heuristic]**.
  9. Explicit evaluation order (concern → watch → good); missing sub-measures are skipped.
  10. New "not available" verdict for fields the source never provides (HRV, VO2 max, cadence).
- **v0.1 (2026-10-10):** initial draft.
