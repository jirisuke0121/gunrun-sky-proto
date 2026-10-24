# Checks every take in dev/assets/sfx before it ships: first/last sample (clicks), late pulses and high-frequency clacks, L/R balance and correlation, peak.
# Usage: python3 tools/audit_sfx.py [dir]   (needs numpy, scipy). Run it after every change to the sound files.
import sys,wave,numpy as np,glob,os
from scipy.signal import find_peaks, butter, sosfilt
d=sys.argv[1] if len(sys.argv)>1 else 'dev/assets/sfx'; sr=44100; bad=0
for f in sorted(glob.glob(d+'/*.wav')):
    w=wave.open(f); assert w.getframerate()==sr and w.getnchannels()==2
    x=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32).reshape(-1,2)/32768; m=x.mean(1)
    h=int(sr*0.004); e=np.sqrt(np.convolve(m**2,np.ones(h)/h,'same')); pk=e.max()
    p,_=find_peaks(e,height=0.07*pk,distance=int(sr*0.015),prominence=0.04*pk); late=[(round(i/sr*1000),round(100*e[i]/pk)) for i in p if i/sr>0.05]
    hp=sosfilt(butter(4,2500,'hp',fs=sr,output='sos'),m); k=int(sr*.002); eh=np.sqrt(np.convolve(hp**2,np.ones(k)/k,'same')); ph=eh[:int(.06*sr)].max()
    ph2,_=find_peaks(eh,height=0.1*ph,distance=int(sr*0.01),prominence=0.05*ph); hf=[(round(i/sr*1000),round(100*eh[i]/ph)) for i in ph2 if i/sr>0.045]
    a=x[:int(.06*sr)]; corr=np.corrcoef(a[:,0],a[:,1])[0,1]; db=20*np.log10(np.sqrt((a[:,0]**2).mean())/np.sqrt((a[:,1]**2).mean()))
    first=np.abs(x[0]).max(); last=np.abs(x[-1]).max(); pkidx=np.abs(m).argmax()/sr*1000
    flags=[]
    if first>0.01: flags.append('START-CLICK')
    if last>0.003: flags.append('END-CLICK')
    if late: flags.append('LATE-PULSE')
    if hf: flags.append('LATE-HF')
    if abs(db)>1.5: flags.append('LR-IMBAL')
    if corr<0.3: flags.append('LOW-CORR')
    if np.abs(x).max()>0.95: flags.append('HOT')
    bad+=bool(flags)
    print(f'{os.path.basename(f)[:-4]:5s} {len(m)/sr*1000:4.0f}ms peak@{pkidx:4.1f}ms first {first:.4f} last {last:.4f} L/R {db:+.1f} corr {corr:.2f} late {late} hf {hf}',flags)
print('takes with flags:',bad)
