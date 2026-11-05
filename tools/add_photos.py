#!/usr/bin/env python3
"""Add photos to assets/photos with a near-duplicate check (phash).
usage: python3 tools/add_photos.py new1.jpg new2.jpg ...   (--force to add near-dupes anyway)
After adding, append the new IMG_#### names into the PHOTOS array in grimos.js (keep a fixed mixed order)."""
import sys,glob,os,imagehash
from PIL import Image,ImageOps
TH=12  # phash distance <=12 = likely same shot
D='assets/photos'
force='--force' in sys.argv; new=[a for a in sys.argv[1:] if a!='--force']
have={f:imagehash.phash(Image.open(f)) for f in glob.glob(D+'/IMG_????.jpg')}
n=len(have); bad=0
for f in new:
  im=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); h=imagehash.phash(im)
  hits=[(h-v,k) for k,v in have.items() if h-v<=TH]
  if hits and not force: print('DUPLICATE?',f,'~',min(hits)); bad=1; continue
  n+=1; name=f'{D}/IMG_{n:04d}'
  ImageOps.fit(im,(960,1200)).save(name+'.jpg',quality=84,progressive=True)
  ImageOps.fit(im,(480,600)).save(name+'-t.jpg',quality=80)
  have[name+'.jpg']=h; print('added',name)
print(f'PHOTO_COUNT={n}  -> update Array.from({{length: N}}) in grimos.js'); sys.exit(bad)
