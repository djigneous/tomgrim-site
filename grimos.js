(() => {
'use strict';
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FALLBACK = {artist:'tomGRIM',albums:[{id:'ember-hours',title:'Ember Hours',type:'album',year:null,blurb:'',cover:'assets/covers/ember-hours.jpg',tracks:[
 {title:'Graveyard Over the Fire',file:'assets/track1.mp3'},{title:'Kickflip My Heart',file:'assets/track2.mp3'},{title:'Telling Me',file:'assets/track3.mp3'}]}]};
const audio = $('#audio');
let groups = 0, data, flat = [], view = [], cur = -1, sel = 0, repeat = 'all', shuffle = true, vol = .8, actx, an, waveCache = {};
const loopOverride = {};
audio.volume = vol;
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- boot ---------- */
const bootLines = ['GRIM/OS 2.6.66-warm #1 SMP PREEMPT lehigh-valley x86_64','[    0.000000] BIOS-e820: phosphor memory map ok','[    0.004113] Booting tomGRIM kernel on ign3ous-legacy hardware',
 '[    0.120771] crt0: scanline driver loaded (60Hz, P1 green phosphor)','[    0.250004] snd-grim: Web Audio bridge initialised','[    0.333333] analyser0: fft 2048, smoothing 0.75',
 '[    0.410000] mounting /music/albums ... ok','[    0.512345] mounting /music/loops ... ok','[    0.601010] breakbeat.ko: tempo locked','[  OK  ] Started GRIMAMP ascii audio daemon.',
 '[  OK  ] Reached target Downtempo.','','grimos login: tom','Password: ********','Last login: from the ign3ous era',''];
const boot = $('#boot'), bootlog = $('#bootlog');
let booted = false;
function endBoot() { if (booted) return; booted = true; if (!RM) try { glitch({intro: 750}); } catch (e) {} boot.classList.add('gone'); setTimeout(() => boot.remove(), 450); $('#cmd').blur(); sessionStorage.grimBooted = 1; }
if (sessionStorage.grimBooted || RM) { boot.remove(); booted = true; }
else { let i = 0; const step = () => { if (booted) return; if (i < bootLines.length) { bootlog.textContent += bootLines[i++] + '\n'; setTimeout(step, 60 + Math.random() * 110); } else setTimeout(endBoot, 500); }; step();
 addEventListener('keydown', e => { if (!booted) { e.preventDefault(); e.stopImmediatePropagation(); endBoot(); } }, true);
 boot.addEventListener('pointerdown', endBoot); }

/* ---------- clock ---------- */
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], {hour12:false}); }, 1000);

/* ---------- data ---------- */
async function load() {
 try { const r = await fetch('tracks.json', {cache:'no-cache'}); if (!r.ok) throw 0; data = await r.json(); if (!data.albums?.length) throw 0;
  data.albums.forEach(a => { if (a.id === 'ember-hours' && !(a.tracks || []).length) a.tracks = FALLBACK.albums[0].tracks; });
  if (!data.albums.some(a => (a.tracks || []).length)) throw 0;
  data.albums.forEach(a => { if (a.id === 'elements' && (!a.year || a.year > 2009)) a.year = 2009; });
  const rank = a => ({album: 0, ep: 0, single: 1, loops: 2})[a.type || 'album'] ?? 1;
  data.albums = data.albums.map((a, i) => [a, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]); }
 catch { data = FALLBACK; }
 flat = [];
 let gi = -1, lastSingle = false;
 data.albums.forEach((al, ai) => { const single = al.type === 'single'; if (!(single && lastSingle)) gi++; lastSingle = single;
  (al.tracks || []).forEach((t, ti) => flat.push({...t, al, ai: gi, ti, single})); });
 groups = gi + 1; let sc = 0; flat.forEach(t => { if (t.single) t.ti = sc++; });
 renderList(); updateModes();
 const s = new URLSearchParams(location.search).get('t'); if (s && flat[+s]) select(+s);
 else { const d = flat.findIndex(t => /^let me be your problem$/i.test(t.title)); if (d >= 0) { cur = d; audio.preload = 'metadata'; audio.src = flat[d].file; setRecord(flat[d]); loadWave(flat[d]); select(d); updateNP(); } }
}

/* ---------- playlist ---------- */
const pl = $('#playlist');
function renderList(q = '') {
 q = q.toLowerCase(); view = []; let html = '', last = -1;
 flat.forEach((t, i) => {
  if (q && !(t.title + ' ' + t.al.title).toLowerCase().includes(q)) return;
  if (t.ai !== last) { last = t.ai; const al = t.al, key = String.fromCharCode(65 + t.ai);
   if (t.single) { const n = flat.filter(x => x.ai === t.ai).length;
    html += `<li class="div" role="presentation" id="al-${t.ai}">══[${key}]═ SINGLES <small>${n} trk</small> ════════════════════════════</li>`; }
   else html += `<li class="div" role="presentation" id="al-${t.ai}">══[${key}]═ ${esc(al.title.toUpperCase())} <small>${al.year ? al.year + ' · ' : ''}${al.type === 'loops' ? 'loop pack' : al.type || 'album'} · ${al.tracks.length} trk</small> ════════════════════════════</li>`; }
  view.push(i);
  html += `<li class="tr" role="option" id="tr-${i}" data-i="${i}" aria-selected="false"><span class="n">${String(t.ti + 1).padStart(2, '0')}</span><span class="t">${esc(t.title)}${t.special ? ' <span class="star" title="special feature">★ special</span>' : ''}${t.single && t.al.year ? ' <span class="dim">(' + t.al.year + ')</span>' : ''}</span><span class="dim">${t.bpm ? Math.round(t.bpm) + 'bpm ' : ''}${t.duration_sec ? fmt(t.duration_sec) : ''}</span></li>`;
 });
 pl.innerHTML = html || '<li class="dim">no matches</li>';
 mark();
}
function mark() {
 pl.querySelectorAll('.tr').forEach(li => { const i = +li.dataset.i; li.classList.toggle('sel', i === sel); li.classList.toggle('cur', i === cur); li.setAttribute('aria-selected', i === sel); });
 const s = $('#tr-' + sel); if (s) { pl.setAttribute('aria-activedescendant', s.id); const top = s.offsetTop - pl.offsetTop; if (top < pl.scrollTop || top > pl.scrollTop + pl.clientHeight - 24) pl.scrollTop = top - pl.clientHeight / 2; }
}
function select(i) { sel = i; mark(); }
pl.addEventListener('click', e => { const li = e.target.closest('.tr'); if (li) { select(+li.dataset.i); play(+li.dataset.i); } });
function moveSel(d) { const p = view.indexOf(sel); const n = view[Math.max(0, Math.min(view.length - 1, (p < 0 ? 0 : p + d)))]; if (n != null) select(n); }

