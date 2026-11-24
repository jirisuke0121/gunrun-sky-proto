#!/bin/bash
# resume.sh <tag> "<shot[:frames] ...>" [engine args] : like final2.sh, but skips shots already finished (log.json written
# at the end) and makes sure the local server is up before each shot, so it can be restarted after the box restarts.
cd /home/claude/video; tag=$1; shots=$2; shift 2; mkdir -p out4/$tag
for item in $shots; do
  s=${item%%:*}; n=""; [[ "$item" == *:* ]] && n="FRAMES=${item##*:}"
  [ -f out4/$tag/$s/log.json ] && continue
  curl -s -o /dev/null http://127.0.0.1:8899/ || (cd /home/claude/gunrun-sky-proto && nohup python3 -m http.server 8899 --bind 127.0.0.1 >/tmp/static8899.log 2>&1 &); sleep 1
  rm -rf out4/$tag/$s
  timeout 3600 node engine.cjs $s OUT=/home/claude/video/out4/$tag/$s $n "$@" > out4/$tag/$s.log 2>&1
  echo "$s $(tail -1 out4/$tag/$s.log)" >> out4/$tag/status.txt
done
echo ALLDONE >> out4/$tag/status.txt
