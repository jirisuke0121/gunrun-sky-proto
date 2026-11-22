#!/usr/bin/env python3
"""tools/jump-snags.cjs の出力を仕分ける。  python3 tools/jump-snags.py 跳ぶ検査.json [走る検査.json] [表示する数]
空中で横の速さが半分未満に落ちた（当たった）走行を、当たった物ごとに数える。縁・はしご・壁走りなどの技に移った回は外す。
走る検査（tools/run-snags.cjs の出力）を渡すと、「跳ばずに走ったときは止まらなかった点・向き」だけを数える。出発点の番号 i が同じ点どうしを突き合わせる。
当たった物を、床から見て次の3つに分ける：
  overhang … 物の下面が床から0.9 m以上上（梁・ひさし・張り出し）。走れば下をくぐれるのに、跳ぶと頭が当たる。これが探しているもの。
  wall     … 床から立ち上がる物（壁・箱）。跳んだ先に壁があっただけ。
  other    … 物が見つからない（段差・斜面）。"""
import json, sys, collections

J = json.load(open(sys.argv[1]))
R = json.load(open(sys.argv[2])) if len(sys.argv) > 2 and sys.argv[2].endswith('.json') else None
top = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 40
boxes, DIRS = J.get('boxes') or (R or {}).get('boxes'), J['DIRS']
run = {rec['i']: rec['r'] for rec in R['res']} if R else None

def free_run(i, k):
    if run is None:
        return True
    r = run.get(i)
    if not r:
        return False
    sx, sy, sz, sg, ex, ey, ez = r[k][:7]
    d = DIRS[k]
    return sg and (ex - sx) * d[0] + (ez - sz) * d[1] >= 2.8 and abs(ey - sy) < .25

cell = 4
grid = collections.defaultdict(list)
for n, b in enumerate(boxes):
    if b['x1'] - b['x0'] > 300:
        continue
    for gx in range(int(b['x0'] // cell), int(b['x1'] // cell) + 1):
        for gz in range(int(b['z0'] // cell), int(b['z1'] // cell) + 1):
            grid[(gx, gz)].append(n)

def box_ahead(x, y, z, d):
    best = None
    for t in (.2, .35, .5, .7):
        for side in (-.2, 0, .2):
            qx, qz = x + d[0] * t - d[1] * side, z + d[1] * t + d[0] * side
            for n in grid[(int(qx // cell), int(qz // cell))]:
                b = boxes[n]
                if b['x0'] <= qx <= b['x1'] and b['z0'] <= qz <= b['z1'] and b['y0'] < y + 1.8 and b['y1'] > y + .1:
                    if best is None or b['y1'] > boxes[best]['y1']:
                        best = n
        if best is not None:
            return best
    return None

total = free = bumped = 0
kinds = collections.Counter()
per = collections.defaultdict(lambda: {'n': 0, 'ex': None, 'hy': []})
for rec in J['res']:
    for k, r in enumerate(rec['r']):
        sx, sy, sz, sg = r[:4]
        if not sg or abs(sy - rec['n'][1]) > .3:
            continue
        total += 1
        if not free_run(rec['i'], k):
            continue
        free += 1
        bump = r[9]
        if not bump or bump[5] != 'normal':
            continue
        bumped += 1
        x, y, z = bump[:3]
        n = box_ahead(x, y, z, DIRS[k])
        key = n if n is not None else -1
        kind = 'other' if n is None else 'overhang' if boxes[n]['y0'] > sy + .9 else 'wall'
        kinds[kind] += 1
        if kind != 'overhang' and key != -1:
            continue
        p = per[key]
        p['n'] += 1
        p['hy'].append(round(y - sy, 1))
        if p['ex'] is None:
            p['ex'] = (round(sx, 1), round(sy, 1), round(sz, 1), DIRS[k], bump)
print(f'跳んだ走行 {total} / 跳ばずに自由に走れた点・向き {free} / そのうち空中で当たった {bumped} ({100 * bumped / max(free, 1):.1f}%)')
print('当たった物の種類', dict(kinds))
for key, p in sorted(per.items(), key=lambda kv: -kv[1]['n'])[:top]:
    b = boxes[key] if key >= 0 else None
    desc = (b['t'], b['tint'] and '%06x' % b['tint'], [round(b[c], 2) for c in ('x0', 'y0', 'z0', 'x1', 'y1', 'z1')]) if b else '(物が見つからない)'
    print(p['n'], desc, '当たった高さ(跳ぶ前の床から)', sorted(set(p['hy']))[:4], '例', p['ex'])
