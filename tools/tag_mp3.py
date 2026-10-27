#!/usr/bin/env python3
"""Tag site MP3s from tracks.json (ID3v2.3): title, artist/album artist tomGRIM, album, track N/total,
year, BPM (TBPM from tracks.json bpm), comment + WOAR/WXXX = https://thomasgrim.com, embedded album cover (front).
Usage: tools/tag_mp3.py [album_id ...]   (no args = all albums). Audio is never re-encoded."""
import json, sys, os
from mutagen.id3 import ID3, ID3NoHeaderError, TIT2, TPE1, TPE2, TALB, TRCK, TDRC, COMM, WOAR, WXXX, APIC, TBPM
URL = 'https://thomasgrim.com'; ARTIST = 'tomGRIM'
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
data = json.load(open('tracks.json'))
albums = data['albums'] if isinstance(data, dict) else data
want = set(sys.argv[1:])
for a in albums:
    if want and a.get('id') not in want: continue
    tracks = a.get('tracks', []); n = len(tracks)
    cover = a.get('cover'); img = open(cover, 'rb').read() if cover and os.path.exists(cover) else None
    for i, t in enumerate(tracks, 1):
        f = t['file']
        if not os.path.exists(f): print('missing', f); continue
        try: tag = ID3(f)
        except ID3NoHeaderError: tag = ID3()
        for k in ('TIT2','TPE1','TPE2','TALB','TRCK','TDRC','COMM','WOAR','WXXX','APIC'): tag.delall(k)
        tag.add(TIT2(encoding=3, text=t['title'])); tag.add(TPE1(encoding=3, text=ARTIST)); tag.add(TPE2(encoding=3, text=ARTIST))
        tag.add(TALB(encoding=3, text=a['title'])); tag.add(TRCK(encoding=3, text=f'{i}/{n}'))
        if a.get('year'): tag.add(TDRC(encoding=3, text=str(a['year'])))
        tag.add(COMM(encoding=3, lang='eng', desc='', text=f'{ARTIST} · {URL}'))
        tag.add(WOAR(url=URL)); tag.add(WXXX(encoding=3, desc='Website', url=URL))
        if t.get('bpm'): tag.delall('TBPM'); tag.add(TBPM(encoding=3, text=str(int(round(t['bpm'])))))
        if img: tag.add(APIC(encoding=3, mime='image/jpeg', type=3, desc='Cover', data=img))
        tag.save(f, v2_version=3); print('tagged', f, f'{i}/{n}')
