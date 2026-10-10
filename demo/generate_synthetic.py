import random, csv, statistics as st
random.seed(42)
N=90; days=[]
for d in range(1,N+1):
    late = d>83
    rhr = round(random.gauss(52,1.5) + (6 if late else 0))
    hrv = round(random.gauss(55,5) - (8 if late else 0))
    sl = round(random.gauss(6.9,0.5),2)
    score = max(40,min(98,round(70+ (sl-6.5)*15 + random.gauss(0,5))))
    mid = round(random.gauss(3*60+30,35))  # minutes after midnight
    bbmax = max(20,min(100,round(random.gauss(78,7) - (12 if late else 0))))
    bbmin = max(5,bbmax-random.randint(50,70))
    ch = random.randint(45,75); dr = ch + random.randint(-15,15) + (10 if late else 0)
    days.append(dict(day=d,resting_hr=rhr,hrv_last_night_ms=hrv,sleep_hours=sl,sleep_score=score,
      sleep_midpoint_min_after_midnight=mid,bb_max=bbmax,bb_min=bbmin,bb_charged=ch,bb_drained=dr,
      steps=random.randint(6000,14000)))
acts=[]; aid=0
for d in range(1,N+1):
    if d%7 in (1,3,5) or (d%7==0):
        aid+=1; long = d%7==0
        dur = random.randint(70,95) if long else random.randint(35,50)
        speed = random.gauss(170+d*0.08,4)  # m/min, slow improvement
        hr = round(random.gauss(142,3)); 
        dec = round(random.gauss(4.0,1.5),1) if long else None
        acts.append(dict(activity=aid,day=d,type="running",duration_min=dur,distance_km=round(speed*dur/1000,2),
          avg_hr=hr,avg_cadence_spm=round(random.gauss(168,3)),elevation_gain_m=random.randint(10,80),
          temperature_c=round(random.gauss(14,4),1),decoupling_pct=dec))
# training load (acute 7d sum, chronic 28d avg*7)
loads=[0]*(N+1)
for a in acts: loads[a["day"]]+= a["duration_min"]*1.4 + (30 if a["day"]>76 else 0)
for r in days:
    d=r["day"]; ac=sum(loads[max(1,d-6):d+1]); ch=sum(loads[max(1,d-27):d+1])/4
    r["acute_load"]=round(ac); r["chronic_load"]=round(ch) if d>=28 else ""
    r["load_ratio"]=round(ac/ch,2) if d>=28 and ch else ""
for fn,rows in (("daily.csv",days),("activities.csv",acts)):
    with open(fn,"w",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
# evaluate
L=days[-7:]; B=days[-37:-7]
m7=st.mean(r["resting_hr"] for r in L); b30=st.median(r["resting_hr"] for r in B)
consec=0;mx=0
for r in days[-7:]:
    consec = consec+1 if r["resting_hr"]-b30>=5 else 0; mx=max(mx,consec)
hb=[r["hrv_last_night_ms"] for r in days[-28:-7]]; lo,hi=st.quantiles(hb,n=10)[0],st.quantiles(hb,n=10)[-1]
h7=st.mean(r["hrv_last_night_ms"] for r in L)
s14=days[-14:]; sh=st.median(r["sleep_hours"] for r in s14); ss=st.median(r["sleep_score"] for r in s14)
sd=st.pstdev([r["sleep_midpoint_min_after_midnight"] for r in s14])
bb7=st.median(r["bb_max"] for r in L); bb30=st.median(r["bb_max"] for r in B); neg=sum(r["bb_charged"]<r["bb_drained"] for r in L)
ratio=days[-1]["load_ratio"]
runs=[a for a in acts]; ef=lambda a:(a["distance_km"]*1000/a["duration_min"])/a["avg_hr"]
e1=st.mean(ef(a) for a in runs if 35<a["day"]<=63); e2=st.mean(ef(a) for a in runs if a["day"]>63)
lastdec=[a["decoupling_pct"] for a in runs if a["decoupling_pct"] is not None][-1]
cad=st.median(a["avg_cadence_spm"] for a in runs if a["day"]>60)
print(dict(rhr7=round(m7,1),rhr_base=b30,consec=mx,hrv7=round(h7,1),band=(round(lo),round(hi)),sleep_h=sh,score=ss,mid_sd=round(sd),
 bb7=bb7,bb30=bb30,neg=neg,ratio=ratio,ef_change=round((e2/e1-1)*100,1),dec=lastdec,cad=cad))
