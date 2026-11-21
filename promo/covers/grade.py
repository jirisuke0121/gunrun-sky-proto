import sys
from PIL import Image, ImageFilter
import numpy as np
src,out=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB').resize((1920,1080),Image.LANCZOS)
a=np.asarray(im).astype(np.float32)/255
a=a+0.18*(a-0.5)*(1-np.abs(2*a-1))*2                     # gentle S-curve
lum=(a*[0.299,0.587,0.114]).sum(2,keepdims=True); a=lum+(a-lum)*1.2   # saturation
a[...,0]+=0.035*lum[...,0]; a[...,2]-=0.02*lum[...,0]                 # warm highlights
h,w=a.shape[:2]; y=np.linspace(0,1,h)[:,None]
sky=np.clip(1-y/0.42,0,1)**1.6                                        # deeper rose at the top of the sky
a=a*(1-0.24*sky[...,None])+np.array([0.40,0.24,0.36])*0.24*sky[...,None]
x=np.linspace(-1,1,w)[None,:]; yy=np.linspace(-1,1,h)[:,None]
v=1-0.26*np.clip((x**2*0.8+yy**2)-0.25,0,1.5); a=a*v[...,None]      # vignette
im=Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.4,percent=55,threshold=2))
im.save(out+'.png'); im.save(out+'.webp',quality=80,method=6); im.resize((960,540),Image.LANCZOS).save(out+'-preview.jpg',quality=85)
