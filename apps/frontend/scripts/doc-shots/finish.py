#!/usr/bin/env python3
"""캡처 마무리 — 폭 1000 이하로 줄이고 연회색 테두리(표시 폭 기준 화면 1px)를 넣는다.
   python3 scripts/doc-shots/finish.py <입력.png> <출력.png> [표시폭=420]
   Pillow 필요 (pip install pillow)."""
import sys
from PIL import Image, ImageOps
src, dst = sys.argv[1], sys.argv[2]
disp = int(sys.argv[3]) if len(sys.argv) > 3 else 420
im = Image.open(src).convert('RGB')
if im.width > 1000:
    im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
px = max(1, round(im.width / disp))
ImageOps.expand(im, border=px, fill=(191, 191, 191)).save(dst, optimize=True)
print(dst, im.size, 'border', px)
