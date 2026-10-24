# Rebuilds dev/assets/sfx/*.wav from "The Free Firearm Sound Library" (CC0; the "Prepared SFX Library" folder).
# Usage: python3 tools/build_sfx_takes.py OUTDIR [LIBRARY_DIR]   then   python3 tools/audit_sfx.py OUTDIR   then copy into dev/assets/sfx.
# HG=1917/B_24P, SG=Model 12/K_22P, MG=AK-47/C_28P, SMG=Carl Gustav M45/G_35P (heads of a burst). Needs numpy and scipy.
# Each take starts where the envelope leaves 2% of its peak (not mid-attack), gets a 1.5 ms fade-in, L/R level equalised,
# stereo width narrowed (M/S), and is normalised to 0.9. MG takes get the AK action "clack" (70-110 ms) low-passed.
import numpy as np,wave,os,sys
from scipy.signal import resample_poly, butter, sosfiltfilt
L=(sys.argv[2] if len(sys.argv)>2 else '/mnt/user-data/uploads/Prepared SFX Library')+'/'; SR=44100; OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
def load2(f):
    w=wave.open(f); n=w.getnframes(); sr=w.getframerate(); ch=w.getnchannels(); sw=w.getsampwidth(); raw=w.readframes(n)
    if sw==2: x=np.frombuffer(raw,'<i2').astype(np.float32)/32768
    elif sw==3:
        b=np.frombuffer(raw,np.uint8).reshape(-1,3); v=(b[:,0].astype(np.int32)|(b[:,1].astype(np.int32)<<8)|(b[:,2].astype(np.int32)<<16)); x=np.where(v>=1<<23,v-(1<<24),v).astype(np.float32)/(1<<23)
    else: x=np.frombuffer(raw,'<i4').astype(np.float32)/2**31
    return x.reshape(-1,ch),sr

def onsets(x,sr):
    h=int(sr*0.002); e=np.sqrt(np.convolve(x**2,np.ones(h)/h,'same'))
    pk=e.max(); out=[]; i=0; gate=0.0
    thr=pk*0.12
    while i<len(e):
        if e[i]>thr:
            j=i
            # refine to peak within 15ms
            seg=e[i:i+int(sr*0.015)]; p=i+int(seg.argmax())
            pre=e[max(0,i-int(sr*0.4)):max(1,i-int(sr*0.01))]
            out.append((p/sr,float(e[p]),float(pre.max() if len(pre) else 0)))
            i=p+int(sr*0.25)
        else: i+=1
    return out

REL=0.2
def env(m,sr,ms=0.5):
    h=max(1,int(sr*ms/1000)); return np.sqrt(np.convolve(m**2,np.ones(h)/h,'same'))
def true_start(m,sr,pk_i):
    """walk back from the peak to where the envelope is below 2% of the peak (max 20 ms), then 1 ms earlier"""
    e=env(m,sr,0.3); pk=e[pk_i]; i=pk_i; lim=pk_i-int(sr*0.02)
    while i>max(lim,1) and e[i]>0.02*pk: i-=1
    return max(0,i-int(sr*0.001))
def cut_long(m,sr,p,peak,maxs=0.8,mn=0.12):
    e=env(m,sr,3); run=e[p+int(sr*0.04)]
    for i in range(p+int(sr*0.04),min(len(m)-1,p+int(sr*maxs))):
        run=min(run*1.0008+1e-9,e[i])
        if e[i]>max(run*2.5,REL*peak) and i>p+int(sr*mn): return i-int(sr*0.004)
    return min(len(m)-1,p+int(sr*maxs))
