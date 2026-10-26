(() => {
'use strict';
const GRIMOS_VERSION = '6.10'; // last-updated stamp: (year-2020).(month), auto-set by scripts/stamp-version.sh
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FALLBACK = {artist:'tomGRIM',albums:[{id:'ember-hours',title:'Ember Hours',type:'album',year:null,blurb:'',cover:'assets/covers/ember-hours.jpg',tracks:[
 {title:'Graveyard Over the Fire',file:'assets/track1.mp3'},{title:'Kickflip My Heart',file:'assets/track2.mp3'}]}]};
const audio = $('#audio');
let groups = 0, data, flat = [], view = [], cur = -1, sel = 0, repeat = 'all', shuffle = true, vol = .8, actx, an, waveCache = {};
const loopOverride = {};
audio.volume = vol;
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- boot ---------- */
const bootLines = ['GRIM/OS ' + GRIMOS_VERSION + '-warm #1 SMP PREEMPT lehigh-valley x86_64','[    0.000000] BIOS-e820: phosphor memory map ok','[    0.004113] Booting tomGRIM kernel on ign3ous-legacy hardware',
 '[    0.120771] crt0: scanline driver loaded (60Hz, P1 green phosphor)','[    0.250004] snd-grim: Web Audio bridge initialised','[    0.333333] analyser0: fft 2048, smoothing 0.75',
 '[    0.410000] mounting /music/albums ... ok','[    0.512345] mounting /music/loops ... ok','[    0.601010] breakbeat.ko: tempo locked','[  OK  ] Started GRIMAMP ascii audio daemon.',
 '[  OK  ] Reached target Downtempo.','','grimos login: tom','Password: ********','Last login: from the ign3ous era',''];
const boot = $('#boot'), bootlog = $('#bootlog');
let booted = false;
function endBoot() { if (booted) return; booted = true; if (!RM) try { glitch({intro: 750}); } catch (e) {} boot.classList.add('gone'); setTimeout(() => boot.remove(), 450); $('#cmd').blur(); sessionStorage.grimBooted = 1; }
const WXLINK = new URLSearchParams(location.search).has('wx'); // thomasgrim.com/weather → /?wx=1
if (sessionStorage.grimBooted || RM || WXLINK) { boot.remove(); booted = true; }
else { let i = 0; const step = () => { if (booted) return; if (i < bootLines.length) { bootlog.textContent += bootLines[i++] + '\n'; setTimeout(step, 60 + Math.random() * 110); } else setTimeout(endBoot, 1500); }; step();
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
 const s = new URLSearchParams(location.search).get('t'), sl = x => String(x || '').toLowerCase().replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
 const si = s == null ? -1 : /^\d+$/.test(s) ? (flat[+s - 1] ? +s - 1 : -1) : flat.findIndex(t => sl(t.title) === sl(s) || (t.aliases || []).includes(sl(s))), lo = x => String(x || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
 const si2 = si >= 0 || s == null ? si : flat.findIndex(t => lo(t.title) === lo(s) || (t.aliases || []).some(a => lo(a) === lo(s))); // tolerant: jack-d / jackd / Jack’d
 const at = parseInt(new URLSearchParams(location.search).get('at'), 10); if (si2 >= 0 && at > 0) pendingAt = {i: si2, t: at};
 // shared link (?t=<slug|n>&at=<s>): cue that track exactly like the default one — current track, record, waveform, seek on first play
 const d = si2 >= 0 ? si2 : WXLINK ? Math.random() * flat.length | 0 : flat.findIndex(t => /^redline$/i.test(t.title));
 { if (d >= 0) { cur = d; audio.preload = 'none'; lazySrc = flat[d].file; setRecord(flat[d]); loadWave(flat[d]); select(d); updateNP();
  if (WXLINK) setTimeout(() => { if (!fxs && !mx) weatherFx(false, {link: true}); }, 200);
  if (si2 >= 0) { if (pendingAt) $('#tcur').textContent = fmt(pendingAt.t); setTimeout(() => say(`cued: ${flat[d].title}${pendingAt ? ' @ ' + fmt(pendingAt.t) : ''} — press ▶ PLAY (or space) to start`), 50); } } }
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
 const AC = window.AudioContext || window.webkitAudioContext; try { actx = new AC({latencyHint: 'playback'}); } catch { actx = new AC(); }
 // background-audio fix: Android Chrome suspends/interrupts the context when the tab is backgrounded; since the <audio> is routed
 // through createMediaElementSource, its output dies with the context while the element keeps "playing". Resume whenever we should be audible.
 actx.onstatechange = () => { if (actx.state !== 'running' && !audio.paused) wakeCtx(); applyOut(); };
 // NATIVE mode (Chrome/Android/Firefox): the <audio> element keeps its own native output — so Android treats it as ordinary media
 // (notification, audio focus, background) and a suspended AudioContext can no longer silence or stall playback. Visualizers/FX read
 // a copy via captureStream(); when FX are engaged (and the page is visible) the element is muted and the FX chain becomes audible.
 // Fallback (Safari/iOS: no captureStream): the classic createMediaElementSource graph.
 let src; if (NATIVE) { try { src = streamSrc(); } catch (e) { NATIVE = false; } }
 if (!NATIVE) src = actx.createMediaElementSource(audio);
 an = actx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .75;
 outG = actx.createGain(); outG.gain.value = NATIVE ? 0 : 1; an.connect(outG); outG.connect(actx.destination);
 // spectrum tap: pre-FX/pre-limiter, float dB, volume-compensated + AGC below (was the output analyser in bytes with maxDecibels -30 → loud masters pegged)
 san = actx.createAnalyser(); san.fftSize = 2048; san.smoothingTimeConstant = .6; san.minDecibels = -100; san.maxDecibels = 0; src.connect(san); const sink = actx.createGain(); sink.gain.value = 0; san.connect(sink); sink.connect(actx.destination);
 fxInit(src);
}
let NATIVE = !!(HTMLMediaElement.prototype.captureStream || HTMLMediaElement.prototype.mozCaptureStream) && !/iP(hone|ad|od)/.test(navigator.userAgent), outG = null, boundTrack = null;
function streamSrc() { const st = (audio.captureStream || audio.mozCaptureStream).call(audio), tr = st.getAudioTracks()[0]; if (!tr) { boundTrack = null; return actx.createGain(); } // placeholder until 'playing' rebinds
 boundTrack = tr.id; return actx.createMediaStreamSource(new MediaStream([tr])); }
// the captured track changes whenever src changes → rebind the graph input (cheap, no rebuffering of the element)
function rebindStream() { if (!NATIVE || !actx || !fxg) return; try { const st = (audio.captureStream || audio.mozCaptureStream).call(audio), tr = st.getAudioTracks()[0]; if (!tr || tr.id === boundTrack) return;
 const old = fxg.src; boundTrack = tr.id; fxg.src = actx.createMediaStreamSource(new MediaStream([tr])); try { old.disconnect(); } catch {} fxg.sig = null; fxRoute(); } catch {} }
audio.addEventListener('playing', () => setTimeout(rebindStream, 30)); audio.addEventListener('loadeddata', () => setTimeout(rebindStream, 30));
// who is audible: element (native) or the FX chain. FX are bypassed while the page is hidden so background audio is always native.
function fxEngaged() { try { return Math.abs(fxv.filter) >= 3 || fxv.verb > 0 || fxv.crush > 0; } catch { return false; } }
function applyOut() { if (!NATIVE) { audio.volume = vol; return; } const fxOut = fxEngaged() && !document.hidden && actx && actx.state === 'running';
 audio.volume = fxOut ? 0 : vol; if (outG) outG.gain.setTargetAtTime(fxOut ? vol : 0, actx.currentTime, .01); }
document.addEventListener('visibilitychange', applyOut);
function wakeCtx() { if (actx && actx.state !== 'running' && actx.state !== 'closed') actx.resume().catch(() => {}); }
document.addEventListener('visibilitychange', () => { if (!audio.paused) wakeCtx(); msState(); });
addEventListener('pageshow', () => { if (!audio.paused) wakeCtx(); }); addEventListener('focus', () => { if (!audio.paused) wakeCtx(); });
audio.addEventListener('playing', wakeCtx);
setInterval(() => { if (!audio.paused) wakeCtx(); }, 2000); // watchdog (throttled to ~1/min when hidden, still harmless)
// keep the Android notification alive across track changes: swapping src fires pause/emptied with currentTime 0 — reporting 'none'
// there made Chrome drop the media notification between songs. While switching, keep reporting 'playing'; never 'none' while a track is loaded.
let switching = 0, switchTO = 0, endIdle = false; // 'pause' fires just before 'ended' on auto-advance
function msState() { if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = (switching || isPlaying() || (audio.ended && !endIdle)) ? 'playing' : (cur >= 0 ? 'paused' : 'none'); posState(); } }
['play', 'pause', 'playing', 'ratechange', 'durationchange'].forEach(ev => audio.addEventListener(ev, () => msState()));
/* ---------- background handoff ----------
 Root cause of Android background dropouts: <audio> is captured by createMediaElementSource, so its ONLY output is the AudioContext.
 Android Chrome suspends/throttles that context (and timers) in background tabs, so sound stops even though the element still "plays";
 resuming afterwards (400e131) races the OS. Fix: when the page is hidden, hand playback to a second, untapped <audio> (native media
 output, keeps the media notification) at the same position; hand back to the Web Audio path (FX/visualizers) when visible again. */
const bgEl = new Audio(); bgEl.preload = 'auto'; bgEl.setAttribute('aria-hidden', 'true'); let bgMode = false, handing = false;
const outEl = () => bgMode ? bgEl : audio, isPlaying = () => !outEl().paused;
function outPause() { outEl().pause(); }
function toBg() { if (!BG_HANDOFF || bgMode || handing || audio.paused || !actx || !audio.currentSrc) return; handing = true;
 bgEl.src = audio.currentSrc; bgEl.volume = audio.volume; bgEl.muted = audio.muted; bgEl.loop = false;
 const go = () => { try { bgEl.currentTime = audio.currentTime; } catch {} bgEl.play().then(() => { bgMode = true; handing = false; audio.pause(); msState(); }, () => { handing = false; wakeCtx(); }); };
 bgEl.readyState >= 1 ? go() : bgEl.addEventListener('loadedmetadata', go, {once: true}); }
function toFg() { if (!bgMode) return; const t = bgEl.currentTime, src = bgEl.currentSrc, was = !bgEl.paused; bgMode = false;
 if (audio.currentSrc !== src) audio.src = src; const go = () => { try { audio.currentTime = t; } catch {} if (was) { wakeCtx(); audio.play().then(() => bgEl.pause(), () => { bgMode = true; }); } else bgEl.pause(); updateNP(); msState(); };
 audio.readyState >= 1 ? go() : audio.addEventListener('loadedmetadata', go, {once: true}); }
bgEl.addEventListener('ended', () => { if (bgMode) onEnded(); });
['play', 'pause', 'playing'].forEach(ev => bgEl.addEventListener(ev, () => { if (bgMode) msState(); }));
bgEl.addEventListener('timeupdate', () => { if (bgMode) { const el = $('#tcur'); if (el) el.textContent = fmt(bgEl.currentTime); } });
// handoff DISABLED (caused stutter/cutouts on Android after fa6a2f2) — single-element playback + 400e131 resume logic only
const BG_HANDOFF = false;
window.__bg = () => ({bgMode, bgPaused: bgEl.paused, bgT: bgEl.currentTime, bgSrc: bgEl.currentSrc.split('/').pop(), aPaused: audio.paused, aT: audio.currentTime, ctx: actx && actx.state, cur});
function shareUrl() { const t = curT(); if (!t || secret) return null; const i = flat.indexOf(t), sec = Math.floor(outEl().currentTime || 0), slug = t.title.toLowerCase().replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
 return {t, sec, url: `${location.origin}/?t=${slug || i + 1}${sec > 3 ? '&at=' + sec : ''}`}; }
function toast(html) { let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
 el.innerHTML = html; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), 1800); }
function shareTrack(btn) { const s = shareUrl(); if (!s) { if (btn) toast('<span class="p">$</span> share: pick a track first'); return say('share: nothing playing — pick a track first'); }
 window.tgTrack('share', s.t.title); const title = 'tomGRIM - ' + s.t.title;
 const copied = ok => { say(`share: ${ok ? 'copied' : 'link'} → <a href="${escH(s.url)}">${escH(s.url)}</a>${s.sec > 3 ? ' (starts at ' + fmt(s.sec) + ')' : ''}`, true); if (btn) toast(ok ? '<span class="p">$</span> share: link copied' : escH(s.url)); };
 const copy = () => navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(s.url).then(() => copied(1), () => copied(0)) : copied(0);
 if (btn && navigator.share && matchMedia('(pointer:coarse)').matches) navigator.share({title, text: title, url: s.url}).catch(e => { if (e && e.name !== 'AbortError') copy(); }); else copy(); }
const isLoopAlbum = t => t && t.al.type === 'loops';
function effRepeat() { const t = flat[cur]; if (t && isLoopAlbum(t)) return loopOverride[t.ai] ?? (repeat === 'off' ? 'one' : repeat); return repeat; }
window.tgTrack = function (kind, title) { try { const gc = window.goatcounter; if (!gc || typeof gc.count !== 'function') return;
 const slug = String(title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
 gc.count({path: kind + '/' + slug, title: String(title || ''), event: true}); } catch (e) {} };
let pendingAt = null, lazySrc = null; // default track: no audio bytes until the first play
const playedOnce = {};
document.getElementById('bshare')?.addEventListener('click', () => shareTrack(true)); let ringAgc = .1, secret = null;
const curT = () => secret || flat[cur];
function play(i) {
 secret = null; intent = 'play';
 if (i == null || !flat[i]) i = sel >= 0 && flat[sel] ? sel : 0;
 ensureCtx();
 if (i !== cur || !playedOnce[i]) { playedOnce[i] = 1; window.tgTrack('play', flat[i].title); }
 if (lazySrc) { if (i === cur) audio.src = lazySrc; lazySrc = null; audio.preload = 'metadata'; }
 if (i !== cur) { switching = 1; clearTimeout(switchTO); switchTO = setTimeout(() => { switching = 0; msState(); }, 8000); setMediaMeta(flat[i]); cur = i; audio.src = flat[i].file; setRecord(flat[i]); loadWave(flat[i]); }
 if (pendingAt && pendingAt.i === i) { const t0 = pendingAt.t; pendingAt = null; const go = () => { try { audio.currentTime = Math.min(t0, (audio.duration || t0 + 1) - 1); } catch {} }; audio.readyState >= 1 ? go() : audio.addEventListener('loadedmetadata', go, {once: true}); }
 setMediaMeta(flat[i]); trackMood(flat[i]);
 if (bgMode) { const f = new URL(flat[i].file, location.href).href; if (bgEl.src !== f) bgEl.src = f; bgEl.play().catch(() => {}); } else
 audio.play().catch(err => say('play blocked: ' + err.message));
 select(i); updateNP();
}
function toggle() { if (cur < 0 || !isPlaying()) play(cur < 0 ? sel : cur); else { userPaused = true; outPause(); } }
// stall recovery: if we're meant to be playing but the playhead hasn't moved for ~9s while starving (network/decoder hiccup), reload at
// the same position. Never fights a deliberate pause (user, notification, headset, or a phone call → those leave the element paused).
let userPaused = false, stallT = -1, stallN = 0, stallTries = 0;
audio.addEventListener('play', () => { userPaused = false; endIdle = false; }); audio.addEventListener('playing', () => { switching = 0; stallTries = 0; audio.preload = 'auto'; msState(); });
// HARDENED (Tom: "audio randomly started"): Android can freeze a focus-lost element WITHOUT setting paused, so a frozen playhead alone
// is NOT a reason to restart. Recover only in the foreground, after a real 'waiting'/'stalled' (network starvation), with no external pause since.
let sawStarve = false, intent = 'pause'; // intent: only ever 'play' via an explicit play()/toggle/media-key; any external pause flips it
audio.addEventListener('pause', () => { if (!switching && !audio.ended) intent = 'pause'; });
 audio.addEventListener('waiting', () => { sawStarve = true; }); audio.addEventListener('stalled', () => { sawStarve = true; });
audio.addEventListener('pause', () => { if (!switching) { sawStarve = false; stallN = 0; } }); audio.addEventListener('playing', () => { sawStarve = false; });
setInterval(() => { if (intent !== 'play' || audio.paused || audio.ended || !audio.src || userPaused || document.hidden || !sawStarve) { stallN = 0; return; } if (audio.currentTime !== stallT) { stallT = audio.currentTime; stallN = 0; return; }
 if (++stallN < 3 || audio.readyState >= 3 || stallTries >= 3) return; stallN = 0; stallTries++; const t = audio.currentTime;
 audio.load(); audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = t; } catch {} }, {once: true}); if (intent === 'play' && !userPaused && !document.hidden) audio.play().catch(() => {}); }, 3000);
function next(d = 1) {
 if (!flat.length) return;
 let i;
 if (shuffle) { const inLoops = isLoopAlbum(flat[cur]), pool = flat.map((t, k) => k).filter(k => k !== cur && (inLoops || !isLoopAlbum(flat[k]))); i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : (cur + 1) % flat.length; }
 else i = ((cur < 0 ? sel : cur) + d + flat.length) % flat.length;
 play(i);
}
function onEnded() { trackMood(null); if (secret) { secret = null; return next(1); } const r = effRepeat(); if (r === 'one') { const el = bgMode ? bgEl : audio; el.currentTime = 0; if (intent === 'play') el.play(); } else if (r === 'all' || shuffle || cur < flat.length - 1) next(1); else { endIdle = true; msState(); } }
audio.addEventListener('ended', () => { if (!bgMode) onEnded(); });
audio.addEventListener('play', updateNP); audio.addEventListener('pause', updateNP);
audio.addEventListener('loadedmetadata', updateNP);
audio.addEventListener('error', () => { switching = 0; msState(); }); audio.addEventListener('error', () => say('error: cannot load ' + (curT()?.file || '')));
audio.addEventListener('timeupdate', () => { $('#tcur').textContent = fmt(audio.currentTime); });
const COVERS = ['ember-hours', 'elements', 'night-signals', 'phosphor-cache', 'get-out', 'soundtracks', 'remixes'];
let lastMeta = '';
function artFor(t) { const id = t && COVERS.includes(t.al.id) ? t.al.id : 'tomgrim-default', base = new URL('assets/covers/', location.href).href;
 return [96, 192, 256, 512].map(s => ({src: `${base}${id}-${s}.png`, sizes: `${s}x${s}`, type: 'image/png'})); }
function setMediaMeta(t, force) { if (!t) return; audio.title = `${t.id3_title || t.title} — ${t.id3_artist || 'tomGRIM'}`; if (!('mediaSession' in navigator) || !window.MediaMetadata) return; const key = t.file; if (key === lastMeta && !force && navigator.mediaSession.metadata) return; lastMeta = key;
 navigator.mediaSession.metadata = new MediaMetadata({title: t.id3_title || t.title, artist: t.id3_artist || 'tomGRIM', album: t.single ? 'Single' : t.al.title, artwork: artFor(t)}); }
function posState() { try { const el = outEl(); if ('mediaSession' in navigator && el.duration && isFinite(el.duration)) navigator.mediaSession.setPositionState({duration: el.duration, playbackRate: el.playbackRate || 1, position: Math.min(el.currentTime, el.duration)}); } catch {} }
if ('mediaSession' in navigator) { const ms = navigator.mediaSession, h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
 // idempotent: act on the element's real state, then re-assert it (a stale notification could otherwise toggle the wrong way)
 h('play', () => { if (isPlaying()) msState(); else play(cur < 0 ? sel : cur); }); h('pause', () => { if (isPlaying()) { userPaused = true; outPause(); } else msState(); }); h('nexttrack', () => next(1)); h('previoustrack', () => next(-1));
 h('seekto', e => { const el = outEl(); if (e.fastSeek && 'fastSeek' in el) el.fastSeek(e.seekTime); else el.currentTime = e.seekTime; posState(); });
 h('seekbackward', e => seek(-(e.seekOffset || 10))); h('seekforward', e => seek(e.seekOffset || 10));
 audio.addEventListener('loadedmetadata', posState); audio.addEventListener('seeked', posState);
 audio.addEventListener('play', () => { ms.playbackState = 'playing'; posState(); });
 audio.addEventListener('playing', () => { setMediaMeta(curT(), true); ms.playbackState = 'playing'; posState(); });
 audio.addEventListener('durationchange', posState); audio.addEventListener('pause', () => msState()); }