/* ---------- audio graph ---------- */
function ensureCtx() {
 if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
 actx = new (window.AudioContext || window.webkitAudioContext)();
 const src = actx.createMediaElementSource(audio);
 an = actx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .75;
 src.connect(an); an.connect(actx.destination);
}
const isLoopAlbum = t => t && t.al.type === 'loops';
function effRepeat() { const t = flat[cur]; if (t && isLoopAlbum(t)) return loopOverride[t.ai] ?? (repeat === 'off' ? 'one' : repeat); return repeat; }
window.tgTrack = function (kind, title) { try { const gc = window.goatcounter; if (!gc || typeof gc.count !== 'function') return;
 const slug = String(title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
 gc.count({path: kind + '/' + slug, title: String(title || ''), event: true}); } catch (e) {} };
const playedOnce = {}; let ringAgc = .1, secret = null;
const curT = () => secret || flat[cur];
function play(i) {
 secret = null;
 if (i == null || !flat[i]) i = sel >= 0 && flat[sel] ? sel : 0;
 ensureCtx();
 if (i !== cur || !playedOnce[i]) { playedOnce[i] = 1; window.tgTrack('play', flat[i].title); }
 if (i !== cur) { cur = i; audio.src = flat[i].file; setRecord(flat[i]); loadWave(flat[i]); }
 setMediaMeta(flat[i]);
 audio.play().catch(err => say('play blocked: ' + err.message));
 select(i); updateNP();
}
function toggle() { if (cur < 0 || audio.paused) play(cur < 0 ? sel : cur); else audio.pause(); }
function next(d = 1) {
 if (!flat.length) return;
 let i;
 if (shuffle) { const inLoops = isLoopAlbum(flat[cur]), pool = flat.map((t, k) => k).filter(k => k !== cur && (inLoops || !isLoopAlbum(flat[k]))); i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : (cur + 1) % flat.length; }
 else i = ((cur < 0 ? sel : cur) + d + flat.length) % flat.length;
 play(i);
}
audio.addEventListener('ended', () => { if (secret) { secret = null; return next(1); } const r = effRepeat(); if (r === 'one') { audio.currentTime = 0; audio.play(); } else if (r === 'all' || shuffle || cur < flat.length - 1) next(1); });
audio.addEventListener('play', updateNP); audio.addEventListener('pause', updateNP);
audio.addEventListener('loadedmetadata', updateNP);
audio.addEventListener('error', () => say('error: cannot load ' + (curT()?.file || '')));
audio.addEventListener('timeupdate', () => { $('#tcur').textContent = fmt(audio.currentTime); });
const COVERS = ['ember-hours', 'elements', 'night-signals', 'phosphor-cache', 'get-out', 'soundtracks', 'remixes'];
let lastMeta = '';
function artFor(t) { const id = t && COVERS.includes(t.al.id) ? t.al.id : 'tomgrim-default', base = new URL('assets/covers/', location.href).href;
 return [96, 192, 256, 512].map(s => ({src: `${base}${id}-${s}.png`, sizes: `${s}x${s}`, type: 'image/png'})); }
function setMediaMeta(t, force) { if (!t) return; audio.title = `${t.id3_title || t.title} — ${t.id3_artist || 'tomGRIM'}`; if (!('mediaSession' in navigator) || !window.MediaMetadata) return; const key = t.file; if (key === lastMeta && !force && navigator.mediaSession.metadata) return; lastMeta = key;
 navigator.mediaSession.metadata = new MediaMetadata({title: t.id3_title || t.title, artist: t.id3_artist || 'tomGRIM', album: t.single ? 'Single' : t.al.title, artwork: artFor(t)}); }
function posState() { try { if ('mediaSession' in navigator && audio.duration && isFinite(audio.duration)) navigator.mediaSession.setPositionState({duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration)}); } catch {} }
if ('mediaSession' in navigator) { const ms = navigator.mediaSession, h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
 h('play', () => play(cur < 0 ? sel : cur)); h('pause', () => audio.pause()); h('nexttrack', () => next(1)); h('previoustrack', () => next(-1));
 h('seekto', e => { if (e.fastSeek && 'fastSeek' in audio) audio.fastSeek(e.seekTime); else audio.currentTime = e.seekTime; posState(); });
 h('seekbackward', e => seek(-(e.seekOffset || 10))); h('seekforward', e => seek(e.seekOffset || 10));
 audio.addEventListener('loadedmetadata', posState); audio.addEventListener('seeked', posState);
 audio.addEventListener('play', () => { ms.playbackState = 'playing'; posState(); });
 audio.addEventListener('playing', () => { setMediaMeta(curT(), true); ms.playbackState = 'playing'; posState(); });
 audio.addEventListener('durationchange', posState); audio.addEventListener('pause', () => { ms.playbackState = 'paused'; }); }
function updateNP() {
 const t = curT();
 $('#nptitle').textContent = t ? (audio.paused ? '❚❚ ' : '▶ ') + t.title + (t.special ? ' ★' : '') : '▶ select a track';
 $('#npalbum').textContent = t ? `${data.artist || 'tomGRIM'} — ${t.al.title}${t.al.year ? ' (' + t.al.year + ')' : ''}${t.bpm ? ' · ' + Math.round(t.bpm) + ' bpm' : ''}` : '—';
 $('#tdur').textContent = fmt(audio.duration || t?.duration_sec);
 const b = $('#bplay'); b.textContent = audio.paused ? '▶ PLAY' : '❚❚ PAUSE'; b.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
 document.title = t && !audio.paused ? `▶ ${t.title} · tomGRIM` : 'tomGRIM :: GRIM/OS terminal';
 mark(); updateModes();
 setMediaMeta(t);
}
function updateModes() {
 const t = flat[cur], r = effRepeat();
 $('#brep').textContent = 'rep:' + r + (t && isLoopAlbum(t) ? '·loop' : '');
 $('#bshuf').textContent = 'shuf:' + (shuffle ? 'on' : 'off'); $('#bshuf').setAttribute('aria-pressed', shuffle);
 $('#modes').textContent = `[${r === 'one' ? '↻1' : r === 'all' ? '↻∞' : '→'}${shuffle ? ' ⤨' : ''}]`;
 const vb = $('#volbar'), row = vb.parentElement; let used = 0; for (const ch of row.children) if (ch !== vb) used += ch.getBoundingClientRect().width; used += row.firstChild.nodeType === 3 ? 3.5 * (cw || 9) : 0; const ccw = (cw || 9) - 1, N = Math.max(4, Math.min(20, Math.floor((row.clientWidth - used - 24) / ccw))) || 20; const n = Math.round(vol * N); vb.textContent = '█'.repeat(n) + '░'.repeat(N - n); $('#volpct').textContent = String(Math.round(vol * 100)).padStart(3) + '%';
}
function cycleRepeat() {
 const t = flat[cur], order = ['off', 'all', 'one'];
 if (t && isLoopAlbum(t)) { loopOverride[t.ai] = effRepeat() === 'one' ? 'all' : 'one'; say(`loop repeat (${t.al.title}): ${loopOverride[t.ai]}`); }
 else { repeat = order[(order.indexOf(repeat) + 1) % 3]; say('repeat: ' + repeat); }
 updateModes();
}
function setVol(v) { vol = Math.max(0, Math.min(1, v)); audio.volume = vol; updateModes(); }
function seek(d) { if (audio.duration) audio.currentTime = Math.max(0, Math.min(audio.duration - .1, audio.currentTime + d)); }
$('#bplay').onclick = toggle; $('#bnext').onclick = () => next(1); $('#bprev').onclick = () => next(-1);
$('#brep').onclick = cycleRepeat; $('#bshuf').onclick = () => { shuffle = !shuffle; updateModes(); };
$('#volup').onclick = () => setVol(vol + .05); $('#voldn').onclick = () => setVol(vol - .05);

