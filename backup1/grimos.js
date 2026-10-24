(() => {
'use strict';
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FALLBACK = {artist:'tomGRIM',albums:[{id:'ember-hours',title:'Ember Hours',type:'album',year:null,blurb:'',cover:'assets/cover-web.jpg',tracks:[
 {title:'Graveyard Over the Fire',file:'assets/track1.mp3'},{title:'Kickflip My Heart',file:'assets/track2.mp3'},{title:'Telling Me',file:'assets/track3.mp3'}]}]};
const audio = $('#audio');
let data, flat = [], view = [], cur = -1, sel = 0, repeat = 'off', shuffle = false, vol = .8, actx, an, anL, anR, waveCache = {}, coverCache = {};
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
function endBoot() { if (booted) return; booted = true; boot.classList.add('gone'); setTimeout(() => boot.remove(), 450); $('#cmd').blur(); sessionStorage.grimBooted = 1; }
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
  if (!data.albums.some(a => (a.tracks || []).length)) throw 0; }
 catch { data = FALLBACK; }
 flat = [];
 data.albums.forEach((al, ai) => (al.tracks || []).forEach((t, ti) => flat.push({...t, al, ai, ti})));
 renderList(); updateModes();
 const s = new URLSearchParams(location.search).get('t'); if (s && flat[+s]) select(+s);
}

