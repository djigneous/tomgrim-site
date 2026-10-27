#!/usr/bin/env python3
"""Backfill BPM: for every track in tracks.json without a `bpm`, detect it (tools/bpm.py, librosa beat tracking,
folded into 70-180, integer) and store it. Then write ONLY the ID3 TBPM frame on each MP3 from tracks.json
(existing bpm values are kept as authoritative). Other tags and the audio data are untouched.
Usage: tools/bpm_backfill.py [--redetect] [--dry-run]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpm import detect_bpm
from mutagen.id3 import ID3, ID3NoHeaderError, TBPM
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
redetect, dry = '--redetect' in sys.argv, '--dry-run' in sys.argv
data = json.load(open('tracks.json')); changed = False
for a in data['albums']:
    for t in a.get('tracks', []):
        f = t['file']
        if not os.path.exists(f): print('missing', f); continue
        if redetect or not t.get('bpm'):
            r = detect_bpm(f); print(f"detect {t['title']}: {r['bpm']} ({r['confidence']}{'; ' + '; '.join(r['notes']) if r['notes'] else ''})")
            t['bpm'] = r['bpm']; changed = True
        if dry: continue
        try: tag = ID3(f)
        except ID3NoHeaderError: tag = ID3()
        if str(tag.get('TBPM', '')) == str(int(round(t['bpm']))): continue
        tag.delall('TBPM'); tag.add(TBPM(encoding=3, text=str(int(round(t['bpm'])))))
        tag.save(f, v2_version=3); print('TBPM', t['bpm'], f)
if changed and not dry:
    open('tracks.json', 'w').write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