/* ---------- ascii vinyl ---------- */
const coverEl = $('#cover');
const PALS = [['#ff7a3d', '@%#*+=-:. ', 2, 3], ['#7dffa0', '§&$%#oO0o:', 3, 5], ['#c58cff', '@#S%?*+;:,', 1, 4], ['#ffd23f', '░▒▓█▓▒░·∙ ', 4, 2], ['#ff4a8a', '╳╱╲┼═║~≈-.', 5, 6], ['#5fb8ff', '◉●○◌∘°·.:;', 2, 7]];
let rec = {ang: 0, spd: 0, pal: PALS[0], label: 'TG', title: '', seed: 0}, recLast = 0;
function hash(str) { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function setRecord(t) { const h = hash(t.al.id || t.al.title); rec.pal = PALS[h % PALS.length]; rec.seed = h; rec.label = t.single ? 'S' : (t.al.title.replace(/[^A-Za-z0-9]/g, '')[0] || 'T').toUpperCase(); rec.title = (t.single ? t.title : t.al.title).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 9); coverEl.style.setProperty('--rec', rec.pal[0]); drawRecord(); }
function drawRecord() {
 const W = 37, H = 19, cx = (W - 1) / 2, cy = (H - 1) / 2, [, chars, arms, tight] = rec.pal, a = rec.ang; let out = '';
 for (let y = 0; y < H; y++) { let line = '';
  for (let x = 0; x < W; x++) { const dx = (x - cx) / cx, dy = (y - cy) / cy, r = Math.hypot(dx, dy); let th = Math.atan2(dy, dx);
   if (r > 1.0) { line += ' '; continue; }
   if (r > .955) { line += '<span class="g">' + (y === 0 || y === H - 1 ? '─' : '·') + '</span>'; continue; }
   if (r < .3) { // label
    const row = y - Math.round(cy), lw = rec.title.length, col = x - Math.round(cx);
    if (r < .06) { line += '<span class="g">●</span>'; continue; }
    if (row === -2 && col === 0) { line += '<span class="l">' + esc(rec.label) + '</span>'; continue; }
    if (row === 2 && Math.abs(col) <= lw / 2 && lw) { const ch = rec.title[col + Math.floor(lw / 2)]; line += '<span class="l">' + esc(ch || ' ') + '</span>'; continue; }
    const s2 = Math.sin((th + a) * 2) > .6; line += '<span class="a">' + (s2 ? '▓' : r > .25 ? '░' : ' ') + '</span>'; continue; }
   const sp = Math.sin(th * arms - r * tight * 6.283 + a * arms), groove = Math.sin(r * 58 + (rec.seed % 7));
   const shine = Math.cos(th - a - 0.9) ; // rotating highlight
   let v = (sp * .5 + .5) * .7 + (groove > .55 ? .3 : 0); if (shine > .93) v = 1;
   const ch = chars[Math.min(chars.length - 1, Math.floor((1 - v) * chars.length))];
   line += sp > .82 ? '<span class="a">' + esc(ch) + '</span>' : esc(ch); }
  out += line + '\n'; }
 coverEl.innerHTML = out;
}
function spinRecord(now) { const dt = Math.min(.1, (now - recLast) / 1000 || 0); if (now - recLast < 50) return; recLast = now; // ~20fps
 const target = (actx && !audio.paused && !RM) ? 3.49 : 0; rec.spd += (target - rec.spd) * Math.min(1, dt * (target ? 3 : 1.6)); if (rec.spd < .002) rec.spd = 0;
 if (rec.spd || !coverEl.innerHTML) { rec.ang += rec.spd * dt; drawRecord(); } }
rec.title = 'TOMGRIM'; drawRecord();

/* ---------- waveform ---------- */
const wave = $('#wave'), wg = wave.getContext('2d');
async function loadWave(t) {
 if (waveCache[t.file]) return;
 waveCache[t.file] = 'loading';
 try {
  const buf = await (await fetch(t.file)).arrayBuffer();
  const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100);
  const ab = await oc.decodeAudioData(buf);
  const ch = ab.getChannelData(0), N = 600, step = Math.floor(ch.length / N), peaks = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step, e = j + step; j < e; j += 16) { const v = Math.abs(ch[j]); if (v > m) m = v; } peaks[i] = m; }
  waveCache[t.file] = peaks;
 } catch (e) { waveCache[t.file] = null; }
}
function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
let colors = {};
function refreshColors() { colors = {fg:css('--fg'), dim:css('--dim'), hi:css('--hi'), acc:css('--acc')}; }
function fitCanvas(c) { const w = c.clientWidth * devicePixelRatio | 0, h = c.clientHeight * devicePixelRatio | 0; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
function drawWave() {
 fitCanvas(wave); const W = wave.width, H = wave.height; wg.clearRect(0, 0, W, H);
 const t = curT(), p = t && waveCache[t.file], pos = audio.duration ? audio.currentTime / audio.duration : 0;
 if (p && p.length) { const bw = W / p.length;
  for (let i = 0; i < p.length; i++) { const h = Math.max(1, p[i] * H * .95); wg.fillStyle = i / p.length < pos ? colors.fg : colors.dim; wg.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - .5), h); } }
 else { wg.fillStyle = colors.dim; wg.font = 14 * devicePixelRatio + 'px monospace'; wg.fillText(t ? (p === 'loading' ? 'decoding waveform…' : 'waveform n/a') : 'no track loaded', 8, H / 2 + 5); }
 wg.fillStyle = colors.hi; wg.fillRect(pos * W - 1, 0, 2, H);
 wave.setAttribute('aria-valuenow', Math.round(pos * 100));
}
function waveSeek(e) { if (!audio.duration) return; const r = wave.getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration; }
let dragging = false;
wave.addEventListener('pointerdown', e => { dragging = true; wave.setPointerCapture(e.pointerId); waveSeek(e); });
wave.addEventListener('pointermove', e => dragging && waveSeek(e));
wave.addEventListener('pointerup', () => dragging = false);

/* ---------- visuals loop ---------- */
const specEl = $('#spec'), ring = $('#ring'), rg = ring.getContext('2d');
const BLK = ' ▁▂▃▄▅▆▇█'; let peaks = [], fbuf, tbuf, idle = 0;
let cw = 0, NBc = 32;
function measure() { const m = document.createElement('span'); m.textContent = '█'.repeat(20); specEl.appendChild(m); cw = m.getBoundingClientRect().width / 20 || 8; m.remove();
 const w = specEl.clientWidth || 300; NBc = Math.max(12, Math.floor(w / cw)); specEl.style.letterSpacing = ((w - NBc * cw) / NBc) + 'px'; }