/* ---------- playlist ---------- */
const pl = $('#playlist');
function renderList(q = '') {
 q = q.toLowerCase(); view = []; let html = '', last = -1;
 flat.forEach((t, i) => {
  if (q && !(t.title + ' ' + t.al.title).toLowerCase().includes(q)) return;
  if (t.ai !== last) { last = t.ai; const al = t.al, key = String.fromCharCode(65 + t.ai);
   html += `<li class="div" role="presentation" id="al-${t.ai}">══[${key}]═ ${esc(al.title.toUpperCase())} <small>${al.year ? al.year + ' · ' : ''}${al.type === 'loops' ? 'loop pack' : 'album'} · ${al.tracks.length} trk</small> ════════════════════════════</li>`; }
  view.push(i);
  html += `<li class="tr" role="option" id="tr-${i}" data-i="${i}" aria-selected="false"><span class="n">${String(t.ti + 1).padStart(2, '0')}</span><span class="t">${esc(t.title)}</span><span class="dim">${t.bpm ? Math.round(t.bpm) + 'bpm ' : ''}${t.duration_sec ? fmt(t.duration_sec) : ''}</span></li>`;
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
 const sp = actx.createChannelSplitter(2); anL = actx.createAnalyser(); anR = actx.createAnalyser(); anL.fftSize = anR.fftSize = 1024;
 src.connect(an); an.connect(actx.destination); src.connect(sp); sp.connect(anL, 0); sp.connect(anR, 1);
}
const isLoopAlbum = t => t && t.al.type === 'loops';
function effRepeat() { const t = flat[cur]; if (t && isLoopAlbum(t)) return loopOverride[t.ai] ?? 'one'; return repeat; }
function play(i) {
 if (i == null || !flat[i]) i = sel >= 0 && flat[sel] ? sel : 0;
 ensureCtx();
 if (i !== cur) { cur = i; audio.src = flat[i].file; drawCover(flat[i]); loadWave(flat[i]); }
 audio.play().catch(err => say('play blocked: ' + err.message));
 select(i); updateNP();
}
function toggle() { if (cur < 0 || audio.paused) play(cur < 0 ? sel : cur); else audio.pause(); }
function next(d = 1) {
 if (!flat.length) return;
 let i;
 if (shuffle) { do i = Math.floor(Math.random() * flat.length); while (flat.length > 1 && i === cur); }
 else i = ((cur < 0 ? sel : cur) + d + flat.length) % flat.length;
 play(i);
}
audio.addEventListener('ended', () => { const r = effRepeat(); if (r === 'one') { audio.currentTime = 0; audio.play(); } else if (r === 'all' || shuffle || cur < flat.length - 1) next(1); });
audio.addEventListener('play', updateNP); audio.addEventListener('pause', updateNP);
audio.addEventListener('loadedmetadata', updateNP);
audio.addEventListener('error', () => say('error: cannot load ' + (flat[cur]?.file || '')));
audio.addEventListener('timeupdate', () => { $('#tcur').textContent = fmt(audio.currentTime); });
function updateNP() {
 const t = flat[cur];
 $('#nptitle').textContent = t ? (audio.paused ? '❚❚ ' : '▶ ') + t.title : '▶ select a track';
 $('#npalbum').textContent = t ? `${data.artist || 'tomGRIM'} — ${t.al.title}${t.al.year ? ' (' + t.al.year + ')' : ''}${t.bpm ? ' · ' + Math.round(t.bpm) + ' bpm' : ''}` : '—';
 $('#tdur').textContent = fmt(audio.duration || t?.duration_sec);
 const b = $('#bplay'); b.textContent = audio.paused ? '▶ PLAY' : '❚❚ PAUSE'; b.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
 document.title = t && !audio.paused ? `▶ ${t.title} · tomGRIM` : 'tomGRIM :: GRIM/OS terminal';
 mark(); updateModes();
 if ('mediaSession' in navigator && t) navigator.mediaSession.metadata = new MediaMetadata({title:t.title, artist:data.artist || 'tomGRIM', album:t.al.title, artwork:t.al.cover ? [{src:t.al.cover}] : []});
}
function updateModes() {
 const t = flat[cur], r = effRepeat();
 $('#brep').textContent = 'rep:' + r + (t && isLoopAlbum(t) ? '·loop' : '');
 $('#bshuf').textContent = 'shuf:' + (shuffle ? 'on' : 'off'); $('#bshuf').setAttribute('aria-pressed', shuffle);
 $('#modes').textContent = `[${r === 'one' ? '↻1' : r === 'all' ? '↻∞' : '→'}${shuffle ? ' ⤨' : ''}]`;
 const n = Math.round(vol * 20); $('#volbar').textContent = '█'.repeat(n) + '░'.repeat(20 - n) + ' ' + String(Math.round(vol * 100)).padStart(3) + '%';
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

/* ---------- ascii cover ---------- */
const RAMP = ' .:-=+*#%@';
function drawCover(t) {
 const el = $('#cover'), url = t.al.cover; if (!url) { el.textContent = ''; return; }
 if (coverCache[url]) { el.textContent = coverCache[url]; return; }
 const img = new Image(); img.onload = () => {
  const W = 40, H = 20, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let s = '';
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const k = (y * W + x) * 4, l = (d[k] * .3 + d[k + 1] * .59 + d[k + 2] * .11) / 255; s += RAMP[Math.min(9, Math.floor(l * 10))]; } s += '\n'; }
  coverCache[url] = s; el.textContent = s; };
 img.src = url;
}

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
 const t = flat[cur], p = t && waveCache[t.file], pos = audio.duration ? audio.currentTime / audio.duration : 0;
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
const specEl = $('#spec'), vuEl = $('#vu'), scope = $('#scope'), sg = scope.getContext('2d');
const BLK = ' ▁▂▃▄▅▆▇█'; let peaks = [], vuPeak = [0, 0], vuHold = [0, 0], fbuf, tbuf, lbuf, idle = 0;
let cw = 0; function bars() { if (!cw) { const m = document.createElement('span'); m.textContent = '█'.repeat(20); specEl.appendChild(m); cw = m.getBoundingClientRect().width / 20 || 8; m.remove(); } const w = specEl.clientWidth || 300; return Math.max(16, Math.min(72, Math.floor(w / cw) - 1)); }
addEventListener('resize', () => cw = 0);
function frame() {
 const playing = actx && !audio.paused; const NB = bars(), ROWS = 8; let vals = new Array(NB).fill(0);
 if (an) { fbuf = fbuf || new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fbuf);
  const n = fbuf.length; for (let b = 0; b < NB; b++) { const lo = Math.floor(Math.pow(n * .7, b / NB)), hi = Math.max(lo + 1, Math.floor(Math.pow(n * .7, (b + 1) / NB))); let m = 0; for (let k = lo; k < hi; k++) m = Math.max(m, fbuf[k]); vals[b] = m / 255; } }
 if (!playing) { idle += .03; vals = vals.map((v, b) => Math.max(v * .9, .04 + .03 * Math.sin(idle + b * .4))); }
 // spectrum
 let s = '';
 for (let b = 0; b < NB; b++) { peaks[b] = Math.max((peaks[b] || 0) - .012, vals[b]); }
 for (let r = ROWS - 1; r >= 0; r--) { let line = '';
  for (let b = 0; b < NB; b++) { const v = vals[b] * ROWS - r, pk = Math.floor(peaks[b] * ROWS - .001);
   let ch = v >= 1 ? '█' : v > 0 ? BLK[Math.round(v * 8)] : ' ';
   if (ch === ' ' && pk === r && peaks[b] > .06) ch = '<span class="p">▔</span>';
   line += ch; }
  s += line + '\n'; }
 s += '─'.repeat(NB);
 specEl.innerHTML = s;
 // VU
 let lv = '';
 [anL, anR].forEach((a, c) => { let rms = 0, pk = 0;
  if (a && playing) { lbuf = lbuf || new Float32Array(a.fftSize); a.getFloatTimeDomainData(lbuf); for (const x of lbuf) { rms += x * x; pk = Math.max(pk, Math.abs(x)); } rms = Math.sqrt(rms / lbuf.length); }
  const db = 20 * Math.log10(Math.max(rms, 1e-5)), lvl = Math.max(0, Math.min(1, (db + 48) / 48));
  vuPeak[c] = Math.max(vuPeak[c] * .93, lvl); if (lvl >= vuHold[c]) vuHold[c] = lvl; else vuHold[c] = Math.max(0, vuHold[c] - .004);
  const W = 26, n = Math.round(vuPeak[c] * W), h = Math.min(W - 1, Math.round(vuHold[c] * W));
  let bar = ''; for (let i = 0; i < W; i++) { const cls = i > W * .85 ? 'r' : i > W * .65 ? 'y' : ''; const ch = i < n ? '█' : i === h ? '┃' : '·'; bar += cls && (i < n || i === h) ? `<span class="${cls}">${ch}</span>` : ch; }
  lv += (c ? 'R ' : 'L ') + bar + ' ' + (db < -60 ? ' -∞' : String(Math.round(db)).padStart(3)) + 'dB\n'; });
 vuEl.innerHTML = lv + '  -48   -30   -18  -9 -3 0';
 // scope
 fitCanvas(scope); const W = scope.width, H = scope.height;
 sg.fillStyle = 'rgba(0,0,0,.35)'; sg.fillRect(0, 0, W, H);
 sg.strokeStyle = colors.dim; sg.globalAlpha = .3; sg.lineWidth = 1; sg.beginPath(); for (let i = 1; i < 8; i++) { sg.moveTo(i * W / 8, 0); sg.lineTo(i * W / 8, H); } sg.moveTo(0, H / 2); sg.lineTo(W, H / 2); sg.stroke(); sg.globalAlpha = 1;
 sg.strokeStyle = colors.fg; sg.lineWidth = 1.6 * devicePixelRatio; sg.shadowColor = colors.fg; sg.shadowBlur = 8; sg.beginPath();
 if (an && playing) { tbuf = tbuf || new Uint8Array(an.fftSize); an.getByteTimeDomainData(tbuf); let st = 0; for (let i = 1; i < tbuf.length / 2; i++) if (tbuf[i - 1] < 128 && tbuf[i] >= 128) { st = i; break; }
  const len = tbuf.length / 2; for (let i = 0; i < len; i++) { const x = i / len * W, y = (tbuf[st + i] / 255) * H; i ? sg.lineTo(x, y) : sg.moveTo(x, y); } }
 else { for (let x = 0; x <= W; x += 4) { const y = H / 2 + Math.sin(x / 30 + idle * 3) * 2; x ? sg.lineTo(x, y) : sg.moveTo(x, y); } }
 sg.stroke(); sg.shadowBlur = 0;
 drawWave();
 requestAnimationFrame(frame);
}

