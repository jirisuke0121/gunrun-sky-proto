#!/bin/bash
# final.sh <outdir-tag> "<shots>" [engine args]  -> out/<tag>/<shot>/f*.jpg + audio.wav + log.json, then <shot>.mp4
cd /home/claude/video; tag=$1; shots=$2; shift 2
curl -s -o /dev/null http://127.0.0.1:8899/ || (cd /home/claude/gunrun-sky-proto && python3 -m http.server 8899 --bind 127.0.0.1 >/tmp/static8899.log 2>&1 &)
sleep 1; mkdir -p out/$tag
for s in $shots; do
  for try in 1 2; do timeout 3000 node engine.cjs $s OUT=/home/claude/video/out/$tag/$s "$@" > out/$tag/$s.log 2>&1 && break; echo "retry $s" >> out/$tag/status.txt; done
  tail -1 out/$tag/$s.log >> out/$tag/status.txt
done
echo ALLDONE >> out/$tag/status.txt