function updateNP() {
 const t = curT();
 $('#nptitle').textContent = t ? (!isPlaying() ? '❚❚ ' : '▶ ') + t.title + (t.special ? ' ★' : '') : '▶ select a track';
 $('#npalbum').textContent = t ? `${data.artist || 'tomGRIM'} — ${t.al.title}${t.al.year ? ' (' + t.al.year + ')' : ''}${t.bpm ? ' · ' + Math.round(t.bpm) + ' bpm' : ''}` : '—';
 $('#tdur').textContent = fmt(audio.duration || t?.duration_sec);
 const b = $('#bplay'); b.textContent = !isPlaying() ? '▶ PLAY' : '❚❚ PAUSE'; b.setAttribute('aria-label', !isPlaying() ? 'Play' : 'Pause');
 document.title = t && !!isPlaying() ? `▶ ${t.title} · tomGRIM` : 'tomGRIM :: GRIM/OS terminal';
 mark(); updateModes();
 setMediaMeta(t);
}
function updateModes() {
 const t = flat[cur], r = effRepeat();
 $('#brep').textContent = 'rep:' + r + (t && isLoopAlbum(t) ? '·lp' : '');
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
function setVol(v) { vol = Math.max(0, Math.min(1, v)); applyOut(); updateModes(); }
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
const recGeom = {cw: 6.6, lh: 11, R: 104, ox: 150, oy: 130};
function measureRec() { const cs = getComputedStyle(coverEl), pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
 const w = coverEl.clientWidth - 2 * pl, h = coverEl.clientHeight - 2 * pt; if (w > 0 && h > 0) { recGeom.cw = w / 37; recGeom.lh = h / 19; recGeom.R = Math.min(w, h) / 2 * .86;  const wr = document.getElementById('ring').getBoundingClientRect(), cr = coverEl.getBoundingClientRect(); recGeom.ox = cr.left + cr.width / 2 - wr.left; recGeom.oy = cr.top + cr.height / 2 - wr.top; } }
{ const ro = new ResizeObserver(() => { measureRec(); drawRecord(); }); ro.observe(coverEl); ro.observe(document.getElementById('ring')); }
function drawRecord() {
 const W = 37, H = 19, cx = (W - 1) / 2, cy = (H - 1) / 2, [, chars, arms, tight] = rec.pal, a = rec.ang; let out = '';
 // true circle: convert cells to CSS px using the measured character box (chars are ~0.6:1, rows 1:1)
 const cwp = recGeom.cw, lhp = recGeom.lh, R = Math.min((W / 2) * cwp, (H / 2) * lhp) * .86; // leave an even gap for the scope
 for (let y = 0; y < H; y++) { let line = '';
  for (let x = 0; x < W; x++) { const dx = (x - cx) * cwp / R, dy = (y - cy) * lhp / R, r = Math.hypot(dx, dy); let th = Math.atan2(dy, dx);
   if (r > 1.0) { line += ' '; continue; }
   if (r > .955) { line += '<span class="g">' + (y === 0 || y === H - 1 ? '─' : '·') + '</span>'; continue; }
   if (r < .47) { // 12" style: edge ring, colored label (~38% of diameter), black spindle hole
    if (r >= .37) { line += '<span class="e">' + (Math.abs(dy) > Math.abs(dx) * 1.6 ? '━' : Math.abs(dx) > Math.abs(dy) * 1.6 ? '┃' : '●') + '</span>'; continue; }
    const row = y - Math.round(cy), lw = rec.title.length, col = x - Math.round(cx);
    if (row === 0 && col === 0) { line += '<span class="hole">●</span>'; continue; }
    if (row === -2 && col === 0) { line += '<span class="lf l">' + esc(rec.label) + '</span>'; continue; }
    if (row === 2 && Math.abs(col) <= lw / 2 && lw) { const ch = rec.title[col + Math.floor(lw / 2)]; line += '<span class="lf l">' + esc(ch || ' ') + '</span>'; continue; }
    line += '<span class="lf">' + (Math.sin((th + a) * 3) > .75 ? '·' : ' ') + '</span>'; continue; }
   const sp = Math.sin(th * arms - r * tight * 6.283 + a * arms), groove = Math.sin(r * 58 + (rec.seed % 7));
   const shine = Math.cos(th - a - 0.9) ; // rotating highlight
   let v = (sp * .5 + .5) * .7 + (groove > .55 ? .3 : 0); if (shine > .93) v = 1;
   const ch = chars[Math.min(chars.length - 1, Math.floor((1 - v) * chars.length))];
   line += sp > .82 ? '<span class="a">' + esc(ch) + '</span>' : '<span class="v">' + esc(ch) + '</span>'; }
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
  // precomputed peaks (scripts/make-waves.py): ~4 KB instead of downloading the whole MP3 a second time
  try { const r = await fetch(t.file.replace(/^assets\//, 'assets/waves/').replace(/\.mp3$/, '.json')); if (r.ok) { waveCache[t.file] = Float32Array.from(await r.json(), v => v / 99); return; } } catch {}
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
function refreshColors() { colors = {fg:css('--fg'), dim:css('--dim'), hi:css('--hi'), acc:css('--acc'), ring:css('--ring') || css('--fg')}; }
// perf: canvas shadowBlur at phone DPR (2.6x) was the main-thread hotspot (~95% CPU at 6x throttle) → glow faked with a wide translucent stroke, ring canvas capped at 1.5x
const RING_D = 1.5;
function fitCanvas(c, maxD) { const dp = Math.min(devicePixelRatio, maxD || 9), w = c.clientWidth * dp | 0, h = c.clientHeight * dp | 0; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
let waveKey = '';
function drawWave() {
 fitCanvas(wave, 2); const W = wave.width, H = wave.height;
 const t = curT(), p = t && waveCache[t.file], pos = audio.duration ? audio.currentTime / audio.duration : 0;
 const key = W + 'x' + H + ':' + (t && t.file) + ':' + (p && p.length) + ':' + Math.round(pos * W) + ':' + colors.fg; if (key === waveKey) return; waveKey = key; // perf: redraw only when the playhead moves a pixel
 wg.clearRect(0, 0, W, H);
 if (p && p.length) { const bw = W / p.length;
  for (let i = 0; i < p.length; i++) { const h = Math.max(1, p[i] * H * .95); wg.fillStyle = i / p.length < pos ? colors.fg : colors.dim; wg.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - .5), h); } }
 else { wg.fillStyle = colors.dim; wg.font = 14 * devicePixelRatio + 'px monospace'; wg.fillText(t ? (p === 'loading' ? 'decoding waveform…' : 'waveform n/a') : 'no track loaded', 8, H / 2 + 5); }
 wg.fillStyle = colors.hi; wg.fillRect(pos * W - 1, 0, 2, H);
 wave.setAttribute('aria-valuenow', Math.round(pos * 100));
}
function waveSeek(e) { if (!audio.duration) return; const r = wave.getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration; }
let dragging = false;
/* mouse: click/drag seeks immediately. touch/pen: tap to arm, then tap or horizontal drag seeks; vertical moves scroll. */
const waveBox = wave.closest('.vizbox'), waveLbl = waveBox.querySelector('.lbl'), coarse = matchMedia('(pointer:coarse)').matches;
const WL = {idle: coarse ? 'WAVEFORM · tap to arm' : 'WAVEFORM · click to seek', armed: 'WAVEFORM · armed · tap/drag to seek'};
waveLbl.textContent = WL.idle; let armed = false, armT = 0, tp = null;
const arm = on => { armed = on; clearTimeout(armT); waveBox.classList.toggle('armed', on); waveLbl.textContent = on ? WL.armed : WL.idle; if (on) armT = setTimeout(() => arm(false), 4000); };
wave.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { dragging = true; wave.setPointerCapture(e.pointerId); waveSeek(e); return; }
 tp = {x: e.clientX, y: e.clientY, id: e.pointerId, mode: null}; if (armed) arm(true); });
wave.addEventListener('pointermove', e => { if (dragging) return waveSeek(e); if (!tp || e.pointerId !== tp.id) return; const dx = e.clientX - tp.x, dy = e.clientY - tp.y;
 if (!tp.mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { tp.mode = Math.abs(dx) > Math.abs(dy) * 1.2 && armed ? 'drag' : 'scroll'; if (tp.mode === 'drag') { try { wave.setPointerCapture(e.pointerId); } catch {} } }
 if (tp.mode === 'drag') { waveSeek(e); arm(true); } });
wave.addEventListener('pointerup', e => { if (dragging) { dragging = false; return; } if (!tp || e.pointerId !== tp.id) return; const m = tp.mode; tp = null;
 if (m === 'scroll') return; if (m === 'drag') return arm(false); if (armed) { waveSeek(e); arm(false); } else arm(true); });
wave.addEventListener('pointercancel', () => { tp = null; dragging = false; });
document.addEventListener('pointerdown', e => { if (armed && !waveBox.contains(e.target)) arm(false); }, true);
window.__wave = () => ({armed, label: waveLbl.textContent, t: audio.currentTime});

/* ---------- visuals loop ---------- */
const specEl = $('#spec'), ring = $('#ring'), rg = ring.getContext('2d');
const BLK = ' ▁▂▃▄▅▆▇█'; let peaks = [], fbuf, tbuf, idle = 0, san = null, ffb = null, agc = -30;
let cw = 0, NBc = 32;
function measure() { const m = document.createElement('span'); m.textContent = '█'.repeat(20); specEl.appendChild(m); cw = m.getBoundingClientRect().width / 20 || 8; m.remove();
 const w = specEl.clientWidth || 300; NBc = Math.max(12, Math.floor(w / cw)); specEl.style.letterSpacing = ((w - NBc * cw) / NBc) + 'px'; }
new ResizeObserver(measure).observe(specEl);
const COARSE = matchMedia('(pointer:coarse)').matches; let lastFrame = 0;
function frame() {
 if (COARSE) { const now = performance.now(); if (now - lastFrame < 31) return requestAnimationFrame(frame); lastFrame = now; } // perf: ~30 fps visualizers on phones
const playing = actx && !audio.paused; const NB = NBc, ROWS = Math.max(6, Math.floor((specEl.clientHeight || 100) / 12) - 1); let vals = new Array(NB).fill(0);
 if (san && playing) { ffb = ffb || new Float32Array(san.frequencyBinCount); san.getFloatFrequencyData(ffb);
  const n = ffb.length, nyq = (actx.sampleRate || 44100) / 2, f0 = 30, f1 = Math.min(16000, nyq);
  const vc = !NATIVE && audio.volume > .001 ? -20 * Math.log10(audio.volume) : 0; // undo the volume slider (no-op on iOS where volume is fixed at 1)
  const db = new Array(NB); let fmax = -200;
  for (let b = 0; b < NB; b++) { const fa = f0 * Math.pow(f1 / f0, b / NB), fb = f0 * Math.pow(f1 / f0, (b + 1) / NB);
   const lo = fa / nyq * n, hi = fb / nyq * n; let m = -200;
   if (hi - lo < 1) { const k = Math.floor(lo), fr = lo - k; m = ffb[k] * (1 - fr) + (ffb[k + 1] ?? ffb[k]) * fr; }
   else for (let k = Math.floor(lo); k < Math.ceil(hi); k++) m = Math.max(m, ffb[k]);
   m += vc + 4.5 * Math.log2(fa / 200 + 1) * .5; // gentle treble tilt in dB (pink-noise-ish), not a multiplier
   db[b] = m; if (m > fmax) fmax = m; }
  if (isFinite(fmax)) agc = fmax > agc ? agc + (fmax - agc) * .5 : Math.max(-60, agc - .12); // fast attack, slow release
  const top = agc + 4, range = 42; // ~4 dB headroom above the recent peak
  for (let b = 0; b < NB; b++) vals[b] = Math.max(0, Math.min(1, (db[b] - (top - range)) / range)) ** 1.5; }
 window.__specStat = vals; window.__specDbg = () => ({san: !!san, agc, ff: ffb && Array.from(ffb.slice(0, 6))});
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
 fitCanvas(ring, RING_D); { const W = ring.width, H = ring.height, d = Math.min(devicePixelRatio, RING_D), pad = parseFloat(getComputedStyle(ring.parentElement).paddingLeft) * d || 22 * d;
  // concentric with the record: same center as the ASCII disc, true circle in device px
  const sx = W / (ring.clientWidth || 1), sy = H / (ring.clientHeight || 1); // offsets cached on resize (no per-frame getBoundingClientRect → no forced layout)
  const cx = recGeom.ox * sx, cy = recGeom.oy * sy, amp = pad / 2 - 2 * d;
  const rr = Math.min(recGeom.R * sx + amp + 9 * d, cx - amp - d, cy - amp - d, W - cx - amp - d, H - cy - amp - d), rx = rr, ry = rr; rg.clearRect(0, 0, W, H);
  rg.strokeStyle = colors.dim; rg.globalAlpha = .35; rg.lineWidth = d; rg.beginPath(); rg.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); rg.stroke(); rg.globalAlpha = 1;
  const live = an && playing; let gain = 1;
  if (live) { tbuf = tbuf || new Uint8Array(an.fftSize); an.getByteTimeDomainData(tbuf); let sq = 0; for (let i = 0; i < tbuf.length; i += 4) { const x = (tbuf[i] - 128) / 128; sq += x * x; }
   const rms = Math.sqrt(sq / (tbuf.length / 4)); ringAgc = Math.max(rms, ringAgc * .992, .02); gain = Math.min(9, Math.max(1.5, .55 / ringAgc)); }
  const N = 240; for (const [col, lw, al] of [[colors.ring || colors.fg, 8, .18], [colors.ring || colors.fg, 2.6, 1], [colors.hi, 1.1, 1]]) { rg.strokeStyle = col; rg.lineWidth = lw * d; rg.globalAlpha = al; rg.beginPath();
   for (let i = 0; i <= N; i++) { const t = i % N, a = t / N * Math.PI * 2 - Math.PI / 2; let v; if (live) { const k = Math.floor(t / N * (tbuf.length - 1)), raw = (tbuf[k] - 128) / 128; let lp = 0; for (let q = -12; q <= 12; q += 3) lp += (tbuf[(k + q + tbuf.length) % tbuf.length] - 128) / 128; v = Math.tanh((raw + lp / 9 * .9) * gain); } else v = Math.sin(t / 6 + idle * 3) * .06; const o = Math.max(-.35, Math.min(1, v)) * amp, x = cx + Math.cos(a) * (rx + o), y = cy + Math.sin(a) * (ry + o); i ? rg.lineTo(x, y) : rg.moveTo(x, y); }
   rg.closePath(); rg.stroke(); } rg.globalAlpha = 1; }
 drawWave(); spinRecord(performance.now());
 requestAnimationFrame(frame);
}

/* ---------- shell ---------- */
const out = $('#out'), cmd = $('#cmd'); const hist = []; let hp = 0;
function say(html, raw) { const d = document.createElement('div'); if (raw) d.innerHTML = html; else if (typeof ansi === 'function' && (String(html).includes('\x1b') || ERRRE.test(html))) d.innerHTML = ansi(String(html).includes('\x1b') ? html : String(html).split('\n').map(l => ERRRE.test(l) ? '\x1b[31m' + l + '\x1b[0m' : l).join('\n')); else d.textContent = html; out.appendChild(d); out.scrollTop = out.scrollHeight; }
/* ---------- ANSI colors + syntax highlighting ---------- */
const E = '\x1b[', A = (c, s) => E + c + 'm' + s + E + '0m';
const escH = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
function ansi(str) { let o = '', st = {}, open = false; const parts = String(str).split(/\x1b\[([\d;]*)m/);
 const flush = () => { const c = []; if (st.fg != null) c.push('a' + st.fg); if (st.bg != null) c.push('ab' + st.bg); if (st.b) c.push('ab-b'); if (st.d) c.push('ab-d'); if (st.i) c.push('ab-i'); if (st.u) c.push('ab-u'); return c.length ? `<span class="${c.join(' ')}">` : ''; };
 for (let k = 0; k < parts.length; k++) { if (k % 2 === 0) { if (!parts[k]) continue; const sp = flush(); o += sp + escH(parts[k]) + (sp ? '</span>' : ''); continue; }
  for (const n of (parts[k] || '0').split(';').map(Number)) { if (n === 0) st = {}; else if (n === 1) st.b = 1; else if (n === 2) st.d = 1; else if (n === 3) st.i = 1; else if (n === 4) st.u = 1; else if (n === 22) st.b = st.d = 0; else if (n === 23) st.i = 0; else if (n === 24) st.u = 0;
   else if (n >= 30 && n <= 37) st.fg = n - 30 + (st.b ? 0 : 0); else if (n >= 90 && n <= 97) st.fg = n - 90 + 8; else if (n === 39) st.fg = null; else if (n >= 40 && n <= 47) st.bg = n - 40; else if (n >= 100 && n <= 107) st.bg = n - 100 + 8; else if (n === 49) st.bg = null; } }
 return o; }
const ERRRE = /(command not found|Permission denied|No such file or directory|cannot access|Not a directory|Is a directory|Connection refused|Could not resolve host|^E: |not in the sudoers|No manual entry|usage error|missing operand)/;
function sayA(s) { say(ansi(s), true); }
function hl(line) { let o = '', first = true; const re = /(\s+)|("(?:[^"\\]|\\.)*"?|'[^']*'?)|(\|\||&&|[|;&><])|([^\s|;&><"']+)/g; let m;
 while ((m = re.exec(line))) { const [t, ws, q, op, w] = m;
  if (ws) { o += ws; continue; } if (q) { o += `<span class="sx-str">${escH(q)}</span>`; continue; } if (op) { o += `<span class="sx-op">${escH(op)}</span>`; if (/[|;&]/.test(op)) first = true; continue; }
  let cls; if (first) { first = false; const k = w.toLowerCase(); cls = (typeof CMDS !== 'undefined' && CMDS[k]) || k === 'sudo' ? 'sx-cmd' : 'sx-bad'; if (k === 'sudo') first = true; }
  else if (/^--?[A-Za-z]/.test(w)) cls = 'sx-flag'; else if (/^\$(\w+|\{\w+\})$/.test(w) || /\$\w/.test(w)) cls = 'sx-var'; else if (/^-?\d+(\.\d+)?%?$/.test(w)) cls = 'sx-num';
  else if (/[\/~]|\.\w{1,4}$/.test(w)) cls = 'sx-path'; else cls = 'sx-arg';
  if (cls === 'sx-var') o += `<span class="sx-var">${escH(w).replace(/(\$\w+|\$\{\w+\})/g, '<i>$1</i>')}</span>`; else o += `<span class="${cls}">${escH(w)}</span>`; }
 return o; }
const promptHtml = () => { const p = prompt(); const m = p.match(/^([^:]+):(.*)\$$/); return m ? `<span class="pr-uh">${escH(m[1])}</span>:<span class="pr-path">${escH(m[2])}</span>$` : escH(p); };
function sayCmd(v) { say(promptHtml() + ' ' + hl(v), true); }
function colorHelp(s) { return s.split('\n').map(l => { const m = l.match(/^(\w+:)(\s+)(.*)$/); const head = m ? A('1;35', m[1]) + m[2] : '', body = m ? m[3] : l;
 return head + body.split(/(\s+)/).map(w => /^\s+$/.test(w) || !w ? w : /^<.*>$|^\[.*\]$/.test(w) ? A('2', w) : /^--?\w/.test(w) ? A('35', w) : /^\(|\)$|^·$|^\(.*\)$/.test(w) ? A('2', w) : /^[a-z][\w-]*[,]?$/i.test(w) && (typeof CMDS !== 'undefined' && CMDS[w.replace(/,$/, '')]) ? A('1;33', w) : /\|/.test(w) && !/[<>]/.test(w) ? w.split('|').map(x => typeof CMDS !== 'undefined' && CMDS[x] ? A('1;33', x) : x).join(A('2', '|')) : w).join(''); }).join('\n'); }
const HELP = () => [
 ['shell', 'help ls albums pause stop next prev bio links mail irc clear themes repeat shuffle whoami fetch', [['help', '[section|cmd|-a]', 'this help (? works the same)'], ['share', '', 'copy a link to this track at this moment'], ['play', '<n|name>', 'play a track by number or name'], ['theme', '<' + THEMES.join('|') + '>', 'switch color theme'], ['crt', 'on|off', 'CRT filter'], ['vol', '<0-100>', 'set volume'], ['man', '<cmd>', 'manual page for a command']]],
 ['get', '', [['get', '<n|name>', 'download a track'], ['get album', '<name>', 'download a whole album'], ['get', '--list', 'list everything downloadable']], 'aliases: wget, curl -O'],
 ['net', 'mail irc', [], 'mail = contact form · irc = #tomgrim on irc.unrealircd.org'],
 ['fun', 'weather matrix glitch fire hack starfield plasma tunnel rain dvd life cube torus donut snow pipes', [['cowsay', '<text>', 'a cow says it']], 'any key or click exits an effect'],
 ['system', 'pwd dir history cls hostname date uptime ifconfig top htop ps neofetch exit', [['cd', '<dir>', 'change directory'], ['ls', '-la [path]', 'list files'], ['cat', '<file>', 'print a file'], ['echo', '<text>', 'print text'], ['uname', '-a', 'system info'], ['ping', '<host>', 'ping a host'], ['ip', 'a', 'network interfaces'], ['df', '-h', 'disk usage'], ['free', '-h', 'memory usage'], ['which', '<cmd>', 'locate a command'], ['ssh', '<host>', 'connect (sort of)'], ['curl', '<url>', 'fetch a url'], ['apt', 'install <pkg>', 'install a package'], ['sudo', '<cmd>', 'try your luck']]],
 ['fx', '', [['fx', '', 'show knob values'], ['fx', 'reset', 'all knobs back to default'], ['fx', '<filter|res|verb|crush> <value>', 'set a knob (or drag it)']]],
 ['look', '', [['colors', 'on|off', 'ANSI colors in the terminal']]],
 ['idle', '', [['screensaver', 'on|off|<seconds>|<effect>|random', 'default on, 60s']]]];
function hlHelp(c, ar) { const w = c.split(' '); return `<span class="sx-cmd">${escH(w[0])}</span>` + w.slice(1).map(x => ' <span class="sx-arg">' + escH(x) + '</span>').join('') + (ar ? ' ' + ar.split(' ').map(t => t.split(/(\|)/).map(x => x === '|' ? '<span class="sx-op">|</span>' : `<span class="${/^-/.test(x) ? 'sx-flag' : /^</.test(x) || /^\[/.test(x) ? 'sx-var' : /^\d/.test(x) ? 'sx-num' : 'sx-arg'}">${escH(x)}</span>`).join('')).join(' ') : ''); }
const RUNNABLE = new Set(['matrix', 'glitch', 'fire', 'hack', 'weather', 'starfield', 'plasma', 'tunnel', 'rain', 'dvd', 'life', 'cube', 'torus', 'donut', 'snow', 'pipes']);
function helpSec([name, flow, rows, note]) { const fl = flow.split(' ').filter(Boolean).map(c => RUNNABLE.has(c) ? `<button type="button" class="getlink runlink" data-run="${escH(c)}" title="start ${escH(c)}"><b>${escH(c)}</b></button>` : '<b>' + escH(c) + '</b>').join('<span class="sep"> • </span>');
 return `<div class="hs">${name}:</div>` + (fl ? `<div class="hf">${fl}</div>` : '') + rows.map(([c, ar, d]) => `<div class="hr"><span class="hc">${hlHelp(c, ar)}</span><span class="hd">${escH(d)}</span></div>`).join('') + (note ? `<div class="hf hn">${escH(note)}</div>` : ''); }
function helpCmd(a) { a = (a || '').trim().toLowerCase(); const H = HELP();
 if (!a || a === '-a' || a === '--all') return say('<div class="helpout">' + (a ? '' : '<div class="hn">help &lt;section&gt; · help &lt;cmd&gt; · help -a · ? works the same</div>') + H.map(helpSec).join('') + '</div>', true);
 const sec = H.find(x => x[0] === a); if (sec) return say('<div class="helpout">' + helpSec(sec) + '</div>', true);
 if (MAN[a]) return CMDS.man(a);
 const hit = H.filter(x => x[1].split(' ').includes(a) || x[2].some(r => r[0].split(' ')[0] === a)); if (hit.length) return say('<div class="helpout">' + hit.map(x => helpSec([x[0], x[1].split(' ').includes(a) ? a : '', x[2].filter(r => r[0].split(' ')[0] === a), ''])).join('') + '</div>', true);
 sayA(`help: no help topics match '${escH(a)}'. try ${A('1', 'help')}`); }
let colorsOn = sessionStorage.grimColors !== 'off'; document.body.classList.toggle('nocolor', !colorsOn);
function colorsCmd(a) { a = (a || '').trim(); if (a === 'off' || a === 'on') { colorsOn = a === 'on'; sessionStorage.grimColors = a; document.body.classList.toggle('nocolor', !colorsOn); return sayA('colors: ' + (colorsOn ? A('1;32', 'on') : 'off')); }
 const T = ' gYw ', bgs = ['', '40m', '41m', '42m', '43m', '44m', '45m', '46m', '47m']; let s = '         ' + bgs.map(b => (b || '').padEnd(6) ).join('').trimEnd() + '\n';
 const rows = [['m', ''], ['1m', '1'], ['30m', '30'], ['1;30m', '1;30'], ['31m', '31'], ['1;31m', '1;31'], ['32m', '32'], ['1;32m', '1;32'], ['33m', '33'], ['1;33m', '1;33'], ['34m', '34'], ['1;34m', '1;34'], ['35m', '35'], ['1;35m', '1;35'], ['36m', '36'], ['1;36m', '1;36'], ['37m', '37'], ['1;37m', '1;37']];
 for (const [lab, code] of rows) { s += lab.padStart(6) + ' ' + A(code || '0', T); for (let b = 0; b < 8; b++) s += ' ' + A((code ? code + ';' : '') + (40 + b), T); s += '\n'; }
 s += '\n' + A('1', 'bold') + ' ' + A('2', 'dim') + ' ' + A('3', 'italic') + ' ' + A('4', 'underline') + '   colors on|off'; sayA(s); }
/* live input highlighting overlay */
const cmdHl = document.createElement('span'); cmdHl.className = 'cmdhl'; cmdHl.setAttribute('aria-hidden', 'true');
{ const wrap = document.createElement('span'); wrap.className = 'cmdwrap'; cmd.before(wrap); wrap.append(cmd, cmdHl); }
let hlLast = null; const hlSync = () => { if (cmd.value !== hlLast) { hlLast = cmd.value; cmdHl.innerHTML = '<span>' + hl(cmd.value) + ' </span>'; } cmdHl.style.transform = `translateX(${-cmd.scrollLeft}px)`; };
['input', 'keyup', 'scroll', 'focus', 'select'].forEach(ev => cmd.addEventListener(ev, hlSync)); setInterval(hlSync, 120);
const LINKS = [['spotify','https://open.spotify.com/artist/1tBp2oza76uuM5bC3fx8Vg'],['apple-music','https://music.apple.com/us/artist/tomgrim/1705139904'],['youtube','https://www.youtube.com/@ig3.productions'],['soundcloud','https://soundcloud.com/thomasgrim']];
const THEMES = ['cyan', 'green', 'amber', 'red', 'gray', 'fire', 'ice', 'silicon', 'nightshift', 'neon'];
const themeSel = $('#themesel'); themeSel.innerHTML = THEMES.map(t => `<option value="${t}">${t}</option>`).join('');
const curTheme = () => (document.body.className.match(/theme-(\w+)/) || [])[1] || 'cyan';
function setTheme(t, quiet) { if (t === 'grey' || t === 'grayscale') t = 'gray'; if (!THEMES.includes(t)) return say('usage: theme ' + THEMES.join('|'));
 document.body.className = document.body.className.replace(/theme-\w+/, 'theme-' + t); if (quiet !== 'mood') { localStorage.grimTheme = t; if (mood) mood.prev = t; } themeSel.value = t; refreshColors(); if (!quiet) say('theme → ' + t); }
themeSel.addEventListener('change', () => setTheme(themeSel.value));
function setCrt(on, quiet) { document.body.classList.toggle('nocrt', !on); localStorage.grimCrt = on ? '1' : '0'; const b = $('#bcrt'); b.textContent = 'CRT:' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', on); if (!quiet) say('crt filter: ' + (on ? 'on' : 'off')); }
$('#bcrt').onclick = () => setCrt(document.body.classList.contains('nocrt'));
/* matrix rain */
let mx = null;
function matrix() { if (mx || fxs) return; const c = document.createElement('canvas'); c.id = 'matrix'; c.setAttribute('aria-label', 'matrix rain, press any key to exit'); document.body.appendChild(c);
 const g = c.getContext('2d'), fs = 16, chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789TOMGRIM♪♫'; let cols, drops;
 const size = () => { c.width = innerWidth; c.height = innerHeight; cols = Math.ceil(c.width / fs); drops = Array.from({length: cols}, () => Math.random() * -40); }; size();
 let last = 0; const stop = () => { if (!mx) return; cancelAnimationFrame(mx.raf); c.remove(); removeEventListener('keydown', onKey, true); const sv = mx.saver; mx = null; if (!sv) say('wake up, tom… the bassline has you.'); };
 const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); stop(); };
 const tick = now => { mx.raf = requestAnimationFrame(tick); if (now - last < 50) return; last = now;
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, c.width, c.height); g.font = fs + 'px monospace';
  for (let i = 0; i < cols; i++) { const y = drops[i] * fs; g.fillStyle = colors.hi; g.fillText(chars[Math.random() * chars.length | 0], i * fs, y); g.fillStyle = colors.fg; g.fillText(chars[Math.random() * chars.length | 0], i * fs, y - fs);
   if (y > c.height && Math.random() > .975) drops[i] = 0; drops[i] += 1; } };
 mx = {raf: requestAnimationFrame(tick), stop, saver: saverMode, name: 'matrix'}; c.addEventListener('pointerdown', dblExit(stop)); setTimeout(() => addEventListener('keydown', onKey, true), 50);
 if (RM) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = colors.fg; g.font = '24px monospace'; g.fillText('MATRIX (reduced motion) — any key to exit', 20, 60); cancelAnimationFrame(mx.raf); } }

