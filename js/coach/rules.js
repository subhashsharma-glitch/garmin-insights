// Thresholds from coaching-rules.md (v0.2 "Machine-readable rules"), checked against sources on 2026-10-10.
export const RULES = {
  vo2max: { recentDays: 30, trendDays: 90, trendMinGapDays: 28, dropWatch: 2 },
  resting_hr: { minDays: 14, baselineDays: 30, valid: [25, 150], watchDelta: 3, concernDelta: 5, concernConsecutive: 3, high: 100, normalLow: 40 },
  hrv: { baselineNights: 21, valid: [5, 250], lowConcernDays: 7 },
  sleep: { window: 14, minNights: 7, consistencyNights: 14, goodH: 7, watchH: 6, goodScore: 80, watchScore: 60, sdGood: 30, sdWatch: 60, valid: [2, 14] },
  body_battery: { minDays: 7, baselineDays: 30, good: 76, concern: 50, dropWatch: 10, negDaysWatch: 5 },
  training_load: { minDays: 28, low: 0.8, high: 1.3, danger: 1.5, lowDays: 14,
    goodStatus: ['PRODUCTIVE', 'MAINTAINING', 'PEAKING'], watchStatus: ['UNPRODUCTIVE', 'STRAINED'], concernStatus: ['OVERREACHING'] },
  aerobic: { windowDays: 28, minRuns: 4, maxTempC: 25, maxGainPerKm: 10, easyHrFrac: 0.8, steadyMin: 45, decGood: 5, decConcern: 10, efWatch: -3, efConcern: -5, efImprove: 3 },
  cadence: { days: 30, minRuns: 3, good: 165 },
  red_flags: { rhrHigh3: 100, rhrLow: 40, rhrAboveBaseline: 10, rhrAboveDays: 7, sleepLowH: 5, sleepLowDays: 14 },
  summary: { lookingGoodShare: 0.75, recoveryConcerns: 2 },
};

export const TEXT = {
  vo2max: {
    good: "Your aerobic fitness sits in the {category} range for your age and sex. That's a real asset for long-term health.",
    watch: "Your VO2 max is {value}, in the {category} range{dip}. Small, steady changes in routine usually move this number.",
    concern: "Your estimated aerobic fitness is currently on the lower side for your age. The good news is that this is one of the most trainable numbers there is.",
    next: ['Build toward about 150 minutes a week of moderate activity (NHS/WHO guidance).', 'Once that feels comfortable, add one weekly session of harder intervals.', 'Re-check in 6–8 weeks.'],
    missing: 'Not enough data yet. Do a few outdoor runs with your watch and this will appear.',
  },
  resting_hr: {
    good: 'Your resting heart rate is steady at about {value} bpm — a sign your body is recovering well.',
    watch: "Your resting heart rate has crept up a few beats. That's often just a busy week, poor sleep, alcohol or a cold coming on.",
    concern: "Your resting heart rate has been noticeably higher than your normal for several days. It's worth taking it easy and seeing whether it settles.",
    next: ['Prioritise sleep and hydration.', 'Swap hard sessions for easy ones until it returns to your baseline.', 'If it stays high for over a week without an obvious reason, check in with a GP.'],
  },
  hrv: {
    good: 'Your overnight HRV is inside your usual range, which suggests your body is handling its current load well.',
    watch: 'Your HRV has moved outside your usual range this week. That can follow hard training, stress, travel or a short night.',
    concern: 'Your HRV has stayed below your normal range for a while. Your body may be asking for more recovery.',
    next: ['Take an easier few days.', 'Keep bedtimes consistent and cut back on late alcohol.', 'Read it alongside resting HR and sleep rather than on its own.'],
  },
  sleep: {
    good: "You're getting around {hours} hours a night with good regularity — a great foundation for everything else.",
    watch: 'Your sleep is a bit {how} at the moment. Even 20–30 extra minutes or a steadier bedtime tends to help.',
    concern: "You've been averaging under 6 hours, or your sleep times are swinging a lot. Sleep is the cheapest performance boost there is.",
    next: ['Keep a fixed wake time 7 days a week.', 'Build a short wind-down routine before bed.', 'If you snore loudly, gasp at night or feel sleepy in the day, see a GP.'],
  },
  body_battery: {
    good: "You're typically waking with plenty in the tank (around {value}).",
    watch: "You're starting days with a bit less energy than ideal. Recovery isn't quite keeping up with what the days are taking.",
    concern: "Your Body Battery isn't recharging much overnight. More rest and lower-stress days would help you bounce back.",
    next: ['Protect your sleep.', 'Schedule some easy days.', 'Take short daytime breaks when stress builds.'],
  },
  training_load: {
    good: 'Your training load is building at a sensible pace for what you\'re used to.',
    watch: 'Your recent training is {dir} compared with your usual. That\'s fine short-term; keep an eye on how you feel.',
    concern: "You've ramped up quickly compared with your normal. Big jumps like this are when niggles and fatigue often appear.",
    next: ['Increase weekly load gradually.', 'Put in an easy week every 3–4 weeks.', 'Address any load-focus shortage (for example more easy runs for a low-aerobic shortage).'],
  },
  aerobic: {
    good: "You're {how} — your aerobic engine is in good shape.",
    watch: 'Your heart rate drifts up a fair bit later in longer runs. More easy, steady running usually fixes this.',
    concern: 'Your heart rate climbs a lot in the second half of longer runs. Slowing your easy runs down and building duration gradually will help.',
    next: ['Do most running at a conversational pace.', 'Extend the long run by about 10 minutes every 1–2 weeks.', 'Compare like-for-like conditions (similar route, weather and time of day).'],
  },
  cadence: {
    good: 'Your cadence of about {value} steps a minute looks comfortable and efficient.',
    watch: 'Your cadence is on the lower side ({value}). Slightly quicker, lighter steps can reduce impact for some runners.',
    next: ['Try +5% using a metronome on a few easy runs.', "Don't force it.", 'Stop if anything hurts.'],
  },
  redFlag: "This isn't a diagnosis, but it would be sensible to mention this to a GP or doctor.",
  disclaimer: 'This report is for general fitness and wellbeing information only. It is not medical advice, and it can\'t diagnose or rule out any condition. Wearable measurements are estimates and can be wrong. If you have symptoms, a health condition, or any concern about your heart or sleep, please talk to a qualified healthcare professional. In an emergency, call your local emergency number.',
};
export const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