new ResizeObserver(measure).observe(specEl);
function frame() {
const playing = actx && !audio.paused; const NB = NBc, ROWS = Math.max(6, Math.floor((specEl.clientHeight || 100) / 12) - 1); let vals = new Array(NB).fill(0);
 if (an) { fbuf = fbuf || new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fbuf);
  const n = fbuf.length, nyq = (actx.sampleRate || 44100) / 2, f0 = 30, f1 = Math.min(16000, nyq);
  for (let b = 0; b < NB; b++) { const fa = f0 * Math.pow(f1 / f0, b / NB), fb = f0 * Math.pow(f1 / f0, (b + 1) / NB);
   const lo = fa / nyq * n, hi = fb / nyq * n; let m = 0;
   if (hi - lo < 1) { const k = Math.floor(lo), fr = lo - k; m = fbuf[k] * (1 - fr) + (fbuf[k + 1] || 0) * fr; }
   else for (let k = Math.floor(lo); k < Math.ceil(hi); k++) m = Math.max(m, fbuf[k]);
   const tilt = 1 + .5 * b / NB; vals[b] = Math.min(1, m / 255 * tilt); } }
 if (!playing) { idle += .03; vals = vals.map((v, b) => Math.max(v * .9, .04 + .03 * Math.sin(idle + b * .4))); }
 // spectrum
 let s = '';
 for (let b = 0; b < NB; b++) { peaks[b] = Math.max((peaks[b] || 0) - .012, vals[b]); }
 s += '─'.repeat(NB) + '\n'; const TOP = '▔▔▀▀▀██'; // bars hang down from the top edge
 for (let r = 0; r < ROWS; r++) { let line = '';
  for (let b = 0; b < NB; b++) { const v = vals[b] * ROWS - r, pk = Math.floor(peaks[b] * ROWS - .001);
   let ch = v >= 1 ? (r < 2 ? '<span class="h">█</span>' : '█') : v > .12 ? TOP[Math.min(6, Math.floor(v * 7))] : ' ';
   if (ch === ' ' && pk === r && peaks[b] > .06) ch = '<span class="p">▁</span>';
   line += ch; }
  s += line + (r < ROWS - 1 ? '\n' : ''); }
 specEl.innerHTML = s;
 // round oscilloscope ring around the record (auto-gain + bass emphasis) (amplitude clamped to the padding gap)
 fitCanvas(ring); { const W = ring.width, H = ring.height, d = devicePixelRatio, pad = parseFloat(getComputedStyle(ring.parentElement).paddingLeft) * d || 22 * d;
  const cx = W / 2, cy = H / 2, rx = W / 2 - pad / 2, ry = H / 2 - pad / 2, amp = pad / 2 - 2 * d; rg.clearRect(0, 0, W, H);
  rg.strokeStyle = colors.dim; rg.globalAlpha = .35; rg.lineWidth = d; rg.beginPath(); rg.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); rg.stroke(); rg.globalAlpha = 1;
  const live = an && playing; let gain = 1;
  if (live) { tbuf = tbuf || new Uint8Array(an.fftSize); an.getByteTimeDomainData(tbuf); let sq = 0; for (let i = 0; i < tbuf.length; i += 4) { const x = (tbuf[i] - 128) / 128; sq += x * x; }
   const rms = Math.sqrt(sq / (tbuf.length / 4)); ringAgc = Math.max(rms, ringAgc * .992, .02); gain = Math.min(9, Math.max(1.5, .55 / ringAgc)); }
  const N = 240; for (const [col, lw, blur] of [[colors.fg, 2.6, 10], [colors.hi, 1.1, 0]]) { rg.strokeStyle = col; rg.lineWidth = lw * d; rg.shadowColor = col; rg.shadowBlur = blur * d; rg.beginPath();
   for (let i = 0; i <= N; i++) { const t = i % N, a = t / N * Math.PI * 2 - Math.PI / 2; let v; if (live) { const k = Math.floor(t / N * (tbuf.length - 1)), raw = (tbuf[k] - 128) / 128; let lp = 0; for (let q = -12; q <= 12; q += 3) lp += (tbuf[(k + q + tbuf.length) % tbuf.length] - 128) / 128; v = Math.tanh((raw + lp / 9 * .9) * gain); } else v = Math.sin(t / 6 + idle * 3) * .06; const o = Math.max(-1, Math.min(1, v)) * amp, x = cx + Math.cos(a) * (rx + o), y = cy + Math.sin(a) * (ry + o); i ? rg.lineTo(x, y) : rg.moveTo(x, y); }
   rg.closePath(); rg.stroke(); } rg.shadowBlur = 0; }
 drawWave(); spinRecord(performance.now());
 requestAnimationFrame(frame);
}

/* ---------- shell ---------- */
const out = $('#out'), cmd = $('#cmd'); const hist = []; let hp = 0;
function say(html, raw) { const d = document.createElement('div'); if (raw) d.innerHTML = html; else d.textContent = html; out.appendChild(d); out.scrollTop = out.scrollHeight; }
const LINKS = [['spotify','https://open.spotify.com/artist/1tBp2oza76uuM5bC3fx8Vg'],['apple-music','https://music.apple.com/us/artist/tomgrim/1705139904'],['youtube','https://www.youtube.com/@ig3.productions'],['soundcloud','https://soundcloud.com/thomasgrim']];
const THEMES = ['cyan', 'green', 'amber', 'red', 'gray', 'fire', 'ice'];
const themeSel = $('#themesel'); themeSel.innerHTML = THEMES.map(t => `<option value="${t}">${t}</option>`).join('');
const curTheme = () => (document.body.className.match(/theme-(\w+)/) || [])[1] || 'cyan';
function setTheme(t, quiet) { if (t === 'grey' || t === 'grayscale') t = 'gray'; if (!THEMES.includes(t)) return say('usage: theme ' + THEMES.join('|'));
 document.body.className = document.body.className.replace(/theme-\w+/, 'theme-' + t); localStorage.grimTheme = t; themeSel.value = t; refreshColors(); if (!quiet) say('theme → ' + t); }
themeSel.addEventListener('change', () => setTheme(themeSel.value));
function setCrt(on, quiet) { document.body.classList.toggle('nocrt', !on); localStorage.grimCrt = on ? '1' : '0'; const b = $('#bcrt'); b.textContent = 'CRT:' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', on); if (!quiet) say('crt filter: ' + (on ? 'on' : 'off')); }
$('#bcrt').onclick = () => setCrt(document.body.classList.contains('nocrt'));
/* matrix rain */
let mx = null;
function matrix() { if (mx || fxs) return; const c = document.createElement('canvas'); c.id = 'matrix'; c.setAttribute('aria-label', 'matrix rain, press any key to exit'); document.body.appendChild(c);
 const g = c.getContext('2d'), fs = 16, chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789TOMGRIM♪♫'; let cols, drops;
 const size = () => { c.width = innerWidth; c.height = innerHeight; cols = Math.ceil(c.width / fs); drops = Array.from({length: cols}, () => Math.random() * -40); }; size();
 let last = 0; const stop = () => { if (!mx) return; cancelAnimationFrame(mx.raf); c.remove(); removeEventListener('keydown', onKey, true); mx = null; say('wake up, tom… the bassline has you.'); };
 const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); stop(); };
 const tick = now => { mx.raf = requestAnimationFrame(tick); if (now - last < 50) return; last = now;
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, c.width, c.height); g.font = fs + 'px monospace';
  for (let i = 0; i < cols; i++) { const y = drops[i] * fs; g.fillStyle = colors.hi; g.fillText(chars[Math.random() * chars.length | 0], i * fs, y); g.fillStyle = colors.fg; g.fillText(chars[Math.random() * chars.length | 0], i * fs, y - fs);
   if (y > c.height && Math.random() > .975) drops[i] = 0; drops[i] += 1; } };
 mx = {raf: requestAnimationFrame(tick)}; c.addEventListener('pointerdown', stop); setTimeout(() => addEventListener('keydown', onKey, true), 50);
 if (RM) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = colors.fg; g.font = '24px monospace'; g.fillText('MATRIX (reduced motion) — any key to exit', 20, 60); cancelAnimationFrame(mx.raf); } }

/* ---------- fx: glitch / fire / hack / starfield ---------- */
let fxs = null;
function level() { if (an && !audio.paused) { fbuf = fbuf || new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fbuf); let b = 0, m = 0; for (let i = 0; i < 24; i++) b += fbuf[i]; for (let i = 0; i < 256; i++) m += fbuf[i]; return {bass: b / 24 / 255, lvl: m / 256 / 255}; }
 const t = performance.now() / 1000, beat = Math.pow(1 - (t * 2.1 % 1), 3); return {bass: beat * .8, lvl: .25 + beat * .35}; }