/* ---------- fx: glitch / fire / hack / starfield ---------- */
let fxs = null;
function level() { if (an && !audio.paused) { fbuf = fbuf || new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fbuf); let b = 0, m = 0; for (let i = 0; i < 24; i++) b += fbuf[i]; for (let i = 0; i < 256; i++) m += fbuf[i]; return {bass: b / 24 / 255, lvl: m / 256 / 255}; }
 const t = performance.now() / 1000, beat = Math.pow(1 - (t * 2.1 % 1), 3); return {bass: beat * .8, lvl: .25 + beat * .35}; }
let saverMode = false;
function fxRun(name, msg, init, draw, dur, intro) { if (fxs || mx || (dead && name !== 'glitch')) return; refreshColors(); const saver = saverMode; if (saver) msg = ''; const c = document.createElement('canvas'); c.id = 'matrix'; c.className = 'fx-' + name; c.setAttribute('aria-label', name + ' effect, press any key to exit'); document.body.appendChild(c);
 const g = c.getContext('2d'), mob = innerWidth < 760 || matchMedia('(pointer:coarse)').matches, st = {mob, t0: performance.now()};
 const size = () => { const dpr = mob ? 1 : Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr; st.dpr = dpr; init(g, c, st); }; size(); addEventListener('resize', size);
 const stop = () => { if (!fxs) return; cancelAnimationFrame(fxs.raf); clearTimeout(fxs.to); c.remove(); removeEventListener('keydown', onKey, true); removeEventListener('resize', size); fxs = null; if (msg) say(msg); };
 const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); stop(); };
 let last = 0; const step = mob ? 50 : 33;
 const tick = now => { fxs.raf = requestAnimationFrame(tick); if (now - last < step) return; last = now; const t0 = performance.now(); draw(g, c, st, (now - st.t0) / 1000, level()); const dt = performance.now() - t0; window.__fxms = window.__fxms == null ? dt : window.__fxms * .9 + dt * .1; };
 fxs = {raf: 0, stop, name, saver}; window.__fxms = null; if (intro) { msg = ''; c.classList.add('fx-intro'); c.style.pointerEvents = 'none'; fxs.to = setTimeout(() => { c.style.opacity = '0'; setTimeout(stop, 160); }, intro); } else { c.addEventListener('pointerdown', dblExit(stop)); setTimeout(() => addEventListener('keydown', onKey, true), 50); }
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

/* ---------- fx pack 2: plasma tunnel rain dvd life cube snow pipes ---------- */
const RAMP = ' .:-=+*#%@';
function gridInit(st, c, fs) { st.fs = fs * st.dpr; st.cw = st.fs * .6; st.W = Math.ceil(c.width / st.cw); st.H = Math.ceil(c.height / st.fs); }
function pal4() { return [colors.dim, colors.fg, colors.acc, colors.hi]; }
// draw a char buffer (chars + 0..3 color levels) row by row, one fillText per color per row
function drawBuf(g, c, st, ch, lv, bg = '#000') { const {W, H, fs} = st, P = pal4(); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.font = fs + 'px monospace'; g.textBaseline = 'top';
 for (let y = 0; y < H; y++) for (let l = 0; l < 4; l++) { let row = '', any = false; for (let x = 0; x < W; x++) { const i = y * W + x; if (lv[i] === l && ch[i] !== ' ') { row += ch[i]; any = true; } else row += ' '; } if (any) { g.fillStyle = P[l]; g.fillText(row, 0, y * fs); } } }
function beatDet(st, L) { st.avg = st.avg == null ? L.bass : st.avg * .94 + L.bass * .06; const now = performance.now(), hit = L.bass > .28 && L.bass > st.avg * 1.3 && now - (st.lastBeat || 0) > 260; if (hit) st.lastBeat = now; return hit; }
function bufAlloc(st) { st.ch = new Array(st.W * st.H).fill(' '); st.lv = new Uint8Array(st.W * st.H); }
function plasma() { fxRun('plasma', 'plasma cooled.', (g, c, st) => { gridInit(st, c, st.mob ? 14 : 12); bufAlloc(st); st.ph = 0; },
 (g, c, st, t, L) => { const {W, H, ch, lv} = st; st.ph += .04 + L.bass * .12; const p = st.ph, k = 1 + L.bass * .8;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Math.sin(x * .11 * k + p) + Math.sin(y * .17 + p * 1.3) + Math.sin((x + y) * .07 + p * .7) + Math.sin(Math.hypot(x - W / 2, (y - H / 2) * 1.8) * .16 - p * 2), n = (v + 4) / 8, i = y * W + x;
   ch[i] = RAMP[Math.min(9, n * 10 | 0)]; lv[i] = Math.min(3, n * 4 | 0); }
  drawBuf(g, c, st, ch, lv); }); }
function tunnel() { fxRun('tunnel', 'exited the wormhole.', (g, c, st) => { gridInit(st, c, st.mob ? 14 : 12); bufAlloc(st); st.z = 0; },
 (g, c, st, t, L) => { const {W, H, ch, lv} = st; st.z += .05 + L.lvl * .5 + L.bass * .3; const tw = t * .25;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - W / 2) / W, dy = (y - H / 2) / H * 1.1, r = Math.hypot(dx, dy) + .0001, a = Math.atan2(dy, dx), i = y * W + x;
   const u = .35 / r + st.z, v = a / Math.PI * 8 + tw * 4, chk = ((u | 0) + (v + 100 | 0)) & 1, depth = Math.min(1, r * 2.4);
   const b = depth * (chk ? 1 : .45); ch[i] = r < .03 ? ' ' : RAMP[Math.min(9, b * 10 | 0)]; lv[i] = Math.min(3, b * 4 | 0); }
  drawBuf(g, c, st, ch, lv); }); }
function rain() { fxRun('rain', 'the storm passes.', (g, c, st) => { const n = st.mob ? 140 : 340; st.d = Array.from({length: n}, () => ({x: Math.random() * c.width, y: Math.random() * c.height, l: (10 + Math.random() * 30) * st.dpr, v: (8 + Math.random() * 14) * st.dpr})); st.flash = 0; st.bolt = null; },
 (g, c, st, t, L) => { const W = c.width, H = c.height, d = st.dpr; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
  if (beatDet(st, L)) { st.flash = 1; let x = Math.random() * W, y = 0; st.bolt = [[x, y]]; while (y < H * (.5 + Math.random() * .4)) { x += (Math.random() - .5) * 60 * d; y += (20 + Math.random() * 30) * d; st.bolt.push([x, y]); } }
  if (st.flash > .02) { g.fillStyle = colors.hi; g.globalAlpha = st.flash * .35; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
   if (st.bolt) { g.strokeStyle = '#fff'; g.shadowColor = colors.hi; g.shadowBlur = 20 * d; g.lineWidth = 2.5 * d * st.flash; g.beginPath(); st.bolt.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.shadowBlur = 0; } st.flash *= .82; }
  g.lineWidth = 1.2 * d; g.strokeStyle = colors.fg; g.beginPath();
  for (const p of st.d) { p.y += p.v * (1 + L.lvl); p.x -= p.v * .15; if (p.y > H) { p.y = -p.l; p.x = Math.random() * W * 1.2; } g.moveTo(p.x, p.y); g.lineTo(p.x + p.l * .15, p.y - p.l); } g.stroke();
  g.fillStyle = colors.dim; for (let i = 0; i < 12; i++) g.fillRect(Math.random() * W, H - 3 * d, 6 * d, d); }); }
function dvd() { const LOGO = ['████████╗ ██████╗ ', '╚══██╔══╝██╔════╝ ', '   ██║   ██║  ███╗', '   ██║   ██║   ██║', '   ██║   ╚██████╔╝', '   ╚═╝    ╚═════╝ ', '    t o m G R I M '];
 fxRun('dvd', 'the logo hit the corner. probably.', (g, c, st) => { st.fs = (st.mob ? 14 : 18) * st.dpr; st.w = 18 * st.fs * .6; st.h = LOGO.length * st.fs; st.x = st.x ?? Math.random() * (c.width - st.w); st.y = st.y ?? Math.random() * (c.height - st.h); st.vx = st.vx ?? 4 * st.dpr; st.vy = st.vy ?? 3 * st.dpr; st.ci = st.ci || 0; st.party = 0; st.parts = []; },
 (g, c, st, t, L) => { const W = c.width, H = c.height, cols = [colors.fg, colors.hi, colors.acc, '#ff4a8a', '#ffd23f', '#c58cff', '#7dffa0'];
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, H); const sp = 1 + L.lvl * .6; st.x += st.vx * sp; st.y += st.vy * sp; let hx = false, hy = false;
  if (st.x <= 0 || st.x + st.w >= W) { st.vx *= -1; st.x = Math.max(0, Math.min(W - st.w, st.x)); hx = true; } if (st.y <= 0 || st.y + st.h >= H) { st.vy *= -1; st.y = Math.max(0, Math.min(H - st.h, st.y)); hy = true; }
  if (hx || hy) st.ci = (st.ci + 1) % cols.length;
  const nearX = st.x < 6 * st.dpr || st.x + st.w > W - 6 * st.dpr, nearY = st.y < 6 * st.dpr || st.y + st.h > H - 6 * st.dpr;
  if ((hx && nearY) || (hy && nearX)) { st.party = 3; for (let i = 0; i < 120; i++) st.parts.push({x: st.x + st.w / 2, y: st.y + st.h / 2, vx: (Math.random() - .5) * 18 * st.dpr, vy: (Math.random() - .8) * 18 * st.dpr, c: cols[i % cols.length], ch: '*+✦♪♫#@'[i % 7]}); }
  g.font = 'bold ' + st.fs + 'px monospace'; g.textBaseline = 'top'; g.fillStyle = cols[st.ci]; g.shadowColor = cols[st.ci]; g.shadowBlur = 10 * st.dpr; LOGO.forEach((l, i) => g.fillText(l, st.x, st.y + i * st.fs)); g.shadowBlur = 0;
  if (st.parts.length) { g.font = st.fs + 'px monospace'; st.parts = st.parts.filter(p => (p.x += p.vx, p.y += p.vy, p.vy += .5 * st.dpr, p.y < H)); st.parts.forEach(p => { g.fillStyle = p.c; g.fillText(p.ch, p.x, p.y); }); }
  if (st.party > 0) { st.party -= .033; g.font = 'bold ' + 48 * st.dpr + 'px monospace'; g.textAlign = 'center'; g.fillStyle = cols[(t * 10 | 0) % cols.length]; g.fillText('★ PERFECT CORNER ★', W / 2, H / 2 - 24 * st.dpr); g.textAlign = 'left'; } }); }