/* ---------- shell ---------- */
const out = $('#out'), cmd = $('#cmd'); const hist = []; let hp = 0;
function say(html, raw) { const d = document.createElement('div'); if (raw) d.innerHTML = html; else d.textContent = html; out.appendChild(d); out.scrollTop = out.scrollHeight; }
const LINKS = [['spotify','https://open.spotify.com/artist/1tBp2oza76uuM5bC3fx8Vg'],['apple-music','https://music.apple.com/us/artist/tomgrim/1705139904'],['youtube','https://www.youtube.com/@ig3.productions'],['soundcloud','https://soundcloud.com/thomasgrim']];
const THEMES = ['green', 'amber', 'cyan'];
function setTheme(t) { if (!THEMES.includes(t)) return say('usage: theme green|amber|cyan'); document.body.className = document.body.className.replace(/theme-\w+/, 'theme-' + t); localStorage.grimTheme = t; refreshColors(); say('theme → ' + t); }
const CMDS = {
 help: () => say('commands: help ls albums play <n> pause next prev bio links contact clear theme <green|amber|cyan> repeat shuffle vol <0-100> whoami fetch'),
 ls: () => flat.forEach((t, i) => say(`${String(i + 1).padStart(3)}  ${t.title}  [${t.al.title}]`)),
 albums: () => data.albums.forEach((a, i) => say(`[${String.fromCharCode(65 + i)}] ${a.title}${a.year ? ' (' + a.year + ')' : ''} — ${a.type || 'album'}, ${a.tracks.length} tracks${a.blurb ? ' · ' + a.blurb : ''}`)),
 play: a => { if (!a) return toggle(); const n = parseInt(a, 10); if (n >= 1 && n <= flat.length) { play(n - 1); say('playing ' + flat[n - 1].title); } else { const i = flat.findIndex(t => t.title.toLowerCase().includes(a.toLowerCase())); i >= 0 ? (play(i), say('playing ' + flat[i].title)) : say('no such track: ' + a); } },
 pause: () => audio.pause(), next: () => next(1), prev: () => next(-1), repeat: cycleRepeat, shuffle: () => { shuffle = !shuffle; updateModes(); say('shuffle: ' + shuffle); },
 vol: a => { setVol((+a || 0) / 100); say('volume ' + Math.round(vol * 100) + '%'); },
 bio: () => { say(document.querySelector('.manbody').innerText); jump('man'); },
 man: a => CMDS.bio(), whoami: () => say('tomGRIM — formerly dj ign3ous. Lehigh Valley, PA.'), fetch: () => jump('fetch'), grimfetch: () => jump('fetch'),
 links: () => LINKS.forEach(([n, u]) => say(`${n.padEnd(12)} <a href="${u}" target="_blank" rel="noopener">${u}</a>`, true)),
 contact: () => say('mail: <a href="mailto:tom@thomasgrim.com">tom@thomasgrim.com</a>', true),
 clear: () => { out.innerHTML = ''; }, theme: a => setTheme((a || '').trim()),
 sudo: () => say('tom is not in the sudoers file. This incident will be reported to the bassline.'), exit: () => say('there is no exit. only the next track.'),
};
$('#prompt').addEventListener('submit', e => { e.preventDefault(); const v = cmd.value.trim(); cmd.value = ''; if (!v) return; hist.push(v); hp = hist.length;
 say('tom@grimos:~$ ' + v); const [c, ...rest] = v.split(/\s+/); const f = CMDS[c.toLowerCase()]; f ? f(rest.join(' ')) : say(`grimsh: command not found: ${c} (try help)`); });
