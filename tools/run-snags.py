#!/usr/bin/env python3
"""tools/run-snags.cjs の出力を仕分ける。  python3 tools/run-snags.py 出力.json [表示する数]
free=4.7 mのうち2.8 m以上進んだ / edge=縁で止まった（歩いては降りられない。意図どおり）/ wall=壁 /
low=腰より低い物（上面が床から1.25 m以下）/ post=進む向きに対して幅0.8 m以下で、向こうに同じ高さの床が続く物。
low と post を物ごとに数えて、多い順に出す（数字は止められた走行の本数。末尾は最初の例の出発点と向き）。
斜めに当たった薄い壁の端も post に入るので、最後は場所ごとに目で確かめる。"""
import json,sys,collections,math
D=json.load(open(sys.argv[1])); DIRS=D['DIRS']; boxes=D['boxes']
cell=4; grid=collections.defaultdict(list)
for i,b in enumerate(boxes):
    if b['x1']-b['x0']>300: continue
    for gx in range(int(b['x0']//cell),int(b['x1']//cell)+1):
        for gz in range(int(b['z0']//cell),int(b['z1']//cell)+1): grid[(gx,gz)].append(i)
def at(x,z,m=0.0):
    return [i for i in grid[(int(x//cell),int(z//cell))] if boxes[i]['x0']-m<=x<=boxes[i]['x1']+m and boxes[i]['z0']-m<=z<=boxes[i]['z1']+m]
def stand(x,z):
    L=[boxes[i] for i in at(x,z)]; out=[]
    for b in L:
        t=b['y1']
        if not any(o['y0']<t+1.7 and o['y1']>t+0.05 for o in L): out.append(t)
    return out
cats=collections.Counter(); per=collections.defaultdict(lambda:{'n':0,'cat':collections.Counter(),'ex':[]})
total=0
for rec in D['res']:
    n=rec['n']
    for d,r in zip(DIRS,rec['r']):
        sx,sy,sz,sg,ex,ey,ez,minY,maxY,sp,state,gr=r
        if not sg or abs(sy-n[1])>0.3: cats['badstart']+=1; continue
        total+=1
        along=(ex-sx)*d[0]+(ez-sz)*d[1]
        if along>=2.8: cats['free']+=1; continue
        if abs(ey-sy)>0.25 or not gr: cats['height-change']+=1; continue
        # blockers ahead
        hit=set()
        for t in (0.3,0.4,0.5,0.6,0.75):
            for side in (-0.2,0,0.2):
                qx=ex+d[0]*t-d[1]*side; qz=ez+d[1]*t+d[0]*side
                for i in at(qx,qz):
                    b=boxes[i]
                    if b['y0']<ey+1.7 and b['y1']>ey+0.3: hit.add(i)
            if hit: break
        if not hit: cats['edge']+=1; continue
        i=max(hit,key=lambda i:boxes[i]['y1']); b=boxes[i]
        w,dd=b['x1']-b['x0'],b['z1']-b['z0']
        perp=dd if abs(d[0])>abs(d[1])*1.5 else w if abs(d[1])>abs(d[0])*1.5 else min(w,dd)
        depth=w if abs(d[0])>abs(d[1])*1.5 else dd if abs(d[1])>abs(d[0])*1.5 else max(w,dd)
        habove=max(boxes[j]['y1'] for j in hit)-ey
        beyond=any(abs(f-ey)<=0.3 for t in (1.2,1.6,2.0,2.5,3.0) for f in stand(ex+d[0]*t,ez+d[1]*t))
        cat='low' if habove<=1.25 else 'post' if (perp<=0.8 and beyond) else 'wall'
        cats[cat+('+floor beyond' if beyond and cat!='post' else '')]+=1
        if cat!='wall':
            p=per[i]; p['n']+=1; p['cat'][cat+('B' if beyond else '')]+=1
            if len(p['ex'])<2: p['ex'].append((round(sx,1),round(sy,1),round(sz,1),d))
print('runs',total,dict(cats))
rows=sorted(per.items(),key=lambda kv:-kv[1]['n'])
print(len(rows),'small blockers')
for i,p in rows[:int(sys.argv[2]) if len(sys.argv)>2 else 60]:
    b=boxes[i]
    print(p['n'],dict(p['cat']),b['t'],b['tint'] and '%06x'%b['tint'],[round(b[k],2) for k in('x0','y0','z0','x1','y1','z1')],p['ex'][0])
