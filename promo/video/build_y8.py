#!/usr/bin/env python3
# Y8 gameplay video: the player's own camera, English HUD, real speed, hard cuts only (no slow motion, shake, text or title).
import subprocess, os, json
R = '/home/claude/video'; SRC = R + '/out8'; OUT = R + '/final8'; os.makedirs(OUT, exist_ok=True)
# take, first frame, number of frames (30 fps)
EDL = [('beam', 40, 50), ('dive', 0, 60), ('blast', 8, 100), ('gun', 0, 80), ('decoy', 0, 190), ('tunnel', 0, 150)]
segs = []
for k, (n, a, m) in enumerate(EDL):
    o = f'{OUT}/seg{k}.mp4'; t = o + '.tmp.mp4'
    au = f'{SRC}/{n}/audio.wav'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-start_number', str(a), '-i', f'{SRC}/{n}/f%05d.jpg']
    cmd += ['-ss', f'{a/30:.4f}', '-t', f'{m/30:.4f}', '-i', au] if os.path.exists(au) else ['-f', 'lavfi', '-t', f'{m/30:.4f}', '-i', 'anullsrc=r=48000:cl=stereo']
    cmd += ['-frames:v', str(m), '-vf', 'scale=1280:720,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', '30',
            '-af', f'afade=t=in:d=0.03,afade=t=out:st={m/30-0.05:.3f}:d=0.05,aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', t]
    subprocess.run(cmd, check=True); os.replace(t, o); segs.append(o)
lst = f'{OUT}/list.txt'; open(lst, 'w').write(''.join(f"file '{s}'\n" for s in segs))
raw = f'{OUT}/raw.mp4'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', raw], check=True)
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw], capture_output=True, text=True).stdout)
# music bed (CC0 "Determined Pursuit", Tozan) under the game sound, faded out at the end; loudness to -16 LUFS
fin = f'{OUT}/Zombie-Parkour-Escape-Y8-gameplay-en-v2.mp4'; t = fin + '.tmp.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-ss', '12', '-i', R + '/music/determined_pursuit_loop.wav', '-filter_complex',
    f'[1:a]volume=0.22,afade=t=in:d=0.4,afade=t=out:st={dur-1.5:.2f}:d=1.5,atrim=0:{dur:.3f}[m];[0:a]volume=1.6[g];[g][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', t], check=True)
os.replace(t, fin); print('wrote', fin, round(dur, 2))
