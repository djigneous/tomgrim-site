"""BPM detection for tomGRIM songs: librosa beat tracking, rounded to an integer, folded into 70-180 BPM.
detect_bpm(path) -> dict(bpm=int, raw=float, confidence='ok'|'uncertain', notes=[...])"""
import numpy as np
LO, HI = 70, 180

def _fold(b):
    while b < LO: b *= 2
    while b > HI: b /= 2
    return b

def detect_bpm(path, y=None, sr=22050):
    import librosa
    if y is None: y, sr = librosa.load(path, sr=sr, mono=True)
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr)
    raw = float(np.atleast_1d(tempo)[0]); notes = []
    # beat-interval median as a second estimate
    bt = librosa.frames_to_time(beats, sr=sr)
    med = 60.0 / np.median(np.diff(bt)) if len(bt) > 8 else raw
    bpm = _fold(raw)
    if raw != bpm: notes.append(f'folded {raw:.1f} -> {bpm:.1f} (half/double-time)')
    # per-half check: do the two halves of the song agree (modulo 2x)?
    n = len(oenv) // 2; halves = []
    for seg in (oenv[:n], oenv[n:]):
        if len(seg) > 200: halves.append(_fold(float(np.atleast_1d(librosa.feature.tempo(onset_envelope=seg, sr=sr))[0])))
    unc = False
    if abs(_fold(med) - bpm) > 3: unc = True; notes.append(f'beat-interval median {_fold(med):.1f} disagrees')
    if len(halves) == 2 and abs(halves[0] - halves[1]) > 3: unc = True; notes.append(f'halves disagree {halves[0]:.1f}/{halves[1]:.1f}')
    if bpm < 85 or bpm > 160: unc = True; notes.append('near range edge; half/double-time ambiguous')
    return dict(bpm=int(round(bpm)), raw=round(raw, 2), confidence='uncertain' if unc else 'ok', notes=notes)

if __name__ == '__main__':
    import sys, json
    for p in sys.argv[1:]: print(p, json.dumps(detect_bpm(p)))
