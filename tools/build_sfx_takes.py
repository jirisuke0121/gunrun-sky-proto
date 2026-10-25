# FAITHFUL version: rebuilds assets/sfx/*.wav from "The Free Firearm Sound Library" (CC0; the "Prepared SFX Library" folder).
# Usage: python3 tools/build_sfx_takes.py OUTDIR [LIBRARY_DIR]   then   python3 tools/audit_sfx.py OUTDIR   then copy into assets/sfx.
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


SECS=1.2   # length of the long takes (natural room tail kept, faded over the last 0.3 s)
def env(m,sr,ms=0.5):
    h=max(1,int(sr*ms/1000)); return np.sqrt(np.convolve(m**2,np.ones(h)/h,'same'))
def true_start(m,sr,pk_i):
    """walk back from the peak to where the envelope is below 2% of the peak (max 20 ms), then 1 ms earlier"""
    e=env(m,sr,0.3); pk=e[pk_i]; i=pk_i; lim=pk_i-int(sr*0.02)
    while i>max(lim,1) and e[i]>0.02*pk: i-=1
    return max(0,i-int(sr*0.001))
def finish(name,seg,sr,fade_out):
    """resample to 44.1 kHz, 1.5 ms fade-in, cosine fade-out, normalise to 0.9. Stereo image and tone are left as recorded."""
    y=resample_poly(seg,SR,sr,axis=0).astype(np.float32)
    fi=int(SR*0.0015); y[:fi]*=(0.5-0.5*np.cos(np.linspace(0,np.pi,fi)))[:,None]
    fo=min(len(y),int(SR*fade_out)); y[-fo:]*=(0.5+0.5*np.cos(np.linspace(0,np.pi,fo)))[:,None]
    y*=0.9/np.abs(y).max()
    o=wave.open(f'{OUT}/{name}.wav','wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR); o.writeframes((y*32767).astype('<i2').tobytes()); o.close(); return len(y)/SR
def isolated(f):
    x,sr=load2(L+f); m=x.mean(1); return x,m,sr,[int(t*sr) for t,a,pre in onsets(m,sr) if pre<=0.02]
def burst(f):
    x,sr=load2(L+f); m=x.mean(1); e=env(m,sr,1); th=0.25*e.max(); ons=[]; i=0
    while i<len(e):
        if e[i]>th: p=i+int(e[i:i+int(sr*0.01)].argmax()); ons.append(p); i=p+int(sr*0.04)
        else: i+=1
    return x,m,sr,ons
def long_take(name,x,m,sr,pk,secs=SECS):
    s=true_start(m,sr,pk); return finish(name,x[s:s+int(sr*secs)],sr,0.3)
def head_take(name,x,m,sr,ons,k):
    pk=ons[k]; s=true_start(m,sr,pk); c=min(ons[k+1]-int(sr*0.006),s+int(sr*0.093)) if k+1<len(ons) else s+int(sr*0.093)
    return finish(name,x[s:c],sr,0.012)
# HG: Springfield 1917 B_16P (mid distance) -- the file the user compared and preferred; 2 isolated shots, long
x,m,sr,pks=isolated('1917/B_16P.wav')
for n,pk in enumerate(pks,1): print('hg',n,'%.2fs'%long_take(f'hg{n}',x,m,sr,pk))
# SG: Model 12, K_22P (near) + K_17P (mid): 4 long takes
n=0
for f in ['Model 12/K_22P.wav','Model 12/K_17P.wav']:
    x,m,sr,pks=isolated(f)
    for pk in pks: n+=1; print('sg',n,'%.2fs'%long_take(f'sg{n}',x,m,sr,pk))
# MG: AK-47 C_28P: 4 long takes; heads from the C_27P long burst (cut before the next shot)
x,m,sr,pks=isolated('AK-47/C_28P.wav')
for n,pk in enumerate(pks,1): print('mg',n,'%.2fs'%long_take(f'mg{n}',x,m,sr,pk))
x,m,sr,ons=burst('AK-47/C_27P.wav')
for n,k in enumerate([0,2,4,6,8,10],1): print('mgh',n,'%.3fs'%head_take(f'mgh{n}',x,m,sr,ons,k))
# SMG: Carl Gustav G_35P: heads of the burst; the last shot of each burst keeps its natural tail
x,m,sr,ons=burst('Carl Gustav M45/G_35P.wav')
for n,k in enumerate([0,2,4,6,9,11,13,15,18],1): print('smgh',n,'%.3fs'%head_take(f'smgh{n}',x,m,sr,ons,k))
last=[8,len(ons)-1]
for n,k in enumerate(last,1): print('smgl',n,'%.2fs'%long_take(f'smgl{n}',x,m,sr,ons[k]))