function life() { fxRun('life', 'all cells have died. or evolved.', (g, c, st) => { gridInit(st, c, st.mob ? 14 : 12); bufAlloc(st); st.a = new Uint8Array(st.W * st.H).map(() => Math.random() < .22 ? 1 : 0); st.age = new Uint8Array(st.W * st.H); st.acc = 0; st.gen = 0; },
 (g, c, st, t, L) => { const {W, H, ch, lv} = st;
  if (beatDet(st, L)) for (let k = 0; k < 6; k++) { const cx = Math.random() * W | 0, cy = Math.random() * H | 0; for (let q = 0; q < 14; q++) st.a[((cy + (Math.random() * 7 | 0) - 3 + H) % H) * W + (cx + (Math.random() * 7 | 0) - 3 + W) % W] = 1; }
  if (++st.acc % 3 === 0) { const n = new Uint8Array(W * H); st.gen++;
   for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) s += st.a[((y + j + H) % H) * W + (x + i + W) % W]; const k = y * W + x, al = st.a[k]; n[k] = s === 3 || (al && s === 2) ? 1 : 0; st.age[k] = n[k] ? Math.min(255, st.age[k] + 1) : (st.age[k] > 0 && !n[k] ? 0 : 0); }
   st.a = n; let pop = 0; for (let k = 0; k < n.length; k++) pop += n[k]; if (pop < W * H * .02) for (let k = 0; k < n.length; k++) if (Math.random() < .15) st.a[k] = 1; }
  for (let k = 0; k < W * H; k++) { if (st.a[k]) { const a = st.age[k]; ch[k] = a < 2 ? '@' : a < 6 ? 'O' : 'o'; lv[k] = a < 2 ? 3 : a < 6 ? 1 : 2; } else { ch[k] = ' '; } }
  drawBuf(g, c, st, ch, lv); g.fillStyle = colors.dim; g.font = st.fs + 'px monospace'; g.fillText('gen ' + st.gen, 8 * st.dpr, c.height - st.fs * 1.2); }); }
function cube(arg) { const donut = /torus|donut/i.test(arg || '');
 fxRun(donut ? 'donut' : 'cube', donut ? 'donut eaten.' : 'cube folded.', (g, c, st) => { gridInit(st, c, st.mob ? 12 : 10); bufAlloc(st); st.z = new Float32Array(st.W * st.H); st.A = 0; st.B = 0; },
 (g, c, st, t, L) => { const {W, H, ch, lv, z} = st; ch.fill(' '); z.fill(0); lv.fill(0); st.A += .04 + L.bass * .08; st.B += .025 + L.lvl * .05; const cA = Math.cos(st.A), sA = Math.sin(st.A), cB = Math.cos(st.B), sB = Math.sin(st.B);
  const sc = Math.min(W * .6, H * 1.2) * .5, plot = (x, y, zz, lum) => { const ooz = 1 / (zz + 5), xp = W / 2 + sc * 2.0 * ooz * x | 0, yp = H / 2 - sc * ooz * y | 0; if (xp < 0 || yp < 0 || xp >= W || yp >= H) return; const k = yp * W + xp; if (ooz > z[k]) { z[k] = ooz; const li = Math.max(0, Math.min(.999, lum)); ch[k] = '.,-~:;=!*#$@'[li * 12 | 0]; lv[k] = Math.min(3, li * 4 | 0); } };
  const rot = (x, y, zz) => { let y1 = y * cA - zz * sA, z1 = y * sA + zz * cA; let x2 = x * cB - y1 * sB, y2 = x * sB + y1 * cB; return [x2, y2, z1]; };
  const light = [0, .7, -.7];
  if (donut) { for (let th = 0; th < 6.283; th += .07) for (let ph = 0; ph < 6.283; ph += .02) { const ct = Math.cos(th), stt = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph), cx = 2 + 1 * ct, cy = stt;
    const [x, y, zz] = rot(cx * cp, cy, -cx * sp), [nx, ny, nz] = rot(ct * cp, stt, -ct * sp); plot(x, y, zz, (nx * light[0] + ny * light[1] + nz * light[2]) * .7 + .3); } }
  else { const S = 1.7, stp = st.mob ? .09 : .06; for (const [ax, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) for (let u = -S; u <= S; u += stp) for (let v = -S; v <= S; v += stp) { const p = [0, 0, 0], n = [0, 0, 0]; p[ax] = S * sgn; n[ax] = sgn; p[(ax + 1) % 3] = u; p[(ax + 2) % 3] = v;
    const [x, y, zz] = rot(p[0], p[1], p[2]), [nx, ny, nz] = rot(n[0], n[1], n[2]); plot(x, y, zz, (nx * light[0] + ny * light[1] + nz * light[2]) * .6 + .4); } }
  drawBuf(g, c, st, ch, lv); }); }
function snow() { fxRun('snow', 'the snow melts.', (g, c, st) => { gridInit(st, c, st.mob ? 16 : 14); st.pile = new Float32Array(st.W); st.f = Array.from({length: st.mob ? 120 : 300}, () => ({x: Math.random() * st.W, y: Math.random() * st.H, v: .1 + Math.random() * .3, c: '*+.·'[Math.random() * 4 | 0], ph: Math.random() * 6})); },
 (g, c, st, t, L) => { const {W, H, fs, cw, pile} = st; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.font = fs + 'px monospace'; g.textBaseline = 'top';
  g.fillStyle = colors.hi; for (const p of st.f) { p.y += p.v * (1 + L.lvl); p.x += Math.sin(t * 1.5 + p.ph) * .15; const col = ((p.x % W) + W) % W | 0; if (p.y >= H - pile[col] - 1) { pile[col] = Math.min(H * .4, pile[col] + .35); for (const dc of [-1, 1]) { const n = (col + dc + W) % W; if (pile[col] - pile[n] > 2) { pile[col] -= .35; pile[n] += .35; } } p.y = -1; p.x = Math.random() * W; } g.fillText(p.c, p.x * cw, p.y * fs); }
  if (Math.max(...pile) >= H * .4) pile.forEach((v, i) => pile[i] = Math.max(0, v - .02));
  for (let x = 0; x < W; x++) { const h = pile[x]; for (let k = 0; k < Math.floor(h); k++) { g.fillStyle = k === Math.floor(h) - 1 ? colors.hi : colors.fg; g.fillText(k === Math.floor(h) - 1 ? '▄' : '█', x * cw, (H - 1 - k) * fs); } if (h % 1 > .5) { g.fillStyle = colors.dim; g.fillText('▁', x * cw, (H - 1 - Math.floor(h)) * fs); } } }); }
function pipes() { const BOX = {'0,0': '─', '1,1': '│', '2,2': '─', '3,3': '│', '0,1': '┐', '3,2': '┐', '0,3': '┘', '1,2': '┘', '2,1': '┌', '3,0': '┌', '2,3': '└', '1,0': '└'};
 const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
 fxRun('pipes', 'pipes drained.', (g, c, st) => { gridInit(st, c, st.mob ? 16 : 14); st.used = 0; st.p = []; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); st.reset = true; },
 (g, c, st, t, L) => { const {W, H, fs, cw} = st, cols = [colors.fg, colors.hi, colors.acc, '#ff4a8a', '#ffd23f', '#c58cff', '#7dffa0'];
  if (st.reset || st.used > W * H * .55) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); st.used = 0; st.reset = false; st.p = Array.from({length: st.mob ? 2 : 4}, (_, i) => ({x: Math.random() * W | 0, y: Math.random() * H | 0, d: Math.random() * 4 | 0, c: cols[(i + (t | 0)) % cols.length]})); }
  g.font = 'bold ' + fs + 'px monospace'; g.textBaseline = 'top'; const steps = 2 + (L.lvl * 6 | 0);
  for (let s = 0; s < steps; s++) for (const p of st.p) { let nd = p.d; if (Math.random() < .18) nd = (p.d + (Math.random() < .5 ? 1 : 3)) % 4; const chr = BOX[p.d + ',' + nd] || '─';
   g.fillStyle = '#000'; g.fillRect(p.x * cw, p.y * fs, cw, fs); g.fillStyle = p.c; g.shadowColor = p.c; g.shadowBlur = 6 * st.dpr; g.fillText(chr, p.x * cw, p.y * fs); g.shadowBlur = 0; st.used++;
   p.d = nd; p.x += DX[nd]; p.y += DY[nd]; if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) { p.x = Math.random() * W | 0; p.y = Math.random() * H | 0; p.d = Math.random() * 4 | 0; p.c = cols[Math.random() * cols.length | 0]; } } }); }
/* ---------- rm -rf / ---------- */
let dead = false;
function rmrf() { if (dead) return; dead = true; window.tgTrack('easter-rmrf', 'rm -rf /'); saver.on = false; saverStop(); if (fxs) fxs.stop(); if (mx) mx.stop();
 cueClear(); smoke(false); cmd.disabled = true; cmd.blur(); jump('shell');
 const P = ['/bin/bash', '/bin/sh', '/bin/ls', '/etc/passwd', '/etc/shadow', '/etc/hosts', '/etc/fstab', '/boot/vmlinuz-grim', '/usr/lib/libc.so.6', '/usr/lib/libgrimamp.so.2', '/usr/lib/x86_64-linux-gnu/libasound.so.2', '/usr/share/fonts/vt323.ttf', '/usr/bin/grimsh', '/usr/bin/python3', '/lib/modules/6.6.6-grim/kernel/sound/bass.ko', '/sys/vinyl/spin.ko', '/sys/vinyl/needle', '/sys/class/crt/phosphor', '/var/log/scope', '/var/log/syslog', '/var/cache/waveform.db', '/dev/bass', '/dev/kick0', '/opt/grimos/themes/cyan.css', '/home/tomgrim/.bash_history', '/home/tomgrim/irc/#tomgrim.log'];
 flat.slice(0, 40).forEach(t => P.push('/home/tomgrim/music/' + t.file.split('/').pop())); for (let i = P.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [P[i], P[j]] = [P[j], P[i]]; }
 const items = [...pl.querySelectorAll('li')], T0 = performance.now(), DUR = 3500, v0 = audio.volume; let n = 0, k = 0;
 const step = () => { const el = performance.now() - T0, f = Math.min(1, el / DUR);
  const burst = 1 + Math.floor(f * f * 14); for (let i = 0; i < burst; i++) { const p = P[k++ % P.length]; say("removed '" + (k > P.length ? p.replace(/(\.\w+)?$/, '.' + (k % 97) + '$1') : p) + "'"); }
  while (n < items.length * f) { const li = items[n++]; if (li) li.style.visibility = 'hidden'; }
  audio.volume = Math.max(0, v0 * (1 - f)); if (f > .55 && !audio.paused) audio.pause();
  if (Math.random() < .15 + f * .5) { const th = THEMES[Math.random() * THEMES.length | 0]; document.body.className = document.body.className.replace(/theme-\w+/, 'theme-' + th); refreshColors(); }
  document.body.style.filter = Math.random() < f * .4 ? 'invert(1) hue-rotate(' + (Math.random() * 360 | 0) + 'deg)' : '';
  if (f < 1) setTimeout(step, Math.max(12, 90 - f * 80)); else { document.body.style.filter = ''; say('rm: cannot remove /proc/1: Device or resource busy'); setTimeout(() => { glitch({intro: 1300}); setTimeout(blackout, 1300); }, 150); } };
 step(); }
function blackout() { audio.pause(); try { audio.removeAttribute('src'); audio.load(); } catch {}
 if ('mediaSession' in navigator) { const ms = navigator.mediaSession; ms.metadata = null; ms.playbackState = 'none'; ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'].forEach(a => { try { ms.setActionHandler(a, null); } catch {} }); }
 if (fxs) fxs.stop(); smoke(false); cueBlack(0);
 const d = document.createElement('div'); d.id = 'dead'; d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;cursor:none;font:16px/1.3 "IBM Plex Mono",monospace;color:#555;padding:24px;box-sizing:border-box';
 document.body.appendChild(d); document.documentElement.style.overflow = 'hidden';
 const block = e => { if (e.type === 'keydown' && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && /^r$/i.test(e.key)))) return; e.preventDefault(); e.stopImmediatePropagation(); };
 ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend', 'wheel', 'mousemove', 'focusin'].forEach(ev => addEventListener(ev, block, {capture: true, passive: false}));
 if (document.activeElement) document.activeElement.blur();
 setTimeout(() => { d.innerHTML = 'Kernel panic - not syncing: Attempted to kill init!<span class="kcur">_</span>'; const c = d.querySelector('.kcur'); setInterval(() => { c.style.visibility = c.style.visibility === 'hidden' ? '' : 'hidden'; }, 530); }, 3000); }

/* ---------- idle screensaver ---------- */
const SAVERS = {matrix: () => matrix(), fire: () => fire(), starfield: () => starfield(), plasma, tunnel, rain, dvd, life, cube: () => cube(), donut: () => cube('donut'), snow, pipes};
const saver = {on: localStorage.grimSaver !== 'off', sec: +localStorage.grimSaverSec || 60, fx: localStorage.grimSaverFx || 'random', last: Date.now(), active: false, started: 0};
// exits: key press, wheel, or a real mouse move; taps/clicks go through dblExit on the overlay (double-tap / double-click)
let mvAcc = 0, mvLast = null;
function saverExitEv(ev, e) { if (ev === 'keydown' || ev === 'wheel') return true;
 if (ev === 'mousemove' && !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) && !(Date.now() - lastTouch < 800)) { if (mvLast) mvAcc += Math.abs(e.clientX - mvLast[0]) + Math.abs(e.clientY - mvLast[1]); mvLast = [e.clientX, e.clientY]; if (mvAcc > 60) { mvAcc = 0; mvLast = null; return true; } }
 return false; }
let lastTouch = 0; addEventListener('touchstart', () => { lastTouch = Date.now(); }, {capture: true, passive: true});
function dblExit(stop) { let last = 0; return e => { const now = Date.now(); if (e && e.cancelable) e.preventDefault();
 if (now - last < 350) { last = 0; saverHint(null); return stop(e); } last = now; tapFlash(); saverHint(e && e.pointerType === 'mouse' ? 'double-click to exit' : 'double-tap to exit'); }; }
function tapFlash() { if (RM) return; const f = document.createElement('div'); f.className = 'tapflash'; document.body.appendChild(f); setTimeout(() => f.remove(), 220); }
function saverHint(txt) { let h = document.getElementById('dblhint'); if (!txt) { if (h) h.remove(); return; }
 if (!h) { h = document.createElement('div'); h.id = 'dblhint'; h.setAttribute('role', 'status'); document.body.appendChild(h); }
 h.innerHTML = '<span class="p">$</span> ' + escH(txt); h.classList.add('on'); clearTimeout(saverHint.tm); saverHint.tm = setTimeout(() => { if (h.isConnected) h.remove(); }, 1400); }
function saverStop() { if (!saver.active) return; saver.active = false; if (fxs && fxs.saver) fxs.stop(); else if (mx && mx.saver) mx.stop(); }
['mousemove', 'keydown', 'touchstart', 'wheel', 'scroll', 'pointerdown'].forEach(ev => addEventListener(ev, e => { saver.last = Date.now(); if (saver.active && Date.now() - saver.started > 400 && saverExitEv(ev, e)) { saverStop(); if (ev === 'keydown') { e.preventDefault(); e.stopImmediatePropagation(); } } }, {capture: true, passive: ev !== 'keydown'}));
setInterval(() => { if (dead || document.hidden || RM) return; if (saver.active && !fxs && !mx) saver.active = false;
 if (!saver.on || saver.active || fxs || mx || !booted || Date.now() - saver.last < saver.sec * 1000) return;
 const ae = document.activeElement, busy = openM || !$('#photos').hidden || !$('#lb').hidden || !$('#help').hidden || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.value);
 if (busy) return; const names = Object.keys(SAVERS), pick = wxMood ? 'weather' : mood && SAVERS.fire ? 'fire' : SAVERS[saver.fx] ? saver.fx : names[Math.random() * names.length | 0];
 saverMode = true; try { (pick === 'weather' ? weatherFx : SAVERS[pick])(); } finally { saverMode = false; } if (fxs || mx) { saver.active = true; saver.started = Date.now(); } }, 1000);
function screensaverCmd(a) { a = (a || '').trim().toLowerCase();
 if (!a) return say(`screensaver: ${saver.on ? 'on' : 'off'} · after ${saver.sec}s idle · effect: ${saver.fx}\nusage: screensaver on|off|<seconds>|<effect>|random   effects: ${Object.keys(SAVERS).join(' ')}`);
 if (a === 'on' || a === 'off') saver.on = a === 'on'; else if (/^\d+$/.test(a)) { saver.sec = Math.max(5, Math.min(3600, +a)); saver.on = true; } else if (a === 'random' || SAVERS[a]) saver.fx = a; else if (a === 'now' || a === 'test') { saver.last = 0; return say('screensaver: starting…'); } else return say('screensaver: unknown option ' + a);
 localStorage.grimSaver = saver.on ? 'on' : 'off'; localStorage.grimSaverSec = saver.sec; localStorage.grimSaverFx = saver.fx; saver.last = Date.now(); screensaverCmd(''); }
