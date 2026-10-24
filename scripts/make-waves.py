#!/usr/bin/env python3
"""Precompute 600-point waveform peaks for every track in tracks.json -> assets/waves/<path>.json (so the site never downloads a whole MP3 just to draw it)."""
import json, os, re, subprocess, sys, array
N = 600
s = open('tracks.json').read()
files = sorted(set(re.findall(r'assets/[^"\\]+\.mp3', s)))
for f in files:
    out = 'assets/waves/' + f[len('assets/'):-4] + '.json'
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(f): continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    a = array.array('h'); a.frombytes(raw[:len(raw) // 2 * 2])
    step = max(1, len(a) // N)
    peaks = [round(max((abs(x) for x in a[i * step:(i + 1) * step]), default=0) / 32768 * 99) for i in range(N)]
    json.dump(peaks, open(out, 'w'), separators=(',', ':'))
    print(out)