def finish(name,seg,sr,fade_out,width,mg_dip=False):
    y=resample_poly(seg,SR,sr,axis=0).astype(np.float32)
    fi=int(SR*0.0015); y[:fi]*=(0.5-0.5*np.cos(np.linspace(0,np.pi,fi)))[:,None]          # 1.5 ms fade-in
    fo=min(len(y),int(SR*fade_out)); y[-fo:]*=(0.5+0.5*np.cos(np.linspace(0,np.pi,fo)))[:,None]
    n=int(0.08*SR); rl,rr=np.sqrt((y[:n,0]**2).mean()),np.sqrt((y[:n,1]**2).mean()); g=np.sqrt(rl*rr); y[:,0]*=g/rl; y[:,1]*=g/rr
    m=(y[:,0]+y[:,1])/2; s=(y[:,0]-y[:,1])/2*width; y=np.stack([m+s,m-s],1)
    if mg_dip:   # AK action "clack" at ~70-110 ms: low-pass that window (<1.5 kHz) with smooth crossfades
        lp=sosfiltfilt(butter(4,1500,'lp',fs=SR,output='sos'),y,axis=0); a,b=int(.070*SR),int(.110*SR); w=np.zeros(len(y)); 
        ramp=int(.012*SR); w[a:b]=1; w[a-ramp:a]=np.linspace(0,1,ramp); w[b:b+ramp]=np.linspace(1,0,ramp); y=y*(1-w)[:,None]+lp*w[:,None]
    y*=0.9/np.abs(y).max()
    o=wave.open(f'{OUT}/{name}.wav','wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR); o.writeframes((y*32767).astype('<i2').tobytes()); o.close(); return len(y)/SR
def shots(f):
    x,sr=load2(L+f); m=x.mean(1); out=[]
    for t,a,pre in onsets(m,sr):
        if pre>0.02: continue
        out.append(int(t*sr))
    return x,m,sr,out
# HG: B_24P two isolated shots, end 142 ms after the peak
n=0
x,m,sr,pk=shots('1917/B_24P.wav')
for i in pk:
    n+=1; s=true_start(m,sr,i); print('hg',n,'start %.1f ms before peak'%((i-s)/sr*1000)); finish(f'hg{n}',x[s:i+int(sr*0.142)],sr,0.06,0.25)
# SG: K_22P two shots, 0.8 s or until a strong echo
n=0
x,m,sr,pk=shots('Model 12/K_22P.wav')
for i in pk:
    n+=1; s=true_start(m,sr,i); c=cut_long(m,sr,i,float(np.abs(m[i-int(sr*.01):i+int(sr*.01)]).max())); print('sg',n,'start %.1f ms before peak'%((i-s)/sr*1000),'len %.2f'%((c-s)/sr)); finish(f'sg{n}',x[s:c],sr,min(0.12,(c-s)/sr*0.4),0.6)
# MG: C_28P four shots
n=0
x,m,sr,pk=shots('AK-47/C_28P.wav')
for i in pk:
    n+=1; s=true_start(m,sr,i); c=cut_long(m,sr,i,float(np.abs(m[i-int(sr*.01):i+int(sr*.01)]).max())); print('mg',n,'start %.1f ms before peak'%((i-s)/sr*1000),'len %.2f'%((c-s)/sr)); finish(f'mg{n}',x[s:c],sr,min(0.12,(c-s)/sr*0.4),0.6,mg_dip=True)
# SMG: G_35P burst heads
x,sr=load2(L+'Carl Gustav M45/G_35P.wav'); m=x.mean(1); e=env(m,sr,1); th=0.25*e.max(); ons=[]; i=0
while i<len(e):
    if e[i]>th: p=i+int(e[i:i+int(sr*0.01)].argmax()); ons.append(p); i=p+int(sr*0.04)
    else: i+=1
for n,k in enumerate([0,2,4,6,9,11,13,15,18],1):
    pk=ons[k]; s=true_start(m,sr,pk); c=min(ons[k+1]-int(sr*0.006),s+int(sr*0.093)); print('smg',n,'start %.1f ms before peak'%((pk-s)/sr*1000),'len %.0f ms'%((c-s)/sr*1000)); finish(f'smg{n}',x[s:c],sr,0.012,0.6)
