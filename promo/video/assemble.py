#!/usr/bin/env python3
# Build one version from captured frame sequences. usage: assemble.py <version>   (yt_ja | yt_en | cg_land | cg_port)
import sys, subprocess, os, json
V=sys.argv[1]; A='/home/claude/video/assets'; OUT='/home/claude/video/final'; os.makedirs(OUT,exist_ok=True)
FPS=60; BEAT=0.375
port = V=='cg_port'; W,H=(1080,1620) if port else (1920,1080); SRC='/home/claude/video/out/'+('P' if port else 'L')
lang={'yt_ja':'ja','yt_en':'en'}.get(V)
# (kind, name, start frame, beats)
if lang:
    EDL=[('still','hero',0,3),('shot','open',0,5),('shot','chase',4,4),('shot','chase_g',92,4),
         ('shot','wallrun',30,3),('shot','dive',0,3),('shot','swing',50,4),('shot','zip',34,3),('shot','hook',8,3),('shot','blast',42,3),('shot','tunnel',30,5),
         ('shot','gun_c',0,8),('shot','vista',10,12),('shot','ramp',4,4),('shot','leap',6,4),('end','hero',0,12)]
else:
    EDL=[('still','cover',0,2),('shot','open',0,5),('shot','chase',4,4),('shot','wallrun',30,3),('shot','dive',0,3),('shot','swing',50,4),('shot','zip',34,3),('shot','hook',8,3),
         ('shot','blast',42,3),('shot','tunnel',30,5),('shot','gun_c',20,5),('shot','vista',10,5),('shot','ramp',4,3),('shot','leap',6,4)]
OVR=json.loads(os.environ.get('EDL_START','{}'))   # {"swing":56,...} start-frame overrides
# integer frame counts that sum exactly
clips=[]; acc=0.0; done=0
for kind,name,start,beats in EDL:
    acc+=beats*BEAT*FPS; n=round(acc)-done; clips.append(dict(kind=kind,name=name,start=OVR.get(name,start),n=n,t0=done/FPS,dur=n/FPS)); done+=n
total=done/FPS
ins=[]; fc=[]; lab=[]
def add(args): ins.append(args); return len(ins)-1
for k,c in enumerate(clips):
    if c['kind']=='shot':
        i=add(['-framerate',str(FPS),'-start_number',str(c['start']),'-t',f"{c['dur']:.6f}",'-i',f"{('/home/claude/video/out/J' if lang=='ja' and os.path.isdir('/home/claude/video/out/J/'+c['name']) else SRC)}/{c['name']}/f%05d.jpg"])
        fc.append(f"[{i}:v]scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v{k}]")
    else:
        img=f"{A}/{'cover_port' if port else ('cover_land' if c['name']=='cover' else 'hero_big')}.png"
        i=add(['-i',img]); z0,z1=(1.0,1.05) if c['kind']=='still' else (1.06,1.0)
        zp=f"zoompan=z='{z0}+({z1}-{z0})*on/{c['n']}':x='iw/2-(iw/zoom/2)+iw*0.02*on/{c['n']}':y='ih/2-(ih/zoom/2)':d={c['n']}:s={W}x{H}:fps={FPS}"
        extra=",fade=t=in:st=0:d=0.22:color=white" if c['kind']=='end' else ''
        fc.append(f"[{i}:v]scale={W*2}:{H*2}:flags=lanczos,{zp},setsar=1,format=yuv420p,trim=end_frame={c['n']}{extra},setpts=PTS-STARTPTS[v{k}]")
    lab.append(f"[v{k}]")
fc.append(''.join(lab)+f"concat=n={len(clips)}:v=1:a=0[base]")
cur='base'; ov=0
def overlay(png,t0,t1,fade=0.15):
    global cur,ov
    i=add(['-i',png]); d=t1-t0
    fc.append(f"[{i}:v]format=rgba,loop=loop=-1:size=1:start=0,trim=duration={d:.3f},fps={FPS},fade=t=in:st=0:d={fade}:alpha=1,fade=t=out:st={d-fade:.3f}:d={fade}:alpha=1,setpts=PTS-STARTPTS+{t0:.3f}/TB[o{ov}]")
    fc.append(f"[{cur}][o{ov}]overlay=0:0:eof_action=pass:enable='between(t,{t0:.3f},{t1:.3f})'[b{ov}]"); cur=f"b{ov}"; ov+=1
if lang:
    T={c['name']+('_end' if c['kind']=='end' else ''):c for c in clips}
    overlay(f"{A}/c1_{lang}.png",0.25,2.85); overlay(f"{A}/c2_{lang}.png",3.15,5.85)
    for n in ['wallrun','dive','swing','zip','hook','blast','tunnel']: c=T[n]; overlay(f"{A}/l_{n}_{lang}.png",c['t0']+0.06,c['t0']+c['dur']-0.06,0.1)
    overlay(f"{A}/c4_{lang}.png",T['gun_c']['t0']+0.15,T['gun_c']['t0']+T['gun_c']['dur']-0.15)
    overlay(f"{A}/c5_{lang}.png",T['vista']['t0']+0.5,T['vista']['t0']+T['vista']['dur']-0.3,0.3)
    overlay(f"{A}/c6_{lang}.png",T['ramp']['t0']+0.1,T['leap']['t0']+T['leap']['dur']-0.45)
    e=T['hero_end']; overlay(f"{A}/end_{lang}.png",e['t0']+0.3,total,0.35)
vid=f"{OUT}/{V}_video.mp4"; tmp=vid.replace('.mp4','.tmp.mp4')
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y']+sum(ins,[])+['-filter_complex',';'.join(fc),'-map',f'[{cur}]','-r',str(FPS),'-t',f'{total:.6f}','-c:v','libx264','-preset','slow','-crf',os.environ.get('CRF','17'),'-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart','-an',tmp]
print(V,'clips',len(clips),'total',total); subprocess.run(cmd,check=True); os.replace(tmp,vid)
json.dump(clips,open(f"{OUT}/{V}_clips.json",'w'))