cmd.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { hp = Math.max(0, hp - 1); cmd.value = hist[hp] || ''; e.preventDefault(); } else if (e.key === 'ArrowDown') { hp = Math.min(hist.length, hp + 1); cmd.value = hist[hp] || ''; e.preventDefault(); }
 else if (e.key === 'Tab' && cmd.value) { const m = Object.keys(CMDS).filter(k => k.startsWith(cmd.value)); if (m.length === 1) { cmd.value = m[0] + ' '; e.preventDefault(); } } });

/* ---------- navigation ---------- */
const SECTIONS = ['fetch', 'man', 'player', 'links', 'shell'];
function jump(id) { const el = document.getElementById(id); if (!el) return; el.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'}); document.querySelectorAll('.win').forEach(w => w.classList.toggle('focus', w === el));
 document.querySelectorAll('#topbar button').forEach(b => b.classList.toggle('on', b.dataset.jump === id));
 if (id === 'shell') cmd.focus({preventScroll: true}); else if (id === 'player') pl.focus({preventScroll: true}); else el.focus({preventScroll: true}); }
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); jump(b.dataset.jump); }));
const search = $('#search');
search.addEventListener('input', () => renderList(search.value));
search.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (view.length) select(view[0]); pl.focus(); if (e.key === 'Enter' && view.length) play(view[0]); } });
const help = $('#help');
function showHelp(v) { help.hidden = !v; if (v) $('#hclose').focus(); }
$('#bhelp').onclick = () => showHelp(true); $('#hclose').onclick = () => showHelp(false); help.addEventListener('click', e => { if (e.target === help) showHelp(false); });
wave.addEventListener('keydown', e => { if (e.key === 'Home') audio.currentTime = 0; });
document.addEventListener('keydown', e => {
 const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA';
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
 else if (k === 't') setTheme(THEMES[(THEMES.indexOf(localStorage.grimTheme || 'green') + 1) % 3]);
 else if (k === 'c') { document.body.classList.toggle('flicker'); localStorage.grimFlicker = document.body.classList.contains('flicker') ? 1 : ''; }
 else if (/^[1-5]$/.test(k)) jump(SECTIONS[+k - 1]);
 else if (/^[A-Z]$/.test(k)) { const ai = k.charCodeAt(0) - 65, i = flat.findIndex(t => t.ai === ai); if (i >= 0) { if (search.value) { search.value = ''; renderList(); } select(i); jump('player'); document.getElementById('al-' + ai)?.scrollIntoView({block: 'nearest'}); } }
});

/* ---------- init ---------- */
if (localStorage.grimTheme && THEMES.includes(localStorage.grimTheme)) document.body.className = 'theme-' + localStorage.grimTheme;
if (localStorage.grimFlicker === '1' || (localStorage.grimFlicker == null && !RM)) document.body.classList.add('flicker');
refreshColors(); updateModes();
say('GRIM/OS grimsh 2.6 — type "help". press ? for keys.');
load().then(() => requestAnimationFrame(frame));
})();