function fxRun(name, msg, init, draw, dur, intro) { if (fxs || mx) return; refreshColors(); const c = document.createElement('canvas'); c.id = 'matrix'; c.className = 'fx-' + name; c.setAttribute('aria-label', name + ' effect, press any key to exit'); document.body.appendChild(c);
 const g = c.getContext('2d'), mob = innerWidth < 760 || matchMedia('(pointer:coarse)').matches, st = {mob, t0: performance.now()};
 const size = () => { const dpr = mob ? 1 : Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr; st.dpr = dpr; init(g, c, st); }; size(); addEventListener('resize', size);
 const stop = () => { if (!fxs) return; cancelAnimationFrame(fxs.raf); clearTimeout(fxs.to); c.remove(); removeEventListener('keydown', onKey, true); removeEventListener('resize', size); fxs = null; if (msg) say(msg); };
 const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); stop(); };
 let last = 0; const step = mob ? 50 : 33;
 const tick = now => { fxs.raf = requestAnimationFrame(tick); if (now - last < step) return; last = now; draw(g, c, st, (now - st.t0) / 1000, level()); };
 fxs = {raf: 0, stop}; if (intro) { msg = ''; c.classList.add('fx-intro'); c.style.pointerEvents = 'none'; fxs.to = setTimeout(() => { c.style.opacity = '0'; setTimeout(stop, 160); }, intro); } else { c.addEventListener('pointerdown', stop); setTimeout(() => addEventListener('keydown', onKey, true), 50); }
 if (RM) { draw(g, c, st, dur || 0, {bass: 0, lvl: .3}); g.fillStyle = colors.fg; g.font = 20 * st.dpr + 'px monospace'; g.fillText(name.toUpperCase() + ' (reduced motion) — any key to exit', 20 * st.dpr, 40 * st.dpr); }
 else fxs.raf = requestAnimationFrame(tick); }
function glitch(o) { const intro = o && o.intro; fxRun('glitch', 'signal restored.', (g, c, st) => { st.lines = Array.from({length: 40}, () => ({y: Math.random(), h: Math.random() * .06, txt: Array.from({length: 120}, () => '01#@%&$/\\|<>'[Math.random() * 12 | 0]).join('')})); },
 (g, c, st, t, L) => { const W = c.width, H = c.height, d = st.dpr, k = .3 + L.bass * 2.2, fs = 14 * d;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.font = 'bold ' + fs + 'px monospace';
  const off = (Math.random() - .5) * 18 * k * d, word = 'tomGRIM', big = Math.min(W / 5, 160 * d);
  st.lines.forEach((l, i) => { const y = l.y * H; g.globalAlpha = .35; g.fillStyle = i % 3 ? colors.dim : colors.fg; g.fillText(l.txt, ((t * 40 * (i % 5 + 1)) % 200) * d - 200 * d + (Math.random() < k * .15 ? off * 3 : 0), y); });
  g.globalAlpha = 1; g.font = 'bold ' + big + 'px monospace'; g.textAlign = 'center'; g.globalCompositeOperation = 'lighter';
  [['#f00', -1], ['#0f0', 0], ['#00f', 1]].forEach(([col, s]) => { g.fillStyle = col; g.fillText(word, W / 2 + s * off * 1.5, H / 2 + s * off * .4); });
  g.globalCompositeOperation = 'source-over'; g.textAlign = 'left';
  const n = 2 + (k * 6 | 0); for (let i = 0; i < n; i++) { const y = Math.random() * H | 0, h = (Math.random() * 40 * k + 2) * d | 0, dx = (Math.random() - .5) * 120 * k * d | 0; try { g.drawImage(c, 0, y, W, h, dx, y, W, h); } catch {} }
  if (Math.random() < k * .2) { g.fillStyle = colors.hi; g.globalAlpha = .15; g.fillRect(0, Math.random() * H, W, 3 * d); g.globalAlpha = 1; }
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < H; y += 3 * d) g.fillRect(0, y, W, d); }, 0, intro); }
function fire() { const R = ' .:-=+*#%@'; fxRun('fire', 'the fire dies down to embers.', (g, c, st) => { st.fs = (st.mob ? 12 : 14) * st.dpr; st.cw = st.fs * .6; st.W = Math.ceil(c.width / st.cw); st.H = Math.ceil(c.height / st.fs); st.b = new Float32Array(st.W * (st.H + 2)); },
 (g, c, st, t, L) => { const {W, H, b, fs, cw} = st, heat = .75 + L.bass * .6;
  for (let x = 0; x < W; x++) b[(H + 1) * W + x] = Math.random() < .55 * heat ? 1.4 : 0;
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, j = (y + 1) * W; b[i] = (b[j + (x - 1 + W) % W] + b[j + x] + b[j + (x + 1) % W] + (b[j + W + x] || 0)) / 4.05 - .004; if (b[i] < 0) b[i] = 0; }
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.font = fs + 'px monospace'; g.textBaseline = 'top';
  for (let y = 0; y < H; y++) { let row = ''; const cols = [colors.dim, colors.fg, colors.acc, colors.hi];
   for (let lv = 0; lv < 4; lv++) { row = ''; let any = false; for (let x = 0; x < W; x++) { const v = Math.min(1, b[y * W + x]), q = Math.min(3, v * 4 | 0); if (q === lv && v > .05) { row += R[Math.min(9, v * 10 | 0)]; any = true; } else row += ' '; }
    if (any) { g.fillStyle = cols[lv]; g.fillText(row, 0, y * fs); } } } }); }
function hack() { const hex = n => Array.from({length: n}, () => (Math.random() * 256 | 0).toString(16).padStart(2, '0')).join(' '), ip = () => [0, 0, 0, 0].map(() => Math.random() * 255 | 0).join('.');
 const AG = ['  ___   _____  _____  _____  _____  _____ ', ' / _ \\ /  __ \\/  __ \\|  ___|/  ___|/  ___|', '/ /_\\ \\| /  \\/| /  \\/| |__  \\ `--. \\ `--. ', '|  _  || |    | |    |  __|  `--. \\ `--. \\', '| | | || \\__/\\| \\__/\\| |___ /\\__/ //\\__/ /', '\\_| |_/ \\____/ \\____/\\____/ \\____/ \\____/ ', '', '      G  R  A  N  T  E  D   ::  welcome, tom'];
 const steps = ['tracing route to mainframe ' + ip(), 'bypassing firewall layer 1/3', 'bypassing firewall layer 2/3', 'bypassing firewall layer 3/3', 'injecting payload grim.so', 'cracking SHA-256 handshake', 'escalating privileges → root', 'downloading /vault/unreleased_stems.tar'];
 fxRun('hack', 'connection closed by foreign host.', (g, c, st) => { st.fs = (st.mob ? 11 : 14) * st.dpr; st.rows = st.rows || []; },
 (g, c, st, t) => { const fs = st.fs, W = c.width, H = c.height, maxR = Math.floor(H / fs) - 1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.font = fs + 'px monospace'; g.textBaseline = 'top';
  if (t < 8.5) { for (let k = 0; k < 3; k++) { const r = Math.random(); st.rows.push(r < .6 ? ['d', '0x' + (Math.random() * 0xffffffff >>> 0).toString(16).padStart(8, '0') + '  ' + hex(st.mob ? 8 : 16)] : r < .85 ? ['d', '[' + ip() + ':' + (Math.random() * 65535 | 0) + '] SYN → ACK  ' + ['OK', 'OK', 'RETRY', 'OPEN'][Math.random() * 4 | 0]] : ['f', '>> ' + steps[Math.min(7, t / 1.05 | 0)]]); }
   st.rows = st.rows.slice(-maxR + 3); st.rows.forEach((r, i) => { g.fillStyle = r[0] === 'f' ? colors.hi : colors.dim; g.fillText(r[1], 10 * st.dpr, i * fs); });
   const p = Math.min(1, t / 8.5), bw = st.mob ? 24 : 40, s = steps[Math.min(7, t / 1.05 | 0)]; g.fillStyle = colors.fg; g.fillText(s.padEnd(42).slice(0, 42) + ' [' + '█'.repeat(p * bw | 0) + '░'.repeat(bw - (p * bw | 0)) + '] ' + (p * 100 | 0) + '%', 10 * st.dpr, H - fs * 1.6); }
  else { const fs2 = Math.min(fs * 1.4, W / 46 / .6); g.font = 'bold ' + fs2 + 'px monospace'; g.fillStyle = (t * 4 | 0) % 2 ? colors.hi : colors.fg; const x = (W - 43 * fs2 * .6) / 2, y = (H - AG.length * fs2) / 2; AG.forEach((l, i) => g.fillText(l, x, y + i * fs2)); g.font = fs + 'px monospace'; g.fillStyle = colors.dim; g.fillText('press any key', x, y + (AG.length + 1) * fs2); } }, 9); }
