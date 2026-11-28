from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import sys
RAW=Image.open(sys.argv[1] if len(sys.argv)>1 else 'raw.png').convert('RGB')
FONT=sys.argv[2] if len(sys.argv)>2 else '/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf'
def grade(im):
    a=np.asarray(im).astype(np.float32)/255
    a=a+0.18*(a-0.5)*(1-np.abs(2*a-1))*2
    lum=(a*[0.299,0.587,0.114]).sum(2,keepdims=True); a=lum+(a-lum)*1.2
    a[...,0]+=0.035*lum[...,0]; a[...,2]-=0.02*lum[...,0]
    h,w=a.shape[:2]; y=np.linspace(0,1,h)[:,None]
    sky=np.clip(1-y/0.42,0,1)**1.6
    a=a*(1-0.24*sky[...,None])+np.array([0.40,0.24,0.36])*0.24*sky[...,None]
    x=np.linspace(-1,1,w)[None,:]; yy=np.linspace(-1,1,h)[:,None]
    a=a*(1-0.26*np.clip((x**2*0.8+yy**2)-0.25,0,1.5))[...,None]
    return Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.3,percent=55,threshold=2))
def shade(im, where):
    w,h=im.size; a=np.asarray(im).astype(np.float32)
    yy,xx=np.mgrid[0:h,0:w]; X=xx/w; Y=yy/h
    if where=='bl': d=np.sqrt((X/1.15)**2+((1-Y)/0.85)**2); m=np.clip(1-(d-0.0)/0.64,0,1)**1.2*0.88
    elif where=='bottom': m=np.clip((Y-0.55)/0.45,0,1)**1.2*0.9
    else: m=np.clip(1-Y/0.42,0,1)**1.5*0.62
    a=a*(1-m[...,None])+np.array([10,15,22])*m[...,None]
    return Image.fromarray(a.astype(np.uint8))
def title(im, x, y, size, lines=('ZOMBIE','PARKOUR','ESCAPE'), align='left'):
    d=ImageDraw.Draw(im); f=ImageFont.truetype(FONT,size)
    sh=Image.new('RGBA',im.size,(0,0,0,0)); ds=ImageDraw.Draw(sh)
    ys=[]; cy=y
    for t in lines:
        bb=d.textbbox((0,0),t,font=f); w=bb[2]-bb[0]; ys.append((t,cy,w,bb)); cy+=int(size*0.92)
    for t,cy,w,bb in ys:
        tx = x if align=='left' else x-w//2
        ds.text((tx,cy+size*0.04),t,font=f,fill=(0,0,0,170))
    sh=sh.filter(ImageFilter.GaussianBlur(size*0.12)); im.paste(sh,(0,0),sh)
    for i,(t,cy,w,bb) in enumerate(ys):
        tx = x if align=='left' else x-w//2
        d.text((tx,cy),t,font=f,fill=(255,159,112) if t=='ESCAPE' else (255,255,255))
    return im
# Landscape 1920x1080: full frame, title bottom left
L=grade(RAW.resize((1920,1080),Image.LANCZOS)); L=shade(L,'bl'); L=title(L,84,650,124)
L.save('cover-landscape-1920x1080.jpg',quality=90)
# Square 800x800: crop around the chase, title top left over the sky
S=grade(RAW.crop((760,0,2560,1800)).resize((800,800),Image.LANCZOS)); S=shade(S,'top'); S=title(S,40,34,70)
S.save('cover-square-800x800.jpg',quality=90)
# Portrait 800x1200: lead zombie and runner, title top centre
P=grade(RAW.crop((1040,0,2240,1800)).resize((800,1200),Image.LANCZOS)); P=shade(P,'bottom'); P=title(P,400,880,98,align='center')
P.save('cover-portrait-800x1200.jpg',quality=90)
for n,im in [('L',L),('S',S),('P',P)]: print(n,im.size)
