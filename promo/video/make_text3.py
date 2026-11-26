# Captions, move labels and title cards as transparent 1920x1080 (or WxH) PNGs.
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT='/home/claude/video/assets3'; os.makedirs(OUT,exist_ok=True)
EN='/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf'; ENB='/usr/share/fonts/opentype/inter/InterDisplay-BoldItalic.otf'
JA='/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'; JAB='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
WHITE=(255,255,255,255); ORANGE=(255,159,112,255); INK=(10,15,22)
def font(lang,size,bold=False):
    return ImageFont.truetype((ENB if bold else EN),size) if lang=='en' else ImageFont.truetype((JAB if bold else JA),size,index=0)
def line_img(lang,segs,size,bold=False,track=0):
    f=font(lang,size,bold); d=ImageDraw.Draw(Image.new('RGBA',(8,8)))
    w=sum(d.textlength(t,font=f)+track*len(t) for t,_ in segs); asc,desc=f.getmetrics(); pad=int(size*.5)
    im=Image.new('RGBA',(int(w)+pad*2,asc+desc+pad*2),(0,0,0,0)); d=ImageDraw.Draw(im); x=pad
    for t,c in segs:
        if track:
            for ch in t: d.text((x,pad),ch,font=f,fill=c); x+=d.textlength(ch,font=f)+track
        else: d.text((x,pad),t,font=f,fill=c); x+=d.textlength(t,font=f)
    if lang=='ja':  # shear to match the italic Latin title
        sh=.16; im=im.transform((im.width+int(im.height*sh),im.height),Image.AFFINE,(1,sh,-im.height*sh*0+0,0,1,0),resample=Image.BICUBIC)
        im=im.transform(im.size,Image.AFFINE,(1,0,-int(im.height*sh),0,1,0))
    return im,pad
def compose(W,H,items,name,shade=None):
    """items: list of (line image, pad, x, y_baseline_top) ; x<0 means centred at -x"""
    base=Image.new('RGBA',(W,H),(0,0,0,0))
    if shade=='bl':
        import numpy as np
        yy,xx=np.mgrid[0:H,0:W]; d=np.sqrt((xx/W/1.0)**2+((H-yy)/H/0.62)**2); m=np.clip(1-d/0.7,0,1)**1.3*150
        base=Image.fromarray(np.dstack([np.full((H,W),INK[0]),np.full((H,W),INK[1]),np.full((H,W),INK[2]),m]).astype('uint8'),'RGBA')
    if shade=='full':
        import numpy as np
        yy,xx=np.mgrid[0:H,0:W]; d=np.sqrt((xx/W/1.15)**2+((H-yy)/H/0.95)**2); m=np.clip(1-d/0.78,0,1)**1.1*225+35
        base=Image.fromarray(np.dstack([np.full((H,W),INK[0]),np.full((H,W),INK[1]),np.full((H,W),INK[2]),np.clip(m,0,255)]).astype('uint8'),'RGBA')
    text=Image.new('RGBA',(W,H),(0,0,0,0))
    for im,pad,x,y in items:
        px=(-x-im.width//2) if x<0 else x-pad
        text.alpha_composite(im,(int(px),int(y-pad)))
    a=text.split()[3]; sh=Image.new('RGBA',(W,H),(0,0,0,0)); sh.putalpha(a.filter(ImageFilter.GaussianBlur(14)).point(lambda v:min(255,int(v*1.25))))
    sh2=Image.new('RGBA',(W,H),(0,0,0,0)); sh2.putalpha(a.filter(ImageFilter.GaussianBlur(3)).point(lambda v:min(255,int(v*.9))))
    out=base; out.alpha_composite(sh,(0,8)); out.alpha_composite(sh2,(0,4)); out.alpha_composite(text)
    out.save(f'{OUT}/{name}.png'); return out
def caption(lang,name,lines,W=1920,H=1080,size=None,x=96,bottom=None,gap=1.16):
    size=size or (86 if lang=='en' else 84); bottom=bottom or H-190; items=[]; y=bottom-len(lines)*size*gap
    for segs in lines:
        im,pad=line_img(lang,segs,size); items.append((im,pad,x,y)); y+=size*gap
    compose(W,H,items,name,'bl')
def label(lang,name,text,W=1920,H=1080):
    size=58 if lang=='en' else 56; im,pad=line_img(lang,[(text,WHITE)],size,track=2 if lang=='en' else 4)
    bar=Image.new('RGBA',(14,size+8),ORANGE); barp=Image.new('RGBA',(14+2*8,size+8+2*8),(0,0,0,0)); barp.paste(bar,(8,8))
    y=H-250; compose(W,H,[(barp,8,96,y+ (10 if lang=='en' else 16)),(im,pad,96+34,y)],name,'bl')

CAP={'c1':[[('2分間、',ORANGE)],[('街じゅうを逃げ回れ。',WHITE)]],
     'c2':[[('高台から、',WHITE)],[('撃ち落とせ。',ORANGE)]],
     'c3':[[('残り',WHITE),('5秒',ORANGE),('。',WHITE)]]}
LAB={'flash':'閃光玉','blast':'爆破ジャンプ','decoy':'分身','zip':'ジップライン','rescue':'救済','chain':'ロープ連続スイング'}
for k,v in CAP.items(): caption('ja',f'{k}_ja',v)
for k,v in {'k1':[[('ゾンビから',WHITE),('2分間',ORANGE),('、',WHITE)],[('逃げ切れ。',WHITE)]],'k3':[[('振り切れ。',WHITE)]]}.items(): caption('ja',f'{k}_ja',v)
for k,v in LAB.items(): label('ja',f'l_{k}_ja',v)
W,H=1920,1080
j1,q1=line_img('ja',[('空中回廊 ',WHITE),('追跡',ORANGE)],150); j2,q2=line_img('en',[('ZOMBIE PARKOUR ESCAPE',WHITE)],58,track=3)
jc,qc=line_img('ja',[('ブラウザで無料プレイ',WHITE)],52,bold=True,track=6)
compose(W,H,[(j1,q1,96,560),(j2,q2,104,560+205),(jc,qc,100,560+205+110)],'end_ja','full')
# timer digits / small labels for the map panel
for name,txt,size,col in [('t_label','残り時間',30,WHITE)]:
    im,pad=line_img('ja',[(txt,col)],size,bold=True,track=2); im.save(f'{OUT}/{name}.png')
print('ok')