function starfield() { fxRun('starfield', 'dropping out of warp.', (g, c, st) => { st.n = st.mob ? 220 : 600; st.s = Array.from({length: st.n}, () => ({x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random()})); },
 (g, c, st, t, L) => { const W = c.width, H = c.height, cx = W / 2, cy = H / 2, sp = .004 + L.lvl * .05 + L.bass * .03, fs = 14 * st.dpr; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H); g.font = fs + 'px monospace';
  st.s.forEach(s => { s.z -= sp; if (s.z <= .01) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; } const px = cx + s.x / s.z * cx * .5, py = cy + s.y / s.z * cy * .5; if (px < 0 || px > W || py < 0 || py > H) { s.z = 0; return; }
   const b = 1 - s.z; g.fillStyle = b > .8 ? colors.hi : b > .45 ? colors.fg : colors.dim; g.fillText(b > .85 ? '*' : b > .6 ? '+' : b > .3 ? '·' : '.', px, py); }); }); }
function cowsay(t) { t = (t || 'moo. drop the bass.').slice(0, 200); const w = Math.min(36, Math.max(...t.split(' ').map(x => x.length), 4)); const lines = []; let l = '';
 t.split(/\s+/).forEach(word => { if ((l + ' ' + word).trim().length > w) { lines.push(l.trim()); l = word; } else l += ' ' + word; }); if (l.trim()) lines.push(l.trim());
 const W = Math.max(...lines.map(x => x.length)); let b = ' ' + '_'.repeat(W + 2) + '\n';
 lines.forEach((x, i) => { const [o, c] = lines.length === 1 ? ['<', '>'] : i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']; b += `${o} ${x.padEnd(W)} ${c}\n`; });
 b += ' ' + '-'.repeat(W + 2) + '\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\  ♪♫  )\\/\\\n                ||----w |\n                ||     ||'; say(b); }
const CMDS = {
 help: () => say('commands: help ls albums play <n|name> pause next prev bio links mail irc get clear theme <' + THEMES.join('|') + '> themes crt on|off repeat shuffle vol <0-100> whoami fetch\nget:      get <n|name> · get album <name> · get --list   (aliases: wget, curl -O)\nnet:      mail (contact form) · irc (#tomgrim on irc.unrealircd.org)\nfun:      matrix · glitch · fire · hack · starfield (visual fx, any key/click exits) · cowsay <text>'),
 themes: () => say('themes: ' + THEMES.map(t => t === curTheme() ? '[' + t + ']' : t).join(' ')),
 crt: a => { a = (a || '').trim(); if (a === 'on' || a === 'off') setCrt(a === 'on'); else if (!a) setCrt(document.body.classList.contains('nocrt')); else say('usage: crt on|off'); },
 photos: () => { say(`~/photos: ${PHOTOS.length} frames · click one or use ←/→ in the viewer`); jump('photos'); }, gallery: () => CMDS.photos(),
 matrix: () => matrix(), glitch: () => glitch(), fire: () => fire(), hack: () => hack(), starfield: () => starfield(), stars: () => starfield(), cowsay: a => cowsay(a),
 ls: () => flat.forEach((t, i) => say(`${String(i + 1).padStart(3)}  ${t.title}${t.special ? ' ★' : ''}  [${t.single ? 'single' : t.al.title}]`)),
 albums: () => data.albums.forEach((a, i) => say(`[${String.fromCharCode(65 + (flat.find(t => t.al === a)?.ai ?? i))}] ${a.title}${a.year ? ' (' + a.year + ')' : ''} — ${a.type || 'album'}, ${a.tracks.length} tracks${a.blurb ? ' · ' + a.blurb : ''}`)),
 play: a => { if (!a) return toggle(); const n = parseInt(a, 10); if (n >= 1 && n <= flat.length) { play(n - 1); say('playing ' + flat[n - 1].title); } else { const i = flat.findIndex(t => t.title.toLowerCase().includes(a.toLowerCase())); i >= 0 ? (play(i), say('playing ' + flat[i].title)) : say('no such track: ' + a); } },
 pause: () => audio.pause(), next: () => next(1), prev: () => next(-1), repeat: cycleRepeat, shuffle: () => { shuffle = !shuffle; updateModes(); say('shuffle: ' + shuffle); },
 vol: a => { setVol((+a || 0) / 100); say('volume ' + Math.round(vol * 100) + '%'); },
 bio: () => { say(document.querySelector('.manbody').innerText); jump('man'); },
 man: a => CMDS.bio(), whoami: () => say('tomGRIM — formerly dj ign3ous. Lehigh Valley, PA.'), fetch: () => jump('fetch'), grimfetch: () => jump('fetch'),
 links: () => LINKS.forEach(([n, u]) => say(`${n.padEnd(12)} <a href="${u}" target="_blank" rel="noopener">${u}</a>`, true)),
 contact: () => { say('opening mail client…'); openModal('mail'); }, mail: () => CMDS.contact(), irc: () => { say('opening irc #tomgrim on irc.unrealircd.org…'); openModal('irc'); }, chat: () => CMDS.irc(),
 zach: () => zach(), get: a => getCmd(a), wget: a => getCmd(a), curl: a => getCmd((a || '').replace(/(^|\s)(-O|--remote-name|-L|-s)(?=\s|$)/g, ' ').trim()),
 clear: () => { out.innerHTML = ''; }, theme: a => setTheme((a || '').trim()),
 sudo: () => say('tom is not in the sudoers file. This incident will be reported to the bassline.'), exit: () => say('there is no exit. only the next track.'),
};
$('#prompt').addEventListener('submit', e => { e.preventDefault(); const v = cmd.value.trim(); cmd.value = ''; if (!v) return; hist.push(v); hp = hist.length;
 say('tom@grimos:~$ ' + v); const [c, ...rest] = v.split(/\s+/); const f = CMDS[c.toLowerCase()]; f ? f(rest.join(' ')) : say(`grimsh: command not found: ${c} (try help)`); });
cmd.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { hp = Math.max(0, hp - 1); cmd.value = hist[hp] || ''; e.preventDefault(); } else if (e.key === 'ArrowDown') { hp = Math.min(hist.length, hp + 1); cmd.value = hist[hp] || ''; e.preventDefault(); }
 else if (e.key === 'Tab' && cmd.value) { const m = Object.keys(CMDS).filter(k => k.startsWith(cmd.value)); if (m.length === 1) { cmd.value = m[0] + ' '; e.preventDefault(); } } });

