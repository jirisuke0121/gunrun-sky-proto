#!/bin/bash
# final2.sh <outdir-tag> "<shot[:frames] ...>" [engine args]
#   -> out2/<tag>/<shot>/f*.jpg (+ audio.wav, log.json). frames = number of 30 fps frames to keep (default: the shot's own).
cd /home/claude/video; tag=$1; shots=$2; shift 2
curl -s -o /dev/null http://127.0.0.1:8899/ || (cd /home/claude/gunrun-sky-proto && nohup python3 -m http.server 8899 --bind 127.0.0.1 >/tmp/static8899.log 2>&1 &)
sleep 1; mkdir -p out2/$tag
for item in $shots; do
  s=${item%%:*}; n=""; [[ "$item" == *:* ]] && n="FRAMES=${item##*:}"
  for try in 1 2; do timeout 3600 node engine.cjs $s OUT=/home/claude/video/out2/$tag/$s $n "$@" > out2/$tag/$s.log 2>&1 && break; echo "retry $s" >> out2/$tag/status.txt; done
  tail -1 out2/$tag/$s.log >> out2/$tag/status.txt
done
echo ALLDONE >> out2/$tag/status.txt