function cowsay(t) { t = (t || 'moo. drop the bass.').slice(0, 200); const w = Math.min(36, Math.max(...t.split(' ').map(x => x.length), 4)); const lines = []; let l = '';
 t.split(/\s+/).forEach(word => { if ((l + ' ' + word).trim().length > w) { lines.push(l.trim()); l = word; } else l += ' ' + word; }); if (l.trim()) lines.push(l.trim());
 const W = Math.max(...lines.map(x => x.length)); let b = ' ' + '_'.repeat(W + 2) + '\n';
 lines.forEach((x, i) => { const [o, c] = lines.length === 1 ? ['<', '>'] : i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']; b += `${o} ${x.padEnd(W)} ${c}\n`; });
 b += ' ' + '-'.repeat(W + 2) + '\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\  ♪♫  )\\/\\\n                ||----w |\n                ||     ||'; say(b); }
const CMDS = {
 help: a => helpCmd(a), '?': a => helpCmd(a),

 themes: () => say('themes: ' + THEMES.map(t => t === curTheme() ? '[' + t + ']' : t).join(' ')),
 crt: a => { a = (a || '').trim(); if (a === 'on' || a === 'off') setCrt(a === 'on'); else if (!a) setCrt(document.body.classList.contains('nocrt')); else say('usage: crt on|off'); },
 photos: () => { say(`~/photos: ${PHOTOS.length} frames · click one or use ←/→ in the viewer`); jump('photos'); }, gallery: () => CMDS.photos(),
 matrix: () => matrix(), glitch: () => glitch(), fire: () => fire(), hack: () => hack(), starfield: () => starfield(), stars: () => starfield(), plasma: () => plasma(), tunnel: () => tunnel(), rain: () => rain(), dvd: () => dvd(), life: () => life(), cube: a => cube(a), donut: () => cube('donut'), torus: () => cube('donut'), snow: () => snow(), pipes: () => pipes(), screensaver: a => screensaverCmd(a), saver: a => screensaverCmd(a), cowsay: a => cowsay(a),
 ls: () => flat.forEach((t, i) => say(`${String(i + 1).padStart(3)}  ${t.title}${t.special ? ' ★' : ''}  [${t.single ? 'single' : t.al.title}]`)),
 albums: () => data.albums.forEach((a, i) => say(`[${String.fromCharCode(65 + (flat.find(t => t.al === a)?.ai ?? i))}] ${a.title}${a.year ? ' (' + a.year + ')' : ''} — ${a.type || 'album'}, ${a.tracks.length} tracks${a.blurb ? ' · ' + a.blurb : ''}`)),
 play: a => { if (!a) return toggle(); const n = parseInt(a, 10); if (n >= 1 && n <= flat.length) { play(n - 1); say('playing ' + flat[n - 1].title); } else { const i = flat.findIndex(t => t.title.toLowerCase().includes(a.toLowerCase())); i >= 0 ? (play(i), say('playing ' + flat[i].title)) : say('no such track: ' + a); } },
 pause: () => outPause(), next: () => next(1), prev: () => next(-1), repeat: cycleRepeat, shuffle: () => { shuffle = !shuffle; updateModes(); say('shuffle: ' + shuffle); },
 vol: a => { setVol((+a || 0) / 100); say('volume ' + Math.round(vol * 100) + '%'); },
 bio: () => { say(document.querySelector('.manbody').innerText); jump('man'); },
 man: a => CMDS.bio(), whoami: () => say('tomGRIM — formerly dj ign3ous. Lehigh Valley, PA.'), fetch: () => jump('fetch'), weather: () => weatherFx(true), wx: () => weatherFx(true), grimfetch: () => jump('fetch'),
 links: () => LINKS.forEach(([n, u]) => say(`${n.padEnd(12)} <a href="${u}" target="_blank" rel="noopener">${u}</a>`, true)),
 contact: () => { say('opening mail client…'); openModal('mail'); }, mail: () => CMDS.contact(), irc: () => { say('opening irc #tomgrim on irc.unrealircd.org…'); openModal('irc'); }, chat: () => CMDS.irc(),
 zach: () => zach(), get: a => getCmd(a), wget: a => getCmd(a), curl: a => getCmd((a || '').replace(/(^|\s)(-O|--remote-name|-L|-s)(?=\s|$)/g, ' ').trim()),
 clear: () => { out.innerHTML = ''; }, theme: a => setTheme((a || '').trim()),
 sudo: a => { const m = (a || '').match(/^(\S+)\s*(.*)$/); if (m && /^(apt|apt-get)$/.test(m[1])) return CMDS[m[1]](m[2], true); say('[sudo] password for tom: ********\ntom is not in the sudoers file. This incident will be reported.'); },
 exit: () => say('logout\nthere is no exit. only the next track. (refresh to reboot)'), logout: () => CMDS.exit(),
};
/* ---------- DJ FX: filter / res / verb / crush ---------- */
const FXK = {filter: {min: -100, max: 100, def: 0, label: 'FILTER', bi: true}, res: {min: 0, max: 100, def: 0, label: 'RES'}, verb: {min: 0, max: 100, def: 0, label: 'VERB'}, crush: {min: 0, max: 100, def: 0, label: 'CRUSH'}};
const fxv = {filter: 0, res: 0, verb: 0, crush: 0}; let fxg = null;
const fxFmt = (k, v) => { v = Math.round(v); if (k === 'filter') { if (Math.abs(v) < 3) return 'OFF'; const t = (Math.abs(v) - 3) / 97; return v < 0 ? 'LP ' + fhz(20000 * Math.pow(80 / 20000, t)) : 'HP ' + fhz(20 * Math.pow(8000 / 20, t)); }
 if (k === 'res') return 'Q ' + (0.7 * Math.pow(15 / 0.7, v / 100)).toFixed(1); if (k === 'crush') return v ? Math.round(16 - v / 100 * 12) + '-bit' : 'OFF'; return v + '%'; };
const fhz = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + 'k' : Math.round(f) + 'Hz';
function fxInit(src) { const c = actx, g = fxg = {src, c};
 g.filt = c.createBiquadFilter(); g.fcomp = c.createGain();
 g.dry = c.createGain(); g.wet = c.createGain(); g.conv = c.createConvolver(); g.sum = c.createGain();
 g.lim = c.createDynamicsCompressor(); g.lim.threshold.value = -3; g.lim.knee.value = 0; g.lim.ratio.value = 20; g.lim.attack.value = .002; g.lim.release.value = .12;
 const sr = c.sampleRate, len = Math.floor(sr * 2.5), ir = c.createBuffer(2, len, sr);
 for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < sr * .012 ? i / (sr * .012) : 1); } }
 g.conv.buffer = ir; g.crush = null; g.crushFb = null;
 const code = `class C extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'bits',defaultValue:16},{name:'down',defaultValue:1}]}constructor(){super();this.h=[0,0];this.n=0}process(i,o,p){const a=i[0],b=o[0];if(!a||!a.length)return true;const bits=p.bits[0],dn=Math.max(1,p.down[0]|0),q=Math.pow(2,bits-1),comp=1/(1+(16-bits)*.012);for(let ch=0;ch<b.length;ch++){const x=a[ch]||a[0],y=b[ch];let n=this.n;for(let s=0;s<y.length;s++){if(n%dn===0)this.h[ch]=Math.round(x[s]*q)/q;y[s]=this.h[ch]*comp;n++}if(ch===b.length-1)this.n=n}return true}}registerProcessor('grim-crush',C);`;
 if (c.audioWorklet) c.audioWorklet.addModule(URL.createObjectURL(new Blob([code], {type: 'application/javascript'}))).then(() => { g.crush = new AudioWorkletNode(c, 'grim-crush', {outputChannelCount: [2]}); g.sig = null; fxRoute(); }).catch(() => {});
 g.crushFb = c.createWaveShaper(); g.sig = null; fxRoute(); }
function fxRoute() { try { return fxRouteInner(); } finally { applyOut(); } }
function fxRouteInner() { const g = fxg; if (!g) return; const c = g.c, now = c.currentTime;
 const fOn = Math.abs(fxv.filter) >= 3, vOn = fxv.verb > 0, cOn = fxv.crush > 0, sig = [fOn, vOn, cOn, !!g.crush].join(), wire = sig !== g.sig; g.sig = sig;
 if (fOn) { const t = (Math.abs(fxv.filter) - 3) / 97, Q = 0.7 * Math.pow(15 / 0.7, fxv.res / 100), ty = fxv.filter < 0 ? 'lowpass' : 'highpass';
  if (g.filt.type !== ty) g.filt.type = ty; g.filt.frequency.setTargetAtTime(fxv.filter < 0 ? 20000 * Math.pow(80 / 20000, t) : 20 * Math.pow(8000 / 20, t), now, .015);
  g.filt.Q.setTargetAtTime(Q, now, .015); g.fcomp.gain.setTargetAtTime(1 / Math.sqrt(Q / 0.7), now, .015); }
 if (cOn) { const bits = 16 - fxv.crush / 100 * 12, down = 1 + Math.round(Math.pow(fxv.crush / 100, 1.5) * 15);
  if (g.crush) { g.crush.parameters.get('bits').setValueAtTime(bits, now); g.crush.parameters.get('down').setValueAtTime(down, now); }
  else { const q = Math.pow(2, Math.round(bits) - 1); if (g.fbq !== q) { g.fbq = q; const N = 4096, cv = new Float32Array(N); for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1; cv[i] = Math.round(x * q) / q; } g.crushFb.curve = cv; } } }
 if (vOn) { const w = fxv.verb / 100; g.dry.gain.setTargetAtTime(1 - w * .5, now, .02); g.wet.gain.setTargetAtTime(w * .9, now, .02); }
 if (!wire) return;
 [g.src, g.filt, g.fcomp, g.dry, g.wet, g.conv, g.sum, g.lim, g.crush, g.crushFb].forEach(n => { try { n && n.disconnect(); } catch {} }); if (san) g.src.connect(san); // keep the spectrum tap alive across re-routing
 if (!fOn && !vOn && !cOn) { g.src.connect(an); return; } // true bypass: untouched signal
 let head = g.src;
 if (fOn) { head.connect(g.filt); g.filt.connect(g.fcomp); head = g.fcomp; }
 if (cOn) { const n = g.crush || g.crushFb; head.connect(n); head = n; }
 if (vOn) { head.connect(g.dry); head.connect(g.conv); g.conv.connect(g.wet); g.dry.connect(g.sum); g.wet.connect(g.sum); head = g.sum; }
 head.connect(g.lim); g.lim.connect(an); }
let fxRouteT = 0; const fxApply = () => { if (!fxg) return; cancelAnimationFrame(fxRouteT); fxRouteT = requestAnimationFrame(fxRoute); };
function fxSet(k, v, quiet) { const d = FXK[k]; if (!d) return; v = Math.max(d.min, Math.min(d.max, +v || 0)); fxv[k] = v; fxApply(); knobDraw(k); }
/* knobs (SVG, Ableton-style) */
const KNOBS = {}; const ARC0 = -135, ARC = 270;
const kpt = (a, r) => { const t = (a - 90) * Math.PI / 180; return [20 + r * Math.cos(t), 20 + r * Math.sin(t)]; };
const karc = (a0, a1, r) => { if (Math.abs(a1 - a0) < .01) return ''; const [x0, y0] = kpt(Math.min(a0, a1), r), [x1, y1] = kpt(Math.max(a0, a1), r); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
function knobDraw(k) { const K = KNOBS[k]; if (!K) return; const d = FXK[k], v = fxv[k], n = (v - d.min) / (d.max - d.min), a = ARC0 + ARC * n, a0 = d.bi ? 0 : ARC0;
 K.val.setAttribute('d', karc(a0, a, 15)); const [x1, y1] = kpt(a, 5), [x2, y2] = kpt(a, 12.5); K.ptr.setAttribute('x1', x1); K.ptr.setAttribute('y1', y1); K.ptr.setAttribute('x2', x2); K.ptr.setAttribute('y2', y2);
 K.el.setAttribute('aria-valuenow', Math.round(v)); K.el.setAttribute('aria-valuetext', fxFmt(k, v)); K.ro.textContent = fxFmt(k, v); K.el.classList.toggle('on', v !== d.def); }
function knobsBuild() { const box = $('#fxknobs'); if (!box) return; const NS = 'http://www.w3.org/2000/svg';
 for (const [k, d] of Object.entries(FXK)) { const el = document.createElement('div'); el.className = 'knob k-' + k; el.tabIndex = 0; el.setAttribute('role', 'slider'); el.setAttribute('aria-label', d.label.toLowerCase() + ' knob'); el.setAttribute('aria-valuemin', d.min); el.setAttribute('aria-valuemax', d.max);
  el.innerHTML = `<span class="kro"></span><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="kbody" cx="20" cy="20" r="11.5"/><path class="ktrack" d="${karc(ARC0, ARC0 + ARC, 15)}"/><path class="kval"/><line class="kptr"/></svg><span class="klbl">${d.label}<span class="kled" aria-hidden="true"></span></span>`;
  box.appendChild(el); KNOBS[k] = {el, val: el.querySelector('.kval'), ptr: el.querySelector('.kptr'), ro: el.querySelector('.kro')};
  const span = d.max - d.min; let drag = null, lastTap = 0;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.focus({preventScroll: true}); const now = Date.now(); if (e.pointerType !== 'mouse' && now - lastTap < 300) { fxSet(k, d.def); lastTap = 0; return; } lastTap = now;
   drag = {x: e.clientX, y: e.clientY, v: fxv[k]}; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
  el.addEventListener('pointermove', e => { if (!drag) return; const px = (drag.y - e.clientY) + (e.clientX - drag.x); fxSet(k, drag.v + px / (e.shiftKey ? 1200 : 160) * span); });
  const end = () => { drag = null; el.classList.remove('drag'); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => fxSet(k, d.def));
  el.addEventListener('wheel', e => { e.preventDefault(); fxSet(k, fxv[k] - Math.sign(e.deltaY) * (e.shiftKey ? .5 : 4) * span / 100); }, {passive: false});
  el.addEventListener('keydown', e => { const st = (e.shiftKey ? 1 : 5) * span / 100; let nv = null;
   if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nv = fxv[k] + st; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nv = fxv[k] - st; else if (e.key === 'Home') nv = d.min; else if (e.key === 'End') nv = d.max; else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') nv = d.def;
   if (nv != null) { e.preventDefault(); e.stopPropagation(); fxSet(k, nv); } });
  knobDraw(k); } }
knobsBuild();
{ const np = $('.np'); const fit = () => { const w = np.clientWidth; np.classList.toggle('narrow', w < 600); }; new ResizeObserver(fit).observe(np); fit(); }
function fxCmd(a) { a = (a || '').trim().toLowerCase(); const show = () => say('fx: ' + Object.keys(FXK).map(k => `${k} ${Math.round(fxv[k])} (${fxFmt(k, fxv[k])})`).join(' · ') + '\nusage: fx reset · fx <filter|res|verb|crush> <value>   (filter -100..100, others 0..100)');
 if (!a) return show(); if (a === 'reset') { Object.keys(FXK).forEach(k => fxSet(k, FXK[k].def)); return say('fx: all knobs reset (bypass).'); }
 const m = a.match(/^(filter|res|verb|reverb|crush)\s+(-?\d+(\.\d+)?)$/); if (!m) return show(); const k = m[1] === 'reverb' ? 'verb' : m[1]; fxSet(k, +m[2]); say(`fx: ${k} → ${Math.round(fxv[k])} (${fxFmt(k, fxv[k])})`); }
window.__fx = () => ({...fxv, routed: fxg ? 1 : 0, worklet: !!(fxg && fxg.crush)});

/* ---------- pop-out terminal ---------- */
const shellEl = $('#shell'), shellHome = document.createComment('shell-home'); shellEl.before(shellHome);
const termMob = () => innerWidth < 760 || matchMedia('(pointer:coarse)').matches;
function termFloat(on) { on = !!on; if (on === shellEl.classList.contains('floating')) return; const b = $('#termpop');
 if (on) { document.body.appendChild(shellEl); shellEl.classList.add('floating'); shellEl.classList.toggle('sheet', termMob());
  if (!termMob()) { const st = JSON.parse(sessionStorage.grimTermPos || 'null') || {x: Math.max(10, innerWidth - 760), y: 80, w: 720, h: 460};
   Object.assign(shellEl.style, {left: Math.min(st.x, innerWidth - 120) + 'px', top: Math.max(0, Math.min(st.y, innerHeight - 60)) + 'px', width: st.w + 'px', height: st.h + 'px'}); }
  b.textContent = '⤓'; b.title = 'dock terminal'; b.setAttribute('aria-label', 'Dock terminal back into the page'); }
 else { shellEl.classList.remove('floating', 'sheet'); shellEl.removeAttribute('style'); shellHome.after(shellEl); b.textContent = '⧉'; b.title = 'pop out terminal'; b.setAttribute('aria-label', 'Pop out terminal into a floating window'); }
 sessionStorage.grimTermFloat = on ? '1' : ''; out.scrollTop = out.scrollHeight; if (!dead) cmd.focus({preventScroll: true}); }
const termSave = () => { if (!shellEl.classList.contains('floating') || shellEl.classList.contains('sheet')) return; const r = shellEl.getBoundingClientRect(); sessionStorage.grimTermPos = JSON.stringify({x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)}); };
$('#termpop').addEventListener('click', e => { e.stopPropagation(); termFloat(!shellEl.classList.contains('floating')); });
$('#t-shell').addEventListener('pointerdown', e => { if (!shellEl.classList.contains('floating') || shellEl.classList.contains('sheet') || e.target.closest('button')) return; e.preventDefault();
 const r = shellEl.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top, h = e.currentTarget; h.setPointerCapture(e.pointerId);
 const mv = ev => { shellEl.style.left = Math.max(-r.width + 80, Math.min(innerWidth - 80, ev.clientX - ox)) + 'px'; shellEl.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - oy)) + 'px'; };
 const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); termSave(); }; h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); });
new ResizeObserver(() => termSave()).observe(shellEl);
if (sessionStorage.grimTermFloat === '1') setTimeout(() => termFloat(true), 0);
/* ---------- terminal emulator: fake fs + system commands ---------- */
const T_START = Date.now(), HOME = '/home/tom'; let cwd = HOME, job = null;
const esc2 = s => String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]);
const slug2 = s => String(s).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const prompt = () => 'tom@grimos:' + (cwd === HOME ? '~' : cwd.startsWith(HOME + '/') ? '~' + cwd.slice(HOME.length) : cwd) + '$';
const setPrompt = () => { $('#prompt label').innerHTML = promptHtml(); };
const OSREL = 'NAME="GrimOS"\nPRETTY_NAME="GrimOS ' + GRIMOS_VERSION + ' (Downtempo)"\nVERSION="' + GRIMOS_VERSION + '-warm"\nVERSION_ID="' + GRIMOS_VERSION + '"\nID=grimos\nID_LIKE=debian\nHOME_URL="https://thomasgrim.com"\nBUG_REPORT_URL="irc://irc.unrealircd.org/#tomgrim"';
function fsTree() { const D = (o) => ({d: 1, c: o}), F = (txt, size) => ({f: 1, txt, size: size ?? (txt ? txt.length : 0)});
 const music = {}, albums = {};
 data.albums.forEach(a => { const dir = {}; (a.tracks || []).forEach(t => { const fn = t.file.split('/').pop(); const f = F(null, t.size || Math.round((t.duration_sec || 180) * 40000)); f.track = t; dir[fn] = f; music[fn] = f; }); albums[a.id] = D(dir); });
 return D({
  home: D({tom: D({music: D(music), albums: D(albums), photos: D(Object.fromEntries((PHOTOS || []).map((p, i) => ['frame-' + String(i + 1).padStart(2, '0') + '.jpg', F(null, 240000 + i * 7919)]))),
   'readme.txt': F('tomGRIM :: GRIM/OS\n\ndark, warm machine music after midnight.\n\n  ls            list tracks        play <n>   play a track\n  get <n>       download a track   help       all commands\n  cd ~/albums   browse albums      neofetch   system info\n\nbookings / inquiries: type "mail".'),
   '.bashrc': F('export PS1="tom@grimos:\\w$ "\nalias ll="ls -la"\nalias please="sudo"\n# play loud.'), '.bash_history': F(null, 4096)})}),
  etc: D({motd: F('Welcome to GrimOS ' + GRIMOS_VERSION + ' (Downtempo)\n\n * Every track is free to download: get <track#>\n * Effects: fire, starfield, plasma, donut, pipes\n * Support: irc #tomgrim\n'), 'os-release': F(OSREL), hostname: F('grimos'), passwd: F(null, 1871), shadow: F(null, 1024), hosts: F('127.0.0.1\tlocalhost\n127.0.1.1\tgrimos\n185.199.108.153\tthomasgrim.com'), fstab: F(null, 612)}),
  var: D({log: D({syslog: F(null, 88231), 'scope.log': F(null, 12044), 'vinyl.log': F(null, 3301), 'auth.log': F(null, 5120)})}),
  bin: D({bash: F(null, 1183448), sh: F(null, 125560), ls: F(null, 138208), grimsh: F(null, 66600)}), usr: D({bin: D({grimamp: F(null, 420666), python3: F(null, 5904904)}), lib: D({'libgrimamp.so.2': F(null, 81920)})}),
  sys: D({vinyl: D({'spin.ko': F(null, 16384), needle: F(null, 4096)})}), proc: D({cpuinfo: F(null, 0), uptime: F(null, 0)}), tmp: D({}), dev: D({bass: F(null, 0), kick0: F(null, 0), null: F(null, 0)}), boot: D({'vmlinuz-grim': F(null, 11534336)})}); }
let FS = null; const fsRoot = () => FS || (FS = fsTree());
function absPath(p) { p = (p || '').trim(); if (!p || p === '~') return HOME; if (p.startsWith('~')) p = HOME + p.slice(1); if (!p.startsWith('/')) p = cwd + '/' + p;
 const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return '/' + out.join('/'); }