/* ---------- navigation ---------- */
const SECTIONS = ['fetch', 'man', 'player', 'links', 'shell', 'photos'];
function jump(id) { if (id === 'photos') return openPhotos(); const el = document.getElementById(id); if (!el) return; el.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'}); document.querySelectorAll('.win').forEach(w => w.classList.toggle('focus', w === el));
 document.querySelectorAll('#topbar nav button').forEach(b => { b.classList.toggle('on', b.dataset.jump === id); b.setAttribute('aria-current', b.dataset.jump === id); });
 if (id === 'shell') cmd.focus({preventScroll: true}); else if (id === 'player') pl.focus({preventScroll: true}); else el.focus({preventScroll: true}); }
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); jump(b.dataset.jump); }));
const ICONS = { // 8x8 pixel glyphs
 fetch: ['11111111','10000001','10110101','10000001','10111101','10000001','11111111','00111100'],
 man: ['01111100','01000110','01011111','01000001','01011101','01000001','01011101','01111111'],
 player: ['00111100','01000010','10011001','10100101','10100101','10011001','01000010','00111100'],
 links: ['00000000','01100110','10011001','10011001','10011001','10011001','01100110','00000000'],
 shell: ['11111111','10000001','10100001','10010001','10100001','10001101','10000001','11111111'],
 irc: ['11111110','10000010','10101010','10000010','11111110','00100000','01000000','00000000'],
 mail: ['00000000','11111111','11000011','10100101','10011001','10000001','11111111','00000000'],
 photos: ['00011000','11111111','10000001','10011001','10100101','10011001','10000001','11111111']};
document.querySelectorAll('#topbar nav button').forEach(b => { const m = ICONS[b.dataset.ico]; if (!m) return; let r = ''; m.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
 b.insertAdjacentHTML('afterbegin', `<svg class="ico" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">${r}</svg>`); });
