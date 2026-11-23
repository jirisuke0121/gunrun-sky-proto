#!/usr/bin/env python3
# Sound for a YouTube/X version: the game's own sound per clip (captured with the frames) + CC0 music, then mux.
import sys, json, subprocess, os
V=sys.argv[1]; OUT='/home/claude/video/final'; SRC='/home/claude/video/out/L'; M='/home/claude/video/music/determined_pursuit_loop.wav'
clips=json.load(open(f'{OUT}/{V}_clips.json')); total=sum(c['dur'] for c in clips)
ins=[]; fc=[]; labs=[]
for k,c in enumerate(clips):
    if c['kind']=='shot':
        ins+=['-ss',f"{c['start']/60:.4f}",'-t',f"{c['dur']:.4f}",'-i',f"{SRC}/{c['name']}/audio.wav"]; i=len(ins)//6-1+0
        fc.append(f"[{k}:a]aresample=48000,apad=whole_dur={c['dur']:.4f},atrim=duration={c['dur']:.4f},afade=t=in:st=0:d=0.012,afade=t=out:st={c['dur']-0.03:.4f}:d=0.03[s{k}]")
    else:
        ins+=['-f','lavfi','-t',f"{c['dur']:.4f}",'-i','anullsrc=r=48000:cl=stereo']
        fc.append(f"[{k}:a]atrim=duration={c['dur']:.4f}[s{k}]")
    labs.append(f"[s{k}]")
n=len(clips)
fc.append(''.join(labs)+f"concat=n={n}:v=0:a=1,volume={os.environ.get('SFX','1.5')}[sfx]")
# music map: video 0-6 <- 12-18 (intro), 6-18 <- 18-30 (main), 18-24 <- 54-60 (break), 24-30 <- 72-78 (main)
segs=[(12,6),(18,12),(54,6),(72,6.4)]; ml=[]
for j,(a,d) in enumerate(segs):
    ins+=['-ss',str(a-0.02),'-t',str(d+0.04),'-i',M]
    fc.append(f"[{n+j}:a]aresample=48000,afade=t=in:st=0:d=0.02,afade=t=out:st={d+0.02:.3f}:d=0.02,atrim=start=0.02:duration={d:.3f},asetpts=PTS-STARTPTS[m{j}]"); ml.append(f"[m{j}]")
fc.append(''.join(ml)+f"concat=n={len(segs)}:v=0:a=1,atrim=duration={total:.4f},volume={os.environ.get('MUS','0.5')},afade=t=out:st={total-1.6:.3f}:d=1.6[mus]")
fc.append(f"[sfx][mus]amix=inputs=2:normalize=0,alimiter=limit=0.89:level=false,loudnorm=I=-15:TP=-1.5:LRA=11[a]")
wav=f'{OUT}/{V}_audio.wav'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+ins+['-filter_complex',';'.join(fc),'-map','[a]','-ar','48000','-t',f'{total:.4f}',wav],check=True)
tmp=f'{OUT}/{V}.tmp.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',f'{OUT}/{V}_video.mp4','-i',wav,'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','256k','-movflags','+faststart','-shortest',tmp],check=True)
os.replace(tmp,f'{OUT}/{V}.mp4'); print('done',V,total)