function fsGet(p) { let n = fsRoot(); for (const s of absPath(p).split('/').filter(Boolean)) { if (!n.d || !n.c[s]) return null; n = n.c[s]; } return n; }
const fdate = (i) => { const d = new Date(Date.now() - (i * 2654435761 % 9e9)); return d.toLocaleString('en-US', {month: 'short'}) + ' ' + String(d.getDate()).padStart(2) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const hsz = b => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'K' : (b / 1048576).toFixed(1) + 'M';
function lsPath(a) { const flags = (a.match(/(^|\s)-\w+/g) || []).join(''), p = a.replace(/(^|\s)-\w+/g, '').trim(), n = fsGet(p || '.');
 if (!n) return say(`ls: cannot access '${p}': No such file or directory`); const long = /l/.test(flags), all = /a/.test(flags);
 const ents = n.d ? Object.entries(n.c).filter(([k]) => all || !k.startsWith('.')) : [[p.split('/').pop(), n]];
 if (!long) return sayA(ents.map(([k, v]) => lsName(k, v)).join('  ') || '');
 const rows = (all && n.d ? [['.', n], ['..', {d: 1, c: {}}]] : []).concat(ents);
 sayA('total ' + rows.length * 4 + '\n' + rows.map(([k, v], i) => `${A('2', v.d ? 'drwxr-xr-x' : /passwd|shadow|auth|\.bash_history/.test(k) ? '-rw-------' : '-rw-r--r--')} ${String(v.d ? 2 + Object.keys(v.c).length : 1).padStart(2)} ${A('33', 'tom  tom')}  ${A('32', String(v.d ? 4096 : v.size).padStart(8))} ${A('2', fdate(k.length * 31 + i))} ${lsName(k, v)}`).join('\n')); }
const lsName = (k, v) => v.d ? A('1;34', k + '/') : /\.mp3$/.test(k) ? A('35', k) : /\.(jpe?g|png)$/.test(k) ? A('36', k) : k.startsWith('.') ? A('2', k) : /^(bash|sh|ls|grimsh|grimamp|python3)$/.test(k) ? A('1;32', k) : k;
function startJob(stop, kind) { job = {stop: () => { if (!job) return; stop(); job = null; }, kind}; }
const pingCmd = a => { const host = (a || '').replace(/-\S+\s*\S*/g, '').trim(); if (!host) return say('ping: usage error: Destination address required');
 const known = {'thomasgrim.com': '185.199.108.153', localhost: '127.0.0.1', grimos: '127.0.1.1', 'google.com': '142.250.72.14', 'irc.unrealircd.org': '94.130.0.1'};
 const ip = known[host] || (/^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : (host.length * 37 % 200 + 20) + '.' + (host.charCodeAt(0) * 3 % 255) + '.' + (host.length * 13 % 255) + '.' + (host.charCodeAt(host.length - 1) % 250 + 2));
 const base = ip.startsWith('127.') ? .04 : host === 'thomasgrim.com' ? 11 : 20 + host.length * 2.3; let n = 0; const times = [];
 say(`PING ${host} (${ip}) 56(84) bytes of data.`);
 const fin = () => { const mn = Math.min(...times), mx2 = Math.max(...times), av = times.reduce((s, x) => s + x, 0) / (times.length || 1);
  say(`\n--- ${host} ping statistics ---\n${n} packets transmitted, ${times.length} received, 0% packet loss, time ${n * 1000 - 999}ms` + (times.length ? `\nrtt min/avg/max/mdev = ${mn.toFixed(3)}/${av.toFixed(3)}/${mx2.toFixed(3)}/${((mx2 - mn) / 2).toFixed(3)} ms` : '')); };
 const tick = () => { n++; const t = base * (1 + (Math.random() - .3) * .25); times.push(t); sayA(`64 bytes from ${A('1;36', host === ip ? ip : host)}${host === ip ? '' : ' (' + A('36', ip) + ')'}: icmp_seq=${A('33', n)} ttl=${A('33', ip.startsWith('127.') ? 64 : 57)} time=${A('1;32', t < 1 ? t.toFixed(3) : t.toFixed(1))} ms`); if (n >= 4) { clearInterval(iv); job = null; fin(); } };
 const iv = setInterval(tick, 1000); setTimeout(tick, 60); startJob(() => { clearInterval(iv); say('^C'); fin(); }, 'ping'); };
const PROCS = [['1', 'root', 'init'], ['42', 'root', 'kworker/bass'], ['133', 'tom', 'grimsh'], ['208', 'tom', 'grimamp'], ['209', 'tom', 'vinyl-spin'], ['211', 'tom', 'scope'], ['212', 'tom', 'spectrum'], ['230', 'tom', 'waveformd'], ['301', 'root', 'crt-phosphor'], ['333', 'tom', 'ircd-client'], ['404', 'root', 'sshd'], ['666', 'tom', 'ember-hours']];
function procRows() { const L = typeof level === 'function' ? level() : {lvl: .2}, pl2 = !audio.paused;
 return PROCS.map(([pid, u, c], i) => { const busy = pl2 && /vinyl|scope|spectrum|grimamp|waveform/.test(c); const cpu = busy ? 4 + L.lvl * 30 * (1 + (i % 3)) * Math.random() + 3 : Math.random() * 1.2; return [pid, u, cpu, (i * 1.7 % 6 + .3), c]; }).sort((a, b) => b[2] - a[2]); }
const topCmd = () => { const d = document.createElement('div'); out.appendChild(d); const draw = () => { const up = Math.floor((Date.now() - T_START) / 1000), r = procRows(), tot = r.reduce((s, x) => s + x[2], 0);
  d.innerHTML = ansi(`\x1b[1mtop\x1b[0m - ${new Date().toLocaleTimeString('en-GB')} up ${Math.floor(up / 60)} min,  1 user,  load average: ${(tot / 100).toFixed(2)}, ${(tot / 120).toFixed(2)}, ${(tot / 150).toFixed(2)}\nTasks: ${r.length} total,   ${audio.paused ? 1 : 5} running,  ${r.length - (audio.paused ? 1 : 5)} sleeping\n%Cpu(s): ${tot.toFixed(1).padStart(5)} us,  1.2 sy,  0.0 ni, ${Math.max(0, 100 - tot).toFixed(1)} id\nMiB Mem :   6666.0 total,   4096.6 free,   1337.0 used,   1232.4 buff/cache\n\n\x1b[7m  PID USER      %CPU  %MEM  COMMAND   \x1b[0m\n` + r.map(x => `${A('33', x[0].padStart(5))} ${x[1].padEnd(8)} ${A(x[2] > 20 ? '1;31' : x[2] > 5 ? '33' : '32', x[2].toFixed(1).padStart(5))} ${x[3].toFixed(1).padStart(5)}  ${/vinyl|scope|spectrum|grimamp/.test(x[4]) ? A('1;36', x[4]) : x[4]}`).join('\n') + '\n\n' + A('2', '[ q or Ctrl+C to quit ]')); out.scrollTop = out.scrollHeight; };
 draw(); const iv = setInterval(draw, 1000); startJob(() => { clearInterval(iv); d.lastChild && d.lastChild.remove && d.lastChild.remove(); }, 'top'); };
const aptCmd = (a, su) => { const m = (a || '').match(/^(install|update|upgrade|remove)\s*(.*)$/); if (!m) return say('apt ' + GRIMOS_VERSION + ' (grimos)\nUsage: apt [install|remove|update|upgrade] <package>');
 if (!su && m[1] !== 'update') return say(`E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?`);
 if (m[1] === 'update') return say('Hit:1 https://thomasgrim.com/grimos stable InRelease\nHit:2 https://bandcamp.void downtempo InRelease\nReading package lists... Done\nAll packages are up to date. Stay warm.');
 const pkg = m[2] || 'bass'; say(`Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${pkg} libgrim-${slug2(pkg) || 'x'}0\nNeed to get 6,660 kB of archives.\nGet:1 https://thomasgrim.com/grimos stable/main ${pkg} ${GRIMOS_VERSION} [6,660 kB]`);
 const d = document.createElement('div'); out.appendChild(d); let p = 0; const iv = setInterval(() => { p = Math.min(100, p + 3 + Math.random() * 9); const w = 30, f = Math.round(p / 100 * w);
  d.textContent = `Progress: [${String(Math.floor(p)).padStart(3)}%] [${'#'.repeat(f)}${'.'.repeat(w - f)}]`; out.scrollTop = out.scrollHeight;
  if (p >= 100) { clearInterval(iv); job = null; say(`Unpacking ${pkg} (${GRIMOS_VERSION}) ...\nSetting up ${pkg} (${GRIMOS_VERSION}) ...\nProcessing triggers for vinyl-spin (1.0) ...\n${pkg}: installed. (it was always there, deep in the mix.)`); } }, 120);
 startJob(() => { clearInterval(iv); say('^C\nE: Sub-process /usr/bin/dpkg received signal 2.'); }, 'apt'); };
const NEO = ['████████╗ ██████╗ ', '╚══██╔══╝██╔════╝ ', '   ██║   ██║  ███╗', '   ██║   ██║   ██║', '   ██║   ╚██████╔╝', '   ╚═╝    ╚═════╝ ', '  >_ tomGRIM       ', '                  '];
const MAN = {weather: 'weather — GRIM/WX: a 90s "local on the 8s" weather screen for Allentown, Bethlehem and Easton with live data from open-meteo.com (current conditions, latest observations, extended and local forecast). It also takes over the screensaver while any Walking Green version plays. Any key or click exits. Alias: wx.', share: 'share — copies a link to the current track at the current time (thomasgrim.com/?t=<track>&at=<seconds>). Opening it selects the track; press play and it starts at that moment.', help: 'help [section|cmd|-a] — list commands grouped by section. Commands with flags or args get their own line (args colored, dim description); simple commands flow together separated by •. help <section> shows one section (shell get net fun system fx look idle), help <cmd> opens its man page, help -a shows everything. ? is identical to help in every form: ?, ? fx, ? -a, ? <cmd>. Outside the prompt the ? key opens the keyboard help.', '?': 'see help — ? is an alias of help.', ls: 'ls [-la] [path] — without args lists every track; with a path lists the fake filesystem.', play: 'play <n|name> — play a track by number (see ls) or name.', get: 'get <n|name> — download a track. get album <name>, get --list.', cd: 'cd [dir] — change directory. try ~/albums, /etc, /var/log.', cat: 'cat <file> — print a file. try /etc/motd or readme.txt.', ping: 'ping <host> — send 4 ICMP echo requests (Ctrl+C stops).', top: 'top — live process list. q to quit.', theme: 'theme <name> — switch color theme: ' + THEMES.join(' ') + ' (cyan is the default). silicon, nightshift and neon are full-color palettes; Tab completes names.', screensaver: 'screensaver on|off|<seconds>|<effect>|random', apt: 'apt install <pkg> — needs sudo. you know how this ends.'};
Object.assign(CMDS, {
 ls: a => { a = (a || '').trim(); if (!a) return flat.forEach((t, i) => say(`${String(i + 1).padStart(3)}  ${t.title}${t.special ? ' ★' : ''}  [${t.single ? 'single' : t.al.title}]`)); lsPath(a); },
 ll: a => lsPath('-la ' + (a || '')), pwd: () => say(cwd),
 cd: a => { const p = absPath(a || '~'), n = fsGet(p); if (!n) return say(`bash: cd: ${a}: No such file or directory`); if (!n.d) return say(`bash: cd: ${a}: Not a directory`); cwd = p; setPrompt(); },
 dir: a => { const n = fsGet(a || '.'); if (!n || !n.d) return say('File Not Found'); const e = Object.entries(n.c).filter(([k]) => !k.startsWith('.')); let fb = 0;
  say(` Volume in drive C is GRIMOS\n Volume Serial Number is 7G0M-2026\n\n Directory of C:${absPath(a || '.').replace(/\//g, '\\')}\n\n` + e.map(([k, v], i) => { const d = new Date(Date.now() - (k.length * 9e7 % 9e9)); if (!v.d) fb += v.size;
   return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}  ${String(d.getHours() % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}    ${v.d ? '<DIR>         ' : String(v.size.toLocaleString('en-US')).padStart(14)} ${k}`; }).join('\n') +
   `\n${String(e.filter(x => !x[1].d).length).padStart(16)} File(s) ${fb.toLocaleString('en-US').padStart(14)} bytes\n${String(e.filter(x => x[1].d).length).padStart(16)} Dir(s)  6,660,000,000 bytes free`); },
 cat: a => { if (!a) return say('cat: missing operand'); a.split(/\s+/).forEach(p => { const n = fsGet(p); if (!n) return say(`cat: ${p}: No such file or directory`); if (n.d) return say(`cat: ${p}: Is a directory`);
  if (p.endsWith('os-release') || absPath(p) === '/etc/os-release') return say(OSREL); if (n.txt != null) return say(n.txt); say(`cat: ${p}: Permission denied`); }); },
 whoami: () => say('tom'), hostname: () => say('grimos'), id: () => say('uid=1000(tom) gid=1000(tom) groups=1000(tom),29(audio),666(bass)'),
 uname: a => say(/-a/.test(a || '') ? 'GrimOS grimos ' + GRIMOS_VERSION + '-warm #1 SMP PREEMPT lehigh-valley x86_64 GNU/Linux' : 'GrimOS'),
 date: () => say(new Date().toString().replace(/ GMT.*\(/, ' (')),
 uptime: () => { const s = Math.floor((Date.now() - T_START) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); say(` ${new Date().toLocaleTimeString('en-GB')} up ${h ? h + ':' + String(m).padStart(2, '0') : m + ' min'}${h ? '' : ', ' + (s % 60) + ' sec'},  1 user,  load average: 0.66, 0.42, 0.13`); },
 echo: a => say((a || '').replace(/\$USER|\$\{USER\}/g, 'tom').replace(/\$HOME/g, HOME).replace(/\$SHELL/g, '/bin/grimsh').replace(/\$PWD/g, cwd).replace(/["']/g, '')),
 history: () => say(hist.map((h, i) => String(i + 1).padStart(5) + '  ' + h).join('\n')),
 cls: () => CMDS.clear(), ping: pingCmd,
 ifconfig: () => say('grim0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 10.66.6.2  netmask 255.255.255.0  broadcast 10.66.6.255\n        inet6 fe80::7e:9a1d:6f0f:2026  prefixlen 64  scopeid 0x20<link>\n        ether 7c:6f:0f:20:26:66  txqueuelen 1000  (Ethernet)\n        RX packets 128000  bytes 166600000 (166.6 MB)\n        TX packets 4096  bytes 512000 (512.0 KB)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        loop  txqueuelen 1000  (Local Loopback)'),
 ip: a => /^(a|addr|address)\b/.test(a || '') ? say('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: grim0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP\n    link/ether 7c:6f:0f:20:26:66 brd ff:ff:ff:ff:ff:ff\n    inet 10.66.6.2/24 brd 10.66.6.255 scope global grim0') : say('Usage: ip a'),
 top: topCmd, htop: topCmd,
 ps: () => say('  PID TTY          TIME CMD\n' + procRows().slice(0, 8).sort((a, b) => a[0] - b[0]).map(x => `${x[0].padStart(5)} pts/0    00:00:0${x[0] % 9} ${x[4]}`).join('\n')),
 df: () => say('Filesystem      Size  Used Avail Use% Mounted on\n/dev/grim0p1     66G   23G   43G  35% /\ntmpfs           3.3G  1.2M  3.3G   1% /dev/shm\n/dev/vinyl      120M  119M  1.0M  99% /music\n/dev/phosphor    16M  4.0M   12M  25% /sys/crt'),
 free: () => say('               total        used        free      shared  buff/cache   available\nMem:           6.5Gi       1.3Gi       4.0Gi        66Mi       1.2Gi       5.0Gi\nSwap:          2.0Gi          0B       2.0Gi'),
 neofetch: () => { const up = Math.floor((Date.now() - T_START) / 60000), t = curT();
  const info = ['<b class="a14">tom</b>@<b class="a14">grimos</b>', '-----------', '<b>OS</b>: GrimOS ' + GRIMOS_VERSION + ' (Downtempo) x86_64', '<b>Host</b>: thomasgrim.com', '<b>Kernel</b>: ' + GRIMOS_VERSION + '-warm', `<b>Uptime</b>: ${up} mins`, `<b>Packages</b>: ${flat.length} (tracks)`, '<b>Shell</b>: grimsh ' + GRIMOS_VERSION + '', `<b>Theme</b>: ${curTheme()} [CRT]`, '<b>Terminal</b>: GRIMAMP tty', `<b>Now playing</b>: ${t ? esc2(t.title) : '—'}`, '<b>Location</b>: Lehigh Valley, PA'];
  const rows = Math.max(NEO.length, info.length); let s = '<span class="neo">'; info.forEach((x, i) => { info[i] = x.replace(/<b>([^<]+)<\/b>/, '<b class="a3">$1</b>'); }); for (let i = 0; i < rows; i++) s += '<span style="color:var(--br)">' + esc2(NEO[i] || ' '.repeat(18)) + '</span>  ' + (info[i] || '') + '\n';
  s += ' '.repeat(20) + [0, 1, 2, 3, 4, 5, 6, 7].map(c => `<span class="a${c}">███</span>`).join('') + '\n' + ' '.repeat(20) + [8, 9, 10, 11, 12, 13, 14, 15].map(c => `<span class="a${c}">███</span>`).join('') + '</span>'; say(s, true); },
 man: a => { a = (a || '').trim(); if (!a || /^tom(grim)?$/i.test(a)) return CMDS.bio(); sayA(MAN[a] ? `${A('1', a.toUpperCase() + '(1)')}\n\n  ${MAN[a].replace(/(^|\s)(--?\w[\w-]*)/g, '$1' + E + '35m$2' + E + '0m').replace(/(<[^>]+>|\[[^\]]+\])/g, E + '3;33m$1' + E + '0m').replace(/^(\S+)/, E + '1;36m$1' + E + '0m')}` : CMDS[a] ? `${a.toUpperCase()}(1)\n\n  ${a} — see "help" for usage.` : `No manual entry for ${a}`); },
 which: a => (a || '').split(/\s+/).filter(Boolean).forEach(c => say(CMDS[c] ? '/usr/bin/' + c : `which: no ${c} in (/usr/local/bin:/usr/bin:/bin)`)),
 ssh: a => { const h = (a || '').split('@').pop() || ''; if (!h) return say('usage: ssh [user@]hostname'); say(`ssh: connect to host ${h} port 22: Connection refused\n(the only open port here is the dancefloor.)`); },
 curl: a => { a = (a || '').trim(); if (/(^|\s)(-O|--remote-name)(\s|$)/.test(a)) return getCmd(a.replace(/(^|\s)(-O|--remote-name|-L|-s)(?=\s|$)/g, ' ').trim()); if (!a) return say("curl: try 'curl --help' for more information");
  const u = a.replace(/(^|\s)-\S+/g, ' ').trim().replace(/^https?:\/\//, ''); if (/thomasgrim\.com/.test(u)) return say('<!doctype html>\n<html><head><title>GRIM/OS :: tomGRIM</title>…\n(you are already here.)'); if (/wttr\.in/.test(u)) return say('Weather: Lehigh Valley — 4°C, fog, low light. Perfect for downtempo.');
  if (/^[\d.]+$|^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(u)) return say(`curl: (6) Could not resolve host: ${u.replace(/^https?:\/\//, '').split('/')[0]}\n(GrimOS is offline-first. try "curl -O <track#>" to download a track.)`); getCmd(a); },
 apt: aptCmd, 'apt-get': aptCmd, fx: fxCmd, colors: colorsCmd, colours: colorsCmd,
 share: () => shareTrack(false),
 stop: () => { if (bgMode) { bgEl.pause(); bgMode = false; } audio.pause(); try { audio.currentTime = 0; } catch {} $('#tcur').textContent = fmt(0); updateNP(); setTimeout(() => { if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = 'none'; try { navigator.mediaSession.setPositionState({duration: audio.duration || 0, position: 0, playbackRate: 1}); } catch {} } }, 0); say('■ stopped. (00:00)'); },
 popout: () => termFloat(true), dock: () => termFloat(false),
});
$('#prompt').addEventListener('submit', e => { e.preventDefault(); if (job) return; const v = cmd.value.trim(); cmd.value = ''; if (!v) return; hist.push(v); hp = hist.length;
 if (/^(sudo\s+)?rm\s+-(rf|fr)\s+(--no-preserve-root\s+)?\/\*?$/i.test(v)) { sayCmd(v); return rmrf(); }
 sayCmd(v); const [c, ...rest] = v.split(/\s+/); const f = CMDS[c.toLowerCase()]; f ? f(rest.join(' ')) : sayA(`bash: ${A('1;31', c)}: ${A('31', 'command not found')}`); });
addEventListener('keydown', e => { if (!job) return; if ((e.ctrlKey && /^c$/i.test(e.key)) || (job.kind === 'top' && /^q$/i.test(e.key))) { e.preventDefault(); e.stopImmediatePropagation(); job.stop(); } }, true);
cmd.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { hp = Math.max(0, hp - 1); cmd.value = hist[hp] || ''; e.preventDefault(); } else if (e.key === 'ArrowDown') { hp = Math.min(hist.length, hp + 1); cmd.value = hist[hp] || ''; e.preventDefault(); }
 else if (e.key === 'Tab' && cmd.value) { e.preventDefault(); const v = cmd.value, sp = v.lastIndexOf(' ');
  if (sp < 0) { const m = Object.keys(CMDS).filter(k => k.startsWith(v)); if (m.length === 1) cmd.value = m[0] + ' '; else if (m.length > 1) { const pre = m.reduce((p, k) => { while (!k.startsWith(p)) p = p.slice(0, -1); return p; }); if (pre.length > v.length) cmd.value = pre; else say(m.join('  ')); } return; }
  if (/^theme\s+\S*$/.test(v)) { const m = THEMES.filter(t => t.startsWith(v.slice(sp + 1))); if (m.length === 1) cmd.value = 'theme ' + m[0]; else if (m.length > 1) say(m.join('  ')); return; }
  const part = v.slice(sp + 1), di = part.lastIndexOf('/'), dirP = di >= 0 ? part.slice(0, di + 1) : '', base = part.slice(di + 1), n = fsGet(dirP || '.');
  if (!n || !n.d) return; const m = Object.keys(n.c).filter(k => k.startsWith(base) && (base.startsWith('.') || !k.startsWith('.')));
  if (m.length === 1) cmd.value = v.slice(0, sp + 1) + dirP + m[0] + (n.c[m[0]].d ? '/' : ' '); else if (m.length > 1) say(m.join('  ')); } });

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
 weather: ['00000000','00011000','00100110','01000001','10000001','11111111','00100100','01001000'],
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
function zach() { const f = atob(ZX[0][0]), t = {title: 'Screw Detention', id3_artist: 'Zach feat. Lori', file: f, al: {id: 'x', title: 'Zach feat. Lori', year: 2026}, single: false}; trackMood(null);
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
document.querySelectorAll('[data-wx]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); b.blur(); weatherFx(true); }));
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
 if (!a) return say("usage: get [OPTION]... <TRACK|NAME>\n       get album <NAME>\n       get --list | ls\n\n  TRACK       track number as shown by 'ls' (1-" + flat.length + ")\n  NAME        track title or part of it\n  album NAME  download every track of an album\n  -l, --list  list downloadable files with sizes\n  -h, --help  show this help\n\naliases: wget, curl -O.  example: get redline");
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

/* ---------- track moods: Graveyard → fire theme + smoke ---------- */
let mood = null;
let wxMood = false;
const wxAuto = {t: null, dismissed: false, opening: false};
function wxAutoCheck() { if (!wxMood || wxAuto.dismissed || audio.paused || document.hidden || dead || !booted || mx) return;
 if (fxs) { if (fxs.name === 'weather') return; if (!fxs.saver) return; saverStop(); }
 wxAuto.opening = true; try { weatherFx(); } finally { wxAuto.opening = false; } }
audio.addEventListener('playing', wxAutoCheck); document.addEventListener('visibilitychange', () => setTimeout(wxAutoCheck, 50));
function trackMood(t) {
 const wg = !!(t && /walking green/i.test(t.title));
 if (t !== wxAuto.t) { wxAuto.t = t; wxAuto.dismissed = false; }
 if (!wg && wxMood && fxs && fxs.name === 'weather' && fxs.auto) fxs.stop();
 if (wg !== wxMood) { wxMood = wg; if (saver.active && fxs && fxs.saver && (wg ? fxs.name !== 'weather' : fxs.name === 'weather')) { saverStop(); if (wg) { saverMode = true; try { weatherFx(); } finally { saverMode = false; } if (fxs) { saver.active = true; saver.started = Date.now(); } } } if (wg) setTimeout(wxAutoCheck, 0); }
 const want = t && /^graveyard over the fire$/i.test(t.title);
 if (want && !mood) { mood = {prev: curTheme()}; if (THEMES.includes('fire')) setTheme('fire', 'mood'); smoke(true); }
 else if (!want && mood) { const p = mood.prev; mood = null; setTheme(p, 'mood'); smoke(false); cueClear(); }
}
let smk = null;
function smoke(on) {
 if (!on) { if (smk) { cancelAnimationFrame(smk.raf); smk.c.remove(); smk = null; } return; }
 if (smk || RM) return;
 const mob = matchMedia('(max-width: 960px), (pointer: coarse)').matches;
 const c = document.createElement('canvas'); c.id = 'smoke'; c.setAttribute('aria-hidden', 'true');
 c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9000;opacity:' + (mob ? .45 : .7) + ';mix-blend-mode:screen;filter:blur(' + (mob ? 6 : 10) + 'px)';
 document.body.appendChild(c); const g = c.getContext('2d'), sc = mob ? .35 : .5;
 const rs = () => { c.width = innerWidth * sc; c.height = innerHeight * sc; }; rs(); addEventListener('resize', rs);
 const P = Array.from({length: mob ? 20 : 40}, () => ({x: Math.random(), y: Math.random(), r: .12 + Math.random() * .22, vx: (Math.random() - .5) * .00012, vy: -.00006 - Math.random() * .0001, a: .25 + Math.random() * .35, ph: Math.random() * 6}));
 let lt = 0; smk = {c, raf: 0};
 const step = ts => { smk.raf = requestAnimationFrame(step); if (ts - lt < (mob ? 50 : 33)) return; const dt = Math.min(80, ts - (lt || ts)); lt = ts;
  const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  for (const p of P) { p.x += p.vx * dt + Math.sin(ts / 4000 + p.ph) * .00003 * dt; p.y += p.vy * dt; if (p.y < -p.r) { p.y = 1 + p.r; p.x = Math.random(); } if (p.x < -p.r) p.x = 1 + p.r; if (p.x > 1 + p.r) p.x = -p.r;
   const R0 = p.r * Math.max(W, H), x = p.x * W, y = p.y * H, gr = g.createRadialGradient(x, y, 0, x, y, R0);
   gr.addColorStop(0, `rgba(210,205,200,${p.a})`); gr.addColorStop(1, 'rgba(210,205,200,0)'); g.fillStyle = gr; g.fillRect(x - R0, y - R0, R0 * 2, R0 * 2); } };
 smk.raf = requestAnimationFrame(step);
}
/* Graveyard cue: 0:46 fade to black (2s), 0:48 full-screen fire — driven by audio.currentTime */
const CUE_B = 46, CUE_F = 48; const cue = {dismissed: false, fx: false, el: null};
function cueBlack(o) { if (o <= 0) { if (cue.el) { cue.el.remove(); cue.el = null; } return; }
 if (!cue.el) { cue.el = document.createElement('div'); cue.el.id = 'cueblack'; cue.el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:8990;opacity:0;transition:opacity .12s linear;cursor:pointer'; document.body.appendChild(cue.el); }
 cue.el.style.opacity = Math.min(1, o).toFixed(3); }
function cueFxStop() { if (cue.fx) { cue.fx = false; if (fxs && fxs.cue) fxs.stop(); } }
function cueClear() { cueFxStop(); cueBlack(0); cue.dismissed = false; }
function cueDismiss() { cue.dismissed = true; cueFxStop(); cueBlack(0); }
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, e => { if (cue.el && !cue.fx && !cue.dismissed) { cueDismiss(); if (ev === 'keydown') { e.preventDefault(); e.stopImmediatePropagation(); } } }, {capture: true}));
setInterval(() => { if (!mood || dead || document.hidden) return; const t = audio.currentTime;
 if (cue.fx && !(fxs && fxs.cue)) { cue.fx = false; cue.dismissed = true; cueBlack(0); } // user closed the fire
 if (t < CUE_B) { if (cue.fx || cue.el) cueFxStop(), cueBlack(0); cue.dismissed = false; return; }
 if (cue.dismissed) return;
 if (t < CUE_F) { cueFxStop(); cueBlack((t - CUE_B) / (CUE_F - CUE_B)); return; }
 if (!cue.fx) { if (fxs && !fxs.cue) fxs.stop(); if (mx) mx.stop(); saverStop(); saverMode = true; try { fire(); } finally { saverMode = false; } if (fxs) { fxs.cue = true; cue.fx = true; } }
 if (cue.fx) cueBlack(0); }, 100);
window.__cue = () => ({black: cue.el ? +cue.el.style.opacity : 0, fire: !!(fxs && fxs.cue), dismissed: cue.dismissed, t: audio.currentTime});
window.__mood = () => ({mood: !!mood, theme: curTheme(), saved: localStorage.grimTheme, smoke: !!document.getElementById('smoke')});

/* ---------- Walking Green → GRIM/WX "local on the 8s" weather screensaver (live Open-Meteo data) ---------- */
const WX_CITIES = [['Allentown', 40.6084, -75.4902], ['Bethlehem', 40.6259, -75.3705], ['Easton', 40.6884, -75.2207]];
const wxCache = {t: 0, data: null, p: null};
function wxFetch() {
 if (wxCache.data && Date.now() - wxCache.t < 600000) return Promise.resolve(wxCache.data);
 if (wxCache.p) return wxCache.p;
 const q = 'latitude=' + WX_CITIES.map(c => c[1]).join(',') + '&longitude=' + WX_CITIES.map(c => c[2]).join(',') +
  '&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,is_day,precipitation&hourly=pressure_msl&past_hours=3&forecast_hours=1' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=4';
 const ctl = 'AbortController' in window ? new AbortController() : null; const to = setTimeout(() => ctl && ctl.abort(), 8000);
 wxCache.p = fetch('https://api.open-meteo.com/v1/forecast?' + q, ctl ? {signal: ctl.signal} : {}).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
  .then(j => { const a = Array.isArray(j) ? j : [j]; if (a.length < 3 || !a[0].current) throw new Error('bad data'); wxCache.data = a; wxCache.t = Date.now(); return a; })
  .catch(() => wxCache.data).finally(() => { clearTimeout(to); wxCache.p = null; });
 return wxCache.p;
}
function wxCond(c, day, short) { day = day !== 0;
 const M = {0: day ? 'Sunny' : 'Clear', 1: 'Fair', 2: 'Partly Cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing Fog', 51: 'Lt Drizzle', 53: 'Drizzle', 55: 'Hvy Drizzle', 56: 'Frzg Drizzle', 57: 'Frzg Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 66: 'Frzg Rain', 67: 'Frzg Rain', 71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains', 80: 'Showers', 81: 'Showers', 82: 'Hvy Showers', 85: 'Snow Showers', 86: 'Snow Showers', 95: "T'Storms", 96: "T'Storms", 99: "T'Storms"};
 const s = M[c] || 'Fair'; return short ? s.replace('Partly Cloudy', 'P Cloudy').replace('Snow Showers', 'Snw Shwrs') : s; }
function wxKind(c, day) { if (c >= 95) return 'storm'; if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow'; if (c >= 51 && c <= 82) return 'rain'; if (c === 45 || c === 48) return 'fog'; if (c === 3) return 'cloud'; if (c === 2) return day === 0 ? 'cloud' : 'partly'; return day === 0 ? 'moon' : 'sun'; }
function wxIcon(k) {
 const sun = (x, y, r) => `<g fill="#ffd21f" stroke="#ff9a00" stroke-width="2">${Array.from({length: 8}, (_, i) => { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); return `<line x1="${x + c * (r + 4)}" y1="${y + s * (r + 4)}" x2="${x + c * (r + 13)}" y2="${y + s * (r + 13)}" stroke="#ffd21f" stroke-width="5" stroke-linecap="square"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="${r}"/></g>`;
 const cloud = (dx, dy, f) => `<g transform="translate(${dx} ${dy})" fill="${f || '#e8ecf4'}" stroke="#8a93b0" stroke-width="2"><path d="M14 58 h62 a14 14 0 0 0 0 -28 a20 20 0 0 0 -38 -6 a14 14 0 0 0 -24 10 a12 12 0 0 0 0 24z"/></g>`;
 const drops = (col, ch) => Array.from({length: 4}, (_, i) => ch === '*' ? `<text x="${22 + i * 16}" y="${86 + (i % 2) * 8}" font-size="18" fill="#fff" font-family="monospace" font-weight="bold">*</text>` : `<line x1="${26 + i * 16}" y1="${74 + (i % 2) * 5}" x2="${20 + i * 16}" y2="${90 + (i % 2) * 5}" stroke="${col}" stroke-width="4"/>`).join('');
 const body = {sun: sun(50, 50, 20), moon: `<path d="M62 18 a32 32 0 1 0 22 50 a26 26 0 1 1 -22 -50z" fill="#fff6c0" stroke="#c9b75a" stroke-width="2"/>`, partly: sun(36, 36, 16) + cloud(8, 22), cloud: cloud(-6, 6, '#c9cfdc') + cloud(6, 18),
  rain: cloud(0, 4, '#b8bfcf') + drops('#5aa0ff'), snow: cloud(0, 4) + drops('', '*'), storm: cloud(0, 0, '#9aa2b6') + `<path d="M50 56 l-12 22 h10 l-6 18 l20 -26 h-10 l8 -14z" fill="#ffd21f" stroke="#ff9a00" stroke-width="2"/>` + drops('#5aa0ff').replace(/x1="(26|42)"[^>]*\/>/g, ''),
  fog: [30, 44, 58, 72].map((y, i) => `<rect x="${12 + (i % 2) * 8}" y="${y}" width="${70 - (i % 2) * 8}" height="6" fill="#c9cfdc"/>`).join('')}[k] || '';
 return `<svg viewBox="0 0 100 100" class="wx-ic" aria-hidden="true">${body}</svg>`; }
function wxDir(d) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d || 0) % 360) / 45) % 8]; }
const wxR = v => v == null || isNaN(v) ? '--' : Math.round(v);
function wxWind(c) { const s = Math.round(c.wind_speed_10m || 0); return s < 3 ? 'Calm' : wxDir(c.wind_direction_10m) + ' ' + s + (c.wind_gusts_10m > s + 9 ? ' G' + Math.round(c.wind_gusts_10m) : ''); }
function wxTrend(d) { const h = d && d.hourly && d.hourly.pressure_msl, n = d && d.current.pressure_msl; if (!h || !h.length || !n) return ''; const dp = n - h[0]; return dp > .6 ? 'R' : dp < -.6 ? 'F' : 'S'; }
function wxInHg(h) { return h ? (h * 0.02953).toFixed(2) : '--'; }
function wxVis(ft) { if (ft == null) return '--'; const m = ft / 5280; return m >= 10 ? '10 mi.' : (m < 1 ? m.toFixed(1) : Math.round(m)) + ' mi.'; }
function wxFeels(c) { const T = c.temperature_2m, s = c.wind_speed_10m || 0; if (T <= 50 && s > 3) return ['Wind Chill', wxR(c.apparent_temperature) + '°']; if (T >= 80) return ['Heat Index', wxR(c.apparent_temperature) + '°']; return null; }
/* GRIM/WX regional map + radar (RainViewer tiles, max zoom 7) */
const WX_REG = [['Scranton', 41.409, -75.662], ['Hazleton', 40.958, -75.975], ['Stroudsburg', 40.987, -75.195], ['Pottsville', 40.686, -76.196], ['Allentown', 40.608, -75.490], ['Easton', 40.688, -75.221], ['Reading', 40.336, -75.927], ['Harrisburg', 40.274, -76.884], ['Lancaster', 40.038, -76.306], ['Doylestown', 40.310, -75.130], ['Philadelphia', 39.953, -75.165], ['Trenton', 40.217, -74.743], ['Morristown', 40.797, -74.481], ['New York', 40.713, -74.006], ['Wilmington', 39.740, -75.547], ['New Brunswick', 40.486, -74.452]];
const wxRegC = {t: 0, data: null, p: null}, wxRadC = {t: 0, data: null, p: null};
function wxGet(c, url, ok) { if (c.data && Date.now() - c.t < 600000) return Promise.resolve(c.data); if (c.p) return c.p;
 const ctl = 'AbortController' in window ? new AbortController() : null, to = setTimeout(() => ctl && ctl.abort(), 8000);
 c.p = fetch(url, ctl ? {signal: ctl.signal} : {}).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(j => { const v = ok(j); if (!v) throw new Error('bad'); c.data = v; c.t = Date.now(); return v; })
  .catch(() => c.data).finally(() => { clearTimeout(to); c.p = null; }); return c.p; }
const wxRegFetch = () => wxGet(wxRegC, 'https://api.open-meteo.com/v1/forecast?latitude=' + WX_REG.map(c => c[1]).join(',') + '&longitude=' + WX_REG.map(c => c[2]).join(',') + '&current=temperature_2m,weather_code,is_day,precipitation&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FNew_York', j => { const a = Array.isArray(j) ? j : [j]; return a.length === WX_REG.length && a[0].current ? a : null; });
const wxRadFetch = () => wxGet(wxRadC, 'https://api.rainviewer.com/public/weather-maps.json', j => j && j.host && j.radar && j.radar.past && j.radar.past.length ? {host: j.host, frames: j.radar.past.slice(-6)} : null);
const WXZ = 7, WXW = 256 * 2 ** WXZ, wxX = lon => (lon + 180) / 360 * WXW, wxY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * WXW; };
const WX_GEO = { // simplified outlines [lat, lon]
 river: [[42.0, -75.36], [41.95, -75.28], [41.77, -75.06], [41.6, -75.06], [41.48, -74.99], [41.37, -74.69], [41.32, -74.8], [41.22, -74.86], [41.09, -75.0], [40.97, -75.14], [40.92, -75.1], [40.83, -75.08], [40.69, -75.21], [40.59, -75.19], [40.53, -75.06], [40.37, -74.95], [40.3, -74.87], [40.21, -74.77], [40.15, -74.72], [40.08, -74.86], [39.95, -75.13], [39.85, -75.24], [39.81, -75.42]],
 bay: [[39.81, -75.42], [39.66, -75.56], [39.4, -75.55], [39.4, -75.35], [39.6, -75.47], [39.75, -75.36], [39.85, -75.24]],
 ocean: [[39.2, -74.6], [39.5, -74.32], [39.75, -74.11], [39.9, -74.08], [40.1, -74.03], [40.3, -73.98], [40.47, -74.0], [40.43, -74.15], [40.5, -74.26], [40.58, -74.05], [40.6, -73.75], [40.6, -72.5], [39.2, -72.5]],
 pa: [[42.0, -80], [42.0, -75.36]], ny: [[41.37, -74.69], [41.0, -73.9]], md: [[39.72, -80], [39.72, -75.79], [39.76, -75.71], [39.8, -75.62], [39.83, -75.52], [39.84, -75.42]], de: [[39.72, -75.79], [39.0, -75.79]]};
function wxMapBox(aspect) { const cx = wxX(-75.35), cy = wxY(40.55); let h = wxY(39.75) - wxY(41.45), w = h * aspect; const wMax = wxX(-73.6) - wxX(-77.1), wMin = wxX(-74.2) - wxX(-76.4); if (w > wMax) { w = wMax; h = w / aspect; } if (w < wMin) { w = wMin; h = w / aspect; } return [cx - w / 2, cy - h / 2, w, h]; }
function wxMapBase(b) { const P = a => a.map(([la, lo]) => (wxX(lo) - b[0]).toFixed(1) + ',' + (wxY(la) - b[1]).toFixed(1)).join(' '), u = Math.min(b[2], b[3]) / 100;
 return `<defs><linearGradient id="wxland" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a52c8"/><stop offset="1" stop-color="#22309a"/></linearGradient></defs><rect width="${b[2]}" height="${b[3]}" fill="url(#wxland)"/>
 <polygon points="${P(WX_GEO.ocean)}" fill="#0c1460"/><polygon points="${P(WX_GEO.bay)}" fill="#0c1460"/><polyline points="${P(WX_GEO.river)}" fill="none" stroke="#0c1460" stroke-width="${(u * .9).toFixed(2)}" stroke-linejoin="round"/>
 ${['pa', 'ny', 'md', 'de'].map(k => `<polyline points="${P(WX_GEO[k])}" fill="none" stroke="#9fb0ff" stroke-width="${(u * .35).toFixed(2)}" stroke-dasharray="${u * 1.6} ${u * 1.1}"/>`).join('')}
 ${[['PA', 41.15, -76.55], ['NJ', 40.05, -74.5], ['NY', 41.75, -74.3], ['DE', 39.55, -75.7]].map(([s, la, lo]) => `<text x="${wxX(lo) - b[0]}" y="${wxY(la) - b[1]}" font-size="${u * 6}" fill="#7d8ff0" opacity=".7" text-anchor="middle">${s}</text>`).join('')}`; }
function wxRegSlide(box, data) { const b = wxMapBox(box.w / box.h), u = Math.min(b[2], b[3]) / 100, fs = u * (b[2] > b[3] ? 6.2 : 7.4), cities = [];
 WX_REG.forEach((c, i) => { const x = wxX(c[2]) - b[0], y = wxY(c[1]) - b[1]; if (x < fs * 2.2 || x > b[2] - fs * 2.2 || y < fs * 1.6 || y > b[3] - fs * .4) return;
  if (cities.some(o => Math.abs(o.x - x) < fs * 3.6 && Math.abs(o.y - y) < fs * 1.9)) return; cities.push({x, y, n: c[0], d: data && data[i]}); });
 return `<svg class="wx-map" viewBox="0 0 ${b[2].toFixed(1)} ${b[3].toFixed(1)}" preserveAspectRatio="xMidYMid slice" font-family="VT323,monospace">${wxMapBase(b)}${cities.map(c => `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})"><circle r="${u * .7}" fill="#fff"/><text y="${-fs * .25}" font-size="${fs * 1.35}" text-anchor="middle" fill="#ffe02a" stroke="#000" stroke-width="${u * .5}" paint-order="stroke">${c.d ? wxR(c.d.current.temperature_2m) : '--'}</text><text y="${fs * .95}" font-size="${fs * .78}" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="${u * .4}" paint-order="stroke">${c.n}</text></g>`).join('')}</svg>`; }
function wxRadSlide(box, rad, reg) { const b = wxMapBox(box.w / box.h), u = Math.min(b[2], b[3]) / 100, fs = u * (b[2] > b[3] ? 6.2 : 7.4);
 const tx0 = Math.floor(b[0] / 256), tx1 = Math.floor((b[0] + b[2]) / 256), ty0 = Math.floor(b[1] / 256), ty1 = Math.floor((b[1] + b[3]) / 256);
 const fr = rad ? (RM ? rad.frames.slice(-1) : rad.frames) : [];
 const layers = fr.map((f, k) => { let g = ''; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) g += `<image href="${rad.host}${f.path}/256/${WXZ}/${x}/${y}/4/1_1.png" x="${x * 256 - b[0]}" y="${y * 256 - b[1]}" width="256" height="256" style="image-rendering:pixelated"/>`;
  return `<g class="wx-rf" data-t="${f.time}" opacity="${k === fr.length - 1 ? 1 : 0}">${g}</g>`; }).join('');
 const dry = reg && reg.every(d => !(d.current.precipitation > 0) && d.current.weather_code < 51);
 const marks = WX_REG.filter((c, i) => [0, 4, 6, 10, 11, 13].includes(i)).map(c => { const x = wxX(c[2]) - b[0], y = wxY(c[1]) - b[1]; return x > fs && x < b[2] - fs * 2 && y > fs && y < b[3] - fs ? `<circle cx="${x}" cy="${y}" r="${u * .6}" fill="#fff"/><text x="${x + u * 1.4}" y="${y + fs * .3}" font-size="${fs * .8}" fill="#fff" stroke="#000" stroke-width="${u * .4}" paint-order="stroke">${c[0]}</text>` : ''; }).join('');
 return `<div class="wx-radw"><svg class="wx-map" viewBox="0 0 ${b[2].toFixed(1)} ${b[3].toFixed(1)}" preserveAspectRatio="xMidYMid slice" font-family="VT323,monospace">${wxMapBase(b)}<g opacity=".85">${layers}</g>${marks}</svg>
 <div class="wx-radt"></div>${!rad ? '<div class="wx-radn">RADAR UNAVAILABLE</div>' : dry ? '<div class="wx-radn">NO PRECIP IN AREA</div>' : ''}<div class="wx-cred">radar: RainViewer.com · temps: Open-Meteo.com</div></div>`; }
function wxRadAnim(main) { const gs = [...main.querySelectorAll('.wx-rf')], lbl = main.querySelector('.wx-radt'); if (!lbl) return;
 const fT = t => new Date(t * 1000).toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'}).toUpperCase();
 let k = gs.length - 1; const show = () => { gs.forEach((g, j) => g.setAttribute('opacity', j === k ? 1 : 0)); lbl.textContent = gs[k] ? fT(+gs[k].dataset.t) : ''; }; show();
 if (RM || gs.length < 2) return; let hold = 0; const iv = setInterval(() => { if (!gs[0].isConnected) return clearInterval(iv); if (k === gs.length - 1 && hold++ < 3) return; hold = 0; k = (k + 1) % gs.length; show(); }, 600); }
let wx = null;
function weatherFx(preview, opt) { opt = opt || {};
 if (fxs || mx) return; const saverOn = saverMode;
 const el = document.createElement('div'); el.id = 'matrix'; el.className = 'fx-weather' + (RM ? ' wx-rm' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'GRIM/WX local weather for the Lehigh Valley, press any key to exit');
 el.innerHTML = `<div class="wx-scr"><header class="wx-top"><div class="wx-badge"><span>THE GRIM</span><span>WEATHER</span><span>CHANNEL</span></div><div class="wx-face" role="img" aria-label="ASCII portrait of tomGRIM in sunglasses"><i></i></div><h3 class="wx-ttl"><span class="wx-t1"></span><span class="wx-t2"></span></h3><div class="wx-clk"><span class="wx-time"></span><span class="wx-date"></span></div></header><main class="wx-main"></main><div class="wx-np" role="status" aria-live="off"></div><footer class="wx-tick"><div class="wx-tk"></div></footer></div><div class="wx-vhs" aria-hidden="true"></div>`;
 document.body.appendChild(el);
 const $w = s => el.querySelector(s), main = $w('.wx-main');
 const st = {slide: 0, city: 0, data: null, failed: false, iv: 0, clk: 0};
 const fmtT = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit'}), fmtD = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric'});
 const tick = () => { const n = new Date(); $w('.wx-time').textContent = fmtT.format(n); $w('.wx-date').textContent = fmtD.format(n).replace(',', '').toUpperCase(); };
 const npUpd = () => { const b = $w('.wx-np'), t = curT(); if (!t) { b.hidden = true; return; } b.hidden = false; const dur = audio.duration || t.duration_sec || 0;
  if (!b.firstChild) b.innerHTML = '<span class="wx-npl">NOW PLAYING</span><span class="wx-npr"><span class="wx-npt"></span><button type="button" class="wx-skip" aria-label="skip to next song" title="next song"><svg viewBox="0 0 9 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1zM4 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1zM8 0h1v7h-1z"/></svg></button></span><span class="wx-nps"></span>';
  const tt = 'tomGRIM — ' + t.title, ss = `${audio.paused ? '❚❚' : '▶'} ${fmt(audio.currentTime || 0)} / ${fmt(dur)}`; if (b.querySelector('.wx-npt').textContent !== tt) b.querySelector('.wx-npt').textContent = tt; b.querySelector('.wx-nps').textContent = ss; };
 const title = (a, b) => { $w('.wx-t1').textContent = a; $w('.wx-t2').textContent = b; };
 const NA = '<div class="wx-na">DATA UNAVAILABLE</div><div class="wx-na2">THE GRIM WEATHER SATELLITE IS NOT RESPONDING. PLEASE STAND BY.</div>';
 const dayName = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short'}).toUpperCase();
 const slides = [
  () => { const i = st.city, d = st.data && st.data[i]; title(WX_CITIES[i][0], 'Current Conditions'); if (!d) return NA; const c = d.current, f = wxFeels(c);
   return `<div class="wx-cc"><div class="wx-ccl"><div class="wx-big">${wxR(c.temperature_2m)}°</div><div class="wx-cond">${wxCond(c.weather_code, c.is_day)}</div>${wxIcon(wxKind(c.weather_code, c.is_day))}</div>
   <dl class="wx-ccr"><dt>Humidity:</dt><dd>${wxR(c.relative_humidity_2m)}%</dd><dt>Dewpoint:</dt><dd>${wxR(c.dew_point_2m)}°</dd><dt>Wind:</dt><dd>${wxWind(c)}</dd><dt>Pressure:</dt><dd>${wxInHg(c.pressure_msl)} ${wxTrend(d)}</dd><dt>Visibility:</dt><dd>${wxVis(c.visibility)}</dd>${f ? `<dt>${f[0]}:</dt><dd>${f[1]}</dd>` : `<dt>Feels Like:</dt><dd>${wxR(c.apparent_temperature)}°</dd>`}</dl></div>`; },
  () => { title('Latest Observations', 'Lehigh Valley'); if (!st.data) return NA;
   return `<table class="wx-obs"><thead><tr><th></th><th>°F</th><th>WEATHER</th><th>WIND</th></tr></thead><tbody>${st.data.map((d, i) => `<tr><td>${WX_CITIES[i][0]}</td><td>${wxR(d.current.temperature_2m)}</td><td>${wxCond(d.current.weather_code, d.current.is_day, 1)}</td><td>${wxWind(d.current)}</td></tr>`).join('')}</tbody></table>`; },
  () => { title('Regional Temperatures', 'Eastern PA · NJ'); if (!st.reg) return NA; const r = main.getBoundingClientRect(); return wxRegSlide({w: r.width, h: r.height}, st.reg); },
  () => { title('Precipitation Radar', 'Eastern PA · NJ'); const r = main.getBoundingClientRect(); return wxRadSlide({w: r.width, h: r.height}, st.rad, st.reg); },
  () => { title(WX_CITIES[0][0], 'Extended Forecast'); const d = st.data && st.data[0]; if (!d) return NA; const y = d.daily;
   return `<div class="wx-ext">${[1, 2, 3].map(k => `<div class="wx-day"><div class="wx-dn">${dayName(y.time[k])}</div>${wxIcon(wxKind(y.weather_code[k]))}<div class="wx-dc">${wxCond(y.weather_code[k], 1, 1)}</div><div class="wx-pp">PRECIP ${y.precipitation_probability_max[k] || 0}%</div><div class="wx-hl"><span>Lo</span><span>Hi</span><b class="lo">${wxR(y.temperature_2m_min[k])}</b><b>${wxR(y.temperature_2m_max[k])}</b></div></div>`).join('')}</div>`; },
  () => { title('Almanac', WX_CITIES[0][0]); const d = st.data && st.data[0]; if (!d) return NA; const y = d.daily, tm = s => s ? new Date(s + ':00').toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}).toLowerCase() : '--', uv = v => v == null ? '--' : Math.round(v) + ' ' + (v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very High' : 'Extreme'), tr = {R: 'Rising', F: 'Falling', S: 'Steady'}[wxTrend(d)] || '';
   return `<table class="wx-alm"><thead><tr><th></th><th>${dayName(y.time[0])}</th><th>${dayName(y.time[1])}</th></tr></thead><tbody><tr><td>Sunrise:</td><td>${tm(y.sunrise[0])}</td><td>${tm(y.sunrise[1])}</td></tr><tr><td>Sunset:</td><td>${tm(y.sunset[0])}</td><td>${tm(y.sunset[1])}</td></tr><tr><td>UV Index:</td><td>${uv(y.uv_index_max[0])}</td><td>${uv(y.uv_index_max[1])}</td></tr><tr><td>Precip:</td><td>${y.precipitation_probability_max[0] || 0}%</td><td>${y.precipitation_probability_max[1] || 0}%</td></tr><tr><td>Gusts:</td><td colspan="2">${Math.round(d.current.wind_gusts_10m || 0)} mph now</td></tr><tr><td>Pressure:</td><td colspan="2">${wxInHg(d.current.pressure_msl)} in. ${tr}</td></tr></tbody></table>`; },
  () => { title('Local Forecast', 'Lehigh Valley'); const d = st.data && st.data[0]; if (!d) return NA; const y = d.daily, p = k => y.precipitation_probability_max[k] || 0, w = k => Math.round(y.wind_speed_10m_max[k] || 0);
   const now = new Date(), hr = +new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23'}).format(now), first = hr >= 17 ? 'TONIGHT' : 'TODAY';
   const s1 = first === 'TODAY' ? `${first}...${wxCond(y.weather_code[0], 1).toUpperCase()}. HIGH ${wxR(y.temperature_2m_max[0])}. ` : `${first}...LOW ${wxR(y.temperature_2m_min[1])}. `;
   const s2 = `${first === 'TODAY' ? 'WINDS UP TO ' + w(0) + ' MPH. ' : ''}${p(0) >= 20 ? 'CHANCE OF PRECIPITATION ' + p(0) + ' PERCENT.' : 'PRECIPITATION NOT EXPECTED.'}`;
   const s3 = ` ${dayName(y.time[1]).replace(/^(\w+)$/, m => ({SUN: 'SUNDAY', MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY', SAT: 'SATURDAY'})[m] || m)}...${wxCond(y.weather_code[1], 1).toUpperCase()}. HIGH ${wxR(y.temperature_2m_max[1])}.${p(1) >= 20 ? ' CHANCE OF PRECIPITATION ' + p(1) + ' PERCENT.' : ''}`;
   return `<div class="wx-txt">${s1}${s2}${s3}</div>`; }];
 const ticker = () => { const tk = $w('.wx-tk'); if (!st.data) { tk.textContent = 'GRIM/WX · DATA UNAVAILABLE · CHECK YOUR CONNECTION · NOW PLAYING ON GRIM/OS'; return; }
  tk.textContent = st.data.map((d, i) => { const c = d.current; return `${WX_CITIES[i][0].toUpperCase()}: HUMIDITY ${wxR(c.relative_humidity_2m)}%  DEWPOINT ${wxR(c.dew_point_2m)}°  PRESSURE ${wxInHg(c.pressure_msl)} in.`; }).join('   ·   ') + '   ·   DATA: OPEN-METEO.COM'; tk.style.animationDuration = Math.max(20, tk.textContent.length * .2) + 's'; };
 const show = () => { main.classList.remove('wx-in'); void main.offsetWidth; main.innerHTML = slides[st.slide](); main.classList.add('wx-in'); wxRadAnim(main); };
 st.go = n => { st.slide = n % slides.length; show(); if (st.iv) { clearInterval(st.iv); st.iv = setInterval(adv, RM ? 15000 : 9000); } };
 const adv = () => { st.slide = (st.slide + 1) % slides.length; if (st.slide === 0) st.city = (st.city + 1) % WX_CITIES.length; show(); };
 const stop = e => { if (!fxs || fxs.wx !== st) return; if (e && fxs.auto) wxAuto.dismissed = true; clearInterval(st.iv); clearInterval(st.clk); el.remove(); removeEventListener('keydown', onKey, true); fxs = null; wx = null; };
 const onKey = e => { e.preventDefault(); e.stopImmediatePropagation(); if (st.tune) return tuneIn(); stop(e); };
 fxs = {raf: 0, stop, name: 'weather', saver: saverOn, wx: st, auto: wxAuto.opening, link: !!opt.link}; wx = st;
 const tuneIn = () => { if (!st.tune) return; st.tune = false; const b = $w('.wx-tune'); if (b) b.remove(); try { if (!isPlaying()) toggle(); } catch (e) {} };
 if (opt.link) { st.tune = true; $w('.wx-scr').insertAdjacentHTML('beforeend', '<button type="button" class="wx-tune"><span>TAP TO TUNE IN</span><small>THE GRIM WEATHER CHANNEL · MUSIC BY tomGRIM</small></button>');
  el.addEventListener('pointerdown', e => { if (st.tune) e.stopImmediatePropagation(); }, true); el.addEventListener('click', () => tuneIn()); }
 el.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.wx-skip')) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); next(1); } }, true);
 el.addEventListener('click', e => { if (e.target.closest && e.target.closest('.wx-skip')) e.stopPropagation(); }, true);
 el.addEventListener('pointerdown', dblExit(stop)); setTimeout(() => addEventListener('keydown', onKey, true), 50);
 tick(); npUpd(); st.clk = setInterval(() => { tick(); npUpd(); }, 500); title('GRIM/WX', 'Lehigh Valley'); main.innerHTML = '<div class="wx-na2">RECEIVING SATELLITE DATA...</div>'; ticker();
 Promise.all([wxFetch(), wxRegFetch(), wxRadFetch()]).then(([d, rg, rd]) => { if (fxs && fxs.wx === st) { st.data = d || null; st.reg = rg || null; st.rad = rd || null; ticker(); show(); st.iv = setInterval(adv, RM ? 15000 : 9000); } });
 if (preview) say('GRIM/WX: local on the 8s for the Lehigh Valley · live data from open-meteo.com · any key or click exits');
}
window.__wx = () => ({on: !!wx, slide: wx && wx.slide, city: wx && wx.city, data: !!(wx && wx.data), cached: !!wxCache.data});
window.__wxGo = (n, city) => { if (!wx || !wx.go) return; if (city != null) wx.city = city; wx.go(n); };

/* ---------- init ---------- */
document.querySelectorAll('.brand').forEach(b => { b.textContent = 'GRIM/OS ' + GRIMOS_VERSION; });
setTheme(THEMES.includes(localStorage.grimTheme) ? localStorage.grimTheme : 'cyan', true); setCrt(localStorage.grimCrt !== '0', true);
if (localStorage.grimFlicker === '1' || (localStorage.grimFlicker == null && !RM)) document.body.classList.add('flicker');
refreshColors(); updateModes();
say('GRIM/OS grimsh ' + GRIMOS_VERSION + ' — type "help". press ? for keys.');
say('<div class="helpout"><div class="hf hn">motd: every track is free to download — type <button type="button" class="getlink" data-get="get "><b>get</b> <span class="sx-var">&lt;track#&gt;</span></button><span class="sep"> • </span><button type="button" class="getlink" data-get="get --list"><b>get</b> <span class="sx-flag">--list</span></button></div>' + helpSec(['fun', 'hack weather matrix glitch fire starfield plasma', [], 'click one to start it · any key or click exits']) + '</div>', true);
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.getlink'); if (!b) return; e.preventDefault(); const c = $('#cmd'); jump('shell'); if (b.dataset.run) { c.value = b.dataset.run; $('#prompt').requestSubmit(); return; } c.value = b.dataset.get; c.focus({preventScroll: true}); c.setSelectionRange(c.value.length, c.value.length); });
load().then(() => requestAnimationFrame(frame));
// screensaver now-playing readout (bottom-left, command-line style; never intercepts the click/key that dismisses the saver)
(() => { let el = null;
 const render = () => { const mxEl = document.getElementById('matrix'), on = !!mxEl && !mxEl.classList.contains('fx-weather') && !mxEl.classList.contains('fx-intro') && booted && !dead, t = curT();
  if (!el) { el = document.getElementById('npov'); if (el && el.parentNode !== document.body) document.body.appendChild(el); if (!el) { el = document.createElement('div'); el.id = 'npov'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'off'); document.body.appendChild(el); } }
  if (!on || !t) { el.hidden = true; return; } el.hidden = false;
  const dur = audio.duration || t.duration_sec || 0, cur = audio.currentTime || 0, w = innerWidth < 500 ? 14 : 22, f = dur ? Math.round(cur / dur * w) : 0;
  const al = t.al || {}, meta = [al.title && !t.single ? al.title : (t.single ? 'Single' : ''), al.year ? `(${al.year})` : ''].filter(Boolean).join(' ') + (t.bpm ? ` · ${t.bpm} bpm` : '');
  const r = typeof effRepeat === 'function' ? effRepeat() : repeat;
  el.innerHTML = `<span class="np-p">tom@grimos:~$</span> nowplaying\n<b>tomGRIM - ${escH(t.title)}</b>\n<span class="np-d">${escH(meta)}</span>\n${audio.paused ? '❚❚' : '▶'} ${fmt(cur)} [${'█'.repeat(f)}${'░'.repeat(w - f)}] ${fmt(dur)}\n<span class="np-d">repeat:${r} · shuffle:${shuffle ? 'on' : 'off'}</span>\n<span class="np-p">tom@grimos:~$</span> <span class="np-c"></span>`; };
 setInterval(render, 250); })();
})();
// Android address bar / status bar follows the active theme (was a fixed white #ffffff in light mode)
(() => { const m = document.querySelector('meta[name=theme-color]'); if (!m) return; const upd = () => { const c = getComputedStyle(document.body).getPropertyValue('--bg').trim(); if (c) m.content = c; }; upd(); new MutationObserver(upd).observe(document.body, {attributes: true, attributeFilter: ['class']}); })();