const navIO = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && en.intersectionRatio > .5) document.querySelectorAll('#topbar nav button').forEach(b => { if (!document.querySelector('.win.focus')) { b.classList.toggle('on', b.dataset.jump === en.target.id); } }); }), {threshold: [.5]});
SECTIONS.forEach(id => navIO.observe(document.getElementById(id)));
const search = $('#search');
search.addEventListener('input', () => renderList(search.value));
search.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (view.length) select(view[0]); pl.focus(); if (e.key === 'Enter' && view.length) play(view[0]); } });
const help = $('#help');
function showHelp(v) { help.hidden = !v; if (v) $('#hclose').focus(); }
$('#bhelp').onclick = () => showHelp(true); $('#hclose').onclick = () => showHelp(false); help.addEventListener('click', e => { if (e.target === help) showHelp(false); });
wave.addEventListener('keydown', e => { if (e.key === 'Home') audio.currentTime = 0; });
document.addEventListener('keydown', e => {
 const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
 if (openM && !typing && e.key !== 'Escape') return;
 if (e.key === 'Escape') { if (!help.hidden) return showHelp(false); if (typing) { e.target.blur(); if (e.target === search && search.value) { search.value = ''; renderList(); } pl.focus(); } return; }
 if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
 if (!help.hidden && e.key !== '?') return;
 const k = e.key;
 const btn = tag === 'BUTTON' || tag === 'A';
 if (k === ' ' && !btn) { e.preventDefault(); toggle(); }
 else if (k === 'ArrowDown') { e.preventDefault(); moveSel(1); }
 else if (k === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
 else if (k === 'ArrowRight') { e.preventDefault(); seek(5); }
 else if (k === 'ArrowLeft') { e.preventDefault(); seek(-5); }
 else if (k === 'Enter' && !btn) { e.preventDefault(); play(sel); }
 else if (k === '+' || k === '=') setVol(vol + .05);
 else if (k === '-' || k === '_') setVol(vol - .05);
 else if (k === 'n') next(1);
 else if (k === 'p') next(-1);
 else if (k === 'r') cycleRepeat();
 else if (k === 's') { shuffle = !shuffle; updateModes(); }
 else if (k === '/') { e.preventDefault(); jump('player'); search.focus(); }
 else if (k === ':' || k === '`') { e.preventDefault(); jump('shell'); }
 else if (k === '?') showHelp(help.hidden);
 else if (k === 't') setTheme(THEMES[(THEMES.indexOf(curTheme()) + 1) % THEMES.length]);
 else if (k === 'f') setCrt(document.body.classList.contains('nocrt'));
 else if (k === 'c') { document.body.classList.toggle('flicker'); localStorage.grimFlicker = document.body.classList.contains('flicker') ? 1 : ''; }
 else if (/^[1-6]$/.test(k)) jump(SECTIONS[+k - 1]);
 else if (k === '7') openModal('irc'); else if (k === '8') openModal('mail');
 else if (k === 'g') jump('photos');
 else if (/^[A-Z]$/.test(k)) { const ai = k.charCodeAt(0) - 65, i = flat.findIndex(t => t.ai === ai); if (i >= 0) { if (search.value) { search.value = ''; renderList(); } select(i); jump('player'); document.getElementById('al-' + ai)?.scrollIntoView({block: 'nearest'}); } }
});


/* ---------- ??? ---------- */
const ZX = [['YXNzZXRzL2Jpbi9kNGU3YTkxYy5tcDM=']];
function zach() { const f = atob(ZX[0][0]), t = {title: 'Screw Detention', id3_artist: 'Zach feat. Lori', file: f, al: {id: 'x', title: 'Zach feat. Lori', year: 2026}, single: false};
 const art = [' _____   _    ____ _   _ ', '|__  /  / \\  / ___| | | |', '  / /  / _ \\| |   | |_| |', ' / /_ / ___ \\ |___|  _  |', '/____/_/   \\_\\____|_| |_|  feat. LORI', '', '  >> unlocking /home/zach/secret …', '  >> ACCESS GRANTED: SCREW DETENTION'];
 let k = 0; const step = () => { if (k < art.length) { say(art[k++]); setTimeout(step, RM ? 0 : 110); } else go(); };
 const go = () => { ensureCtx(); secret = t; audio.src = f; setRecord({al: {id: 'zach-lori', title: 'ZACH'}, title: 'SCREW DETENTION', single: true}); loadWave(t); setMediaMeta(t, true);
  audio.play().then(() => window.tgTrack('play', 'secret')).catch(err => say('play blocked: ' + err.message)); updateNP(); if (!RM) try { glitch({intro: 500}); } catch (e) {} };
 step(); }
/* ---------- modals: mail / irc ---------- */

let openM = null, mLast = null;
const ircNick = 'grim_guest' + String(Math.random() * 10000 | 0).padStart(4, '0');
function openModal(id) { closeModal(); const m = $('#' + id + 'm'); if (!m) return; window.tgTrack('view', id); mLast = document.activeElement; m.hidden = false; openM = m;
 if (id === 'irc') { const irc = window.tgIRC($('#ircbox'), {nick: ircNick}); $('#ircnick').textContent = 'server: irc.unrealircd.org'; setTimeout(irc.focus, 30); }
 else m.querySelector('input[name=name]').focus(); }
function closeModal() { if (!openM) return; openM.hidden = true; openM = null; mLast?.focus?.(); }
document.querySelectorAll('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m) closeModal(); }); m.querySelector('.mclose').onclick = closeModal; });
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openModal(b.dataset.open); }));
addEventListener('keydown', e => { if (openM && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeModal(); } }, true);
window.tgContactInit && tgContactInit($('#mailm'));
/* ---------- get / wget ---------- */
const sizeCache = {};
const fname = t => `tomGRIM - ${t.title.replace(/[\\/:*?"<>|]+/g, '-')}.mp3`;
const hsize = b => b == null ? '   ?' : b > 1048576 ? (b / 1048576).toFixed(1) + 'M' : (b / 1024 | 0) + 'K';
async function fsize(t) { if (t.file in sizeCache) return sizeCache[t.file]; try { const r = await fetch(t.file, {method: 'HEAD'}); return sizeCache[t.file] = +r.headers.get('content-length') || null; } catch { return sizeCache[t.file] = null; } }
function findTrack(a) { const n = parseInt(a, 10); if (/^\d+$/.test(a) && flat[n - 1]) return n - 1; a = a.toLowerCase(); let i = flat.findIndex(t => t.title.toLowerCase() === a); return i >= 0 ? i : flat.findIndex(t => t.title.toLowerCase().includes(a)); }
async function getTrack(i) { const t = flat[i], fn = fname(t), url = new URL(t.file, location.href).href;
 say(`--${new Date().toISOString().replace('T', ' ').slice(0, 19)}--  ${url}\nResolving thomasgrim.com... connected.\nHTTP request sent, awaiting response... 200 OK`);
 const size = await fsize(t); say(`Length: ${size ?? 'unspecified'} (${hsize(size).trim()}) [audio/mpeg]\nSaving to: '${fn}'`);
 const line = document.createElement('div'); out.appendChild(line); const W = 30, T = RM ? 1 : 900; let t0 = performance.now();
 await new Promise(res => { const step = now => { const p = Math.min(1, (now - t0) / T), k = p * W | 0; line.textContent = `${fn.slice(0, 28).padEnd(28)} ${String(p * 100 | 0).padStart(3)}%[${'='.repeat(Math.max(0, k - 1))}${p < 1 ? '>' : '='}${' '.repeat(W - Math.max(k, 1))}] ${hsize(size ? size * p : null).padStart(6)}  ${p < 1 ? (2 + Math.random() * 6).toFixed(2) + 'MB/s' : 'in ' + (T / 1000).toFixed(1) + 's'}`; out.scrollTop = out.scrollHeight; p < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
 const a = document.createElement('a'); a.href = t.file; a.download = fn; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
 say(`'${fn}' saved [${size ?? '?'}/${size ?? '?'}]`); window.tgTrack('download', t.title); }
async function getCmd(a) { a = (a || '').trim();
 if (!a) return say("usage: get [OPTION]... <TRACK|NAME>\n       get album <NAME>\n       get --list | ls\n\n  TRACK       track number as shown by 'ls' (1-" + flat.length + ")\n  NAME        track title or part of it\n  album NAME  download every track of an album\n  -l, --list  list downloadable files with sizes\n  -h, --help  show this help\n\naliases: wget, curl -O.  example: get let me be your problem");
 if (/^(-h|--help)$/.test(a)) return getCmd('');
 if (/^(-l|--list|ls)$/.test(a)) { say('fetching index of /assets/audio …'); const sz = await Promise.all(flat.map(fsize)); let tot = 0;
  flat.forEach((t, i) => { tot += sz[i] || 0; say(`-rw-r--r-- tom grim ${hsize(sz[i]).padStart(6)}  ${String(i + 1).padStart(3)}  ${fname(t)}`); }); return say(`total ${hsize(tot)} in ${flat.length} files`); }
 const m = a.match(/^album\s+(.+)/i); if (m) { const q = m[1].toLowerCase(), al = data.albums.find(x => x.title.toLowerCase() === q || x.id === q) || data.albums.find(x => x.title.toLowerCase().includes(q));
  if (!al) return say('get: album not found: ' + m[1] + " (try 'albums')"); const idx = flat.map((t, i) => i).filter(i => flat[i].al === al);
  say(`queued ${idx.length} files from ${al.title}. your browser may ask to allow multiple downloads.`); for (const i of idx) { await getTrack(i); await new Promise(r => setTimeout(r, 600)); } return say(`FINISHED --  ${idx.length} files downloaded`); }
 const i = findTrack(a); if (i < 0) return say(`get: ${a}: No such file or directory (try 'get --list')`); getTrack(i); }

/* ---------- photos ---------- */
function openPhotos() { const p = $('#photos'); if (p.hidden) window.tgTrack('view', 'photos'); p.hidden = false; document.body.classList.add('photos-open'); if (location.hash !== '#photos') history.pushState(null, '', '#photos'); p.scrollTop = 0; $('#phback').focus(); }
function closePhotos(fromPop) { const p = $('#photos'); if (p.hidden) return; p.hidden = true; document.body.classList.remove('photos-open'); if (!fromPop && location.hash === '#photos') history.back(); }
$('#phback').onclick = () => closePhotos();
addEventListener('popstate', () => location.hash === '#photos' ? openPhotos() : closePhotos(true));
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#photos').hidden && $('#lb').hidden) { e.preventDefault(); e.stopImmediatePropagation(); closePhotos(); } }, true);
if (location.hash === '#photos') setTimeout(openPhotos, 0);
const PHOTOS = Array.from({length: 14}, (_, i) => 'IMG_' + String(i + 1).padStart(4, '0'));
const gal = $('#gallery');
gal.innerHTML = PHOTOS.map((n, i) => `<li><figure class="ph" tabindex="0" role="button" data-i="${i}" aria-label="Open photo ${i + 1} of ${PHOTOS.length}" style="margin:0"><div class="bar"><span>${n}.RAW</span><span>[ 960x1200 ]</span></div><div class="frame"><img src="assets/photos/${n}-t.jpg" loading="lazy" decoding="async" width="480" height="600" alt="tomGRIM behind the decks, photo ${i + 1}"></div><figcaption class="cap">-rw-r--r-- tom ${n.toLowerCase()}.jpg</figcaption></figure></li>`).join('');
const lb = $('#lb'), lbimg = $('#lbimg'); let lbi = 0, lastFocus = null;
function lbShow(i) { lbi = (i + PHOTOS.length) % PHOTOS.length; const n = PHOTOS[lbi]; lbimg.src = `assets/photos/${n}.jpg`; lbimg.alt = `tomGRIM behind the decks, photo ${lbi + 1}`;
 $('#lbcap').textContent = `─[ ${n}.RAW  [ 960x1200 ] ]─`; $('#lbn').textContent = `${lbi + 1}/${PHOTOS.length}`; new Image().src = `assets/photos/${PHOTOS[(lbi + 1) % PHOTOS.length]}.jpg`; }
function lbOpen(i) { lastFocus = document.activeElement; lb.hidden = false; lbShow(i); $('#lbclose').focus(); }
function lbClose() { lb.hidden = true; lastFocus?.focus?.(); }
gal.addEventListener('click', e => { const f = e.target.closest('.ph'); if (f) lbOpen(+f.dataset.i); });
gal.addEventListener('keydown', e => { const f = e.target.closest('.ph'); if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); lbOpen(+f.dataset.i); } });
$('#lbprev').onclick = () => lbShow(lbi - 1); $('#lbnext').onclick = () => lbShow(lbi + 1); $('#lbclose').onclick = lbClose;
lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });
addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowLeft') lbShow(lbi - 1); else if (e.key === 'ArrowRight') lbShow(lbi + 1); else if (e.key === 'Tab') return; else return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
let sx = null; lb.addEventListener('pointerdown', e => { sx = e.clientX; }); lb.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) lbShow(lbi + (dx < 0 ? 1 : -1)); });
lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive: true}); lb.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) lbShow(lbi + (dx < 0 ? 1 : -1)); });
new ResizeObserver(() => updateModes()).observe($('.volrow'));
new ResizeObserver(() => document.documentElement.style.setProperty('--tb', $('#topbar').offsetHeight + 'px')).observe($('#topbar'));

/* ---------- init ---------- */
setTheme(THEMES.includes(localStorage.grimTheme) ? localStorage.grimTheme : 'cyan', true); setCrt(localStorage.grimCrt !== '0', true);
if (localStorage.grimFlicker === '1' || (localStorage.grimFlicker == null && !RM)) document.body.classList.add('flicker');
refreshColors(); updateModes();
say('GRIM/OS grimsh 2.6 — type "help". press ? for keys.');
say('motd: every track is free to download — type "get <track#>" or "get --list".');
document.querySelectorAll('.getlink').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const c = $('#cmd'); jump('shell'); c.value = b.dataset.get; c.focus({preventScroll: true}); c.setSelectionRange(c.value.length, c.value.length); }));
load().then(() => requestAnimationFrame(frame));
})();
