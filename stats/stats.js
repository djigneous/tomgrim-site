/* GRIM/STATS — private dashboard. Data comes only from the passphrase-gated get_stats RPC. */
(() => { 'use strict';
const U = 'https://hlbllxgiexjqkqfmoxow.supabase.co/rest/v1/rpc/', KEY = 'sb_publishable_ZAXjx3TioEoF2E0UfFWndg_PaI7NsDl';
const $ = s => document.querySelector(s), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
try { const t = localStorage.grimTheme; if (t) document.body.className = 'theme-' + t; } catch (e) {}
const rpc = (fn, b) => fetch(U + fn, {method: 'POST', headers: {apikey: KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then(r => r.json());
let D = null, TITLES = {};
const st = {sect: (location.hash || '#traffic').slice(1), range: '7d', who: 'human', f: {}};
fetch('/tracks.json').then(r => r.json()).then(j => { (j.albums || []).forEach(a => (a.tracks || []).forEach(t => { TITLES[t.file] = t.title; })); if (D) render(); }).catch(() => {});
const title = f => TITLES[f] || String(f).split('/').pop().replace(/\.mp3$/, '');

/* ---------- login (terminal-styled) ---------- */
const tty = $('#ttyout'), pw = $('#pw');
function showLogin(msg) { $('#dash').hidden = true; $('#login').hidden = false;
 tty.textContent = (msg ? msg + '\n\n' : '') + 'GRIM/OS 1.3.4 (Downtempo) tty1\n'; pw.value = ''; pw.focus(); }
$('#login').addEventListener('click', e => { if (!e.target.closest('input')) pw.focus(); });
$('#lform').addEventListener('submit', e => { e.preventDefault(); const p = pw.value; if (!p) return; load(p, true); });
async function load(p, fromLogin) {
 let r; try { r = await rpc('get_stats', {p_pass: p}); } catch (e) { return showLogin('carrier lost — could not reach the stats server.'); }
 if (!r || r.error || r.code) { try { localStorage.removeItem('grimStatsPass'); } catch (e) {}
  return showLogin(r && r.error === 'locked' ? 'Too many failed logins. Locked for a while.' : (fromLogin ? 'Login incorrect' : '')); }
 try { localStorage.grimStatsPass = p; localStorage.grimOwner = '1'; } catch (e) {}
 D = r; prep(); $('#login').hidden = true; $('#dash').hidden = false; render(); }

/* ---------- data prep ---------- */
const host = r => { if (!r) return '(direct)'; try { return new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return '(other)'; } };
const device = ua => /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
const browser = ua => /edg\//i.test(ua) ? 'edge' : /firefox|fxios/i.test(ua) ? 'firefox' : /chrome|crios/i.test(ua) ? 'chrome' : /safari/i.test(ua) ? 'safari' : 'other';
const dayKey = t => new Date(t).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
function prep() { (D.visits || []).forEach(v => { v.human = v.k === 'human'; v.host = host(v.ref); v.dev = device(v.ua || '') + ' · ' + browser(v.ua || ''); v.day = dayKey(v.t); v.ms = +new Date(v.t); v.tracks = v.tracks || []; v.country = v.country || '??'; }); }
function since() { const now = Date.now(); if (st.range === 'today') { const d = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})); d.setHours(0, 0, 0, 0); return now - (new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})) - d); }
 return now - ({'7d': 7, '30d': 30, '90d': 90})[st.range] * 864e5; }
const DIMS = {host: 'referrer', country: 'country', tz: 'timezone', dev: 'device', path: 'page', track: 'track', day: 'day', k: 'class'};
function rows(ignoreWho) { const s = since(), f = st.f; return (D.visits || []).filter(v => v.ms >= s && (ignoreWho || st.who === 'all' || (st.who === 'human') === v.human)
 && Object.keys(f).every(k => k === 'track' ? v.tracks.includes(f[k]) : String(v[k]) === String(f[k]))); }
function count(list, key, n) { const m = new Map(); list.forEach(v => { const ks = key(v); (Array.isArray(ks) ? ks : [ks]).forEach(k => m.set(k, (m.get(k) || 0) + 1)); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n || 12); }

/* ---------- render ---------- */
const win = (t, h, wide) => `<section class="win${wide ? ' wide' : ''}"><h2 class="wt"><span>─[ ${t} ]─</span></h2>${h}</section>`;
const fl = (k, v, label) => `<a href="#" data-fk="${esc(k)}" data-fv="${esc(v)}" title="filter: ${esc(DIMS[k] || k)} = ${esc(v)}">${esc(label == null ? v : label)}</a>`;
function table(list, k, label) { if (!list.length) return '<div class="empty">nothing yet.</div>'; const mx = list[0][1] || 1;
 return '<table class="list">' + list.map(([v, n]) => `<tr><td>${k ? fl(k, v, label ? label(v) : v) : esc(label ? label(v) : v)}</td><td class="b"><span class="bar" style="width:${Math.max(1, n / mx * 100)}%"></span></td><td class="n">${n}</td></tr>`).join('') + '</table>'; }
function chart(list, days) { const by = {}; list.forEach(v => { const b = by[v.day] || (by[v.day] = {h: 0, b: 0}); v.human ? b.h++ : b.b++; });
 const keys = []; for (let i = days - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * 864e5));
 const mx = Math.max(1, ...keys.map(k => by[k] ? (st.who === 'human' ? by[k].h : st.who === 'bot' ? by[k].b : by[k].h + by[k].b) : 0));
 return `<div class="chart">${keys.map(k => { const b = by[k] || {h: 0, b: 0}, h = st.who === 'bot' ? 0 : b.h, bt = st.who === 'human' ? 0 : b.b;
  return `<a href="#" data-fk="day" data-fv="${k}" class="${st.f.day === k ? 'on' : ''}" title="${k}: ${b.h} human · ${b.b} bot"><i style="height:${h / mx * 100}%"></i><i class="bt" style="height:${bt / mx * 100}%"></i></a>`; }).join('')}</div><div class="axis"><span>${keys[0]}</span><span>${keys[keys.length - 1]}</span></div>`; }
function render() { if (!D) return;
 document.querySelectorAll('#sect a').forEach(a => a.classList.toggle('on', a.dataset.s === st.sect));
 document.querySelectorAll('#range a').forEach(a => a.classList.toggle('on', a.dataset.r === st.range));
 document.querySelectorAll('#who a').forEach(a => a.classList.toggle('on', a.dataset.w === st.who));
 $('#chips').innerHTML = Object.entries(st.f).map(([k, v]) => `<span class="chip">${esc(DIMS[k] || k)}: <span class="hi">${esc(k === 'track' ? title(v) : v)}</span><a href="#" data-unf="${esc(k)}" aria-label="clear filter">✕</a></span>`).join('') + (Object.keys(st.f).length > 1 ? '<a href="#" data-unf="*">clear all</a>' : '');
 const R = rows(), all = rows(true), H = all.filter(v => v.human), B = all.filter(v => !v.human), days = st.range === 'today' ? 1 : st.range === '7d' ? 7 : st.range === '30d' ? 30 : 90;
 let h = '';
 if (st.sect === 'traffic') {
  const uniq = new Set(H.map(v => v.vid)).size, dw = H.filter(v => v.dwell_ms > 0), avg = dw.length ? Math.round(dw.reduce((a, v) => a + Math.min(v.dwell_ms, 36e5), 0) / dw.length / 1000) : 0;
  h += win('overview', `<div class="kpis"><div class="kpi"><b>${uniq}</b><span>unique humans</span></div><div class="kpi"><b>${H.length}</b><span>human visits</span></div><div class="kpi"><b>${B.length}</b><span>bot visits</span></div><div class="kpi"><b>${avg}s</b><span>avg human time</span></div><div class="kpi"><b>${H.reduce((a, v) => a + v.tracks.length, 0)}</b><span>tracks played</span></div></div>`, true);
  h += win(`visits per day · ${st.who === 'all' ? 'humans (bright) + bots (dim)' : st.who}`, days > 1 ? chart(R, days) : `<div class="kpis"><div class="kpi"><b>${R.length}</b><span>visits today</span></div></div>`, true);
  h += win('referrers', table(count(R, v => v.host), 'host'));
  h += win('countries', table(count(R, v => v.country), 'country'));
  h += win('timezones', table(count(R, v => v.tz || '?'), 'tz'));
  h += win('devices', table(count(R, v => v.dev), 'dev'));
  h += win('pages', table(count(R, v => v.path || '/'), 'path'));
  h += win('bots by reason', table(count(rows(true).filter(v => !v.human), v => v.k), 'k'));
 } else if (st.sect === 'music') {
  const s = since(), likes = (D.likes || []).filter(l => +new Date(l.t) >= s), byDay = {};
  likes.forEach(l => { const k = dayKey(l.t); byDay[k] = (byDay[k] || 0) + 1; });
  h += win('most played (visits)', table(count(R, v => v.tracks, 15), 'track', title));
  h += win(`most liked · ${likes.length} in range · ${(D.likes || []).length} total`, table(count(likes, l => l.file, 15), 'track', title));
  const keys = []; for (let i = days - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * 864e5)); const mx = Math.max(1, ...keys.map(k => byDay[k] || 0));
  h += win('likes over time', `<div class="chart">${keys.map(k => `<a href="#" title="${k}: ${byDay[k] || 0} likes"><i style="height:${(byDay[k] || 0) / mx * 100}%"></i></a>`).join('')}</div><div class="axis"><span>${keys[0]}</span><span>${keys[keys.length - 1]}</span></div>`, true);
  const posts = (D.bbs.posts || []).filter(t => +new Date(t) >= s).length;
  h += win('bbs ~/feedback', `<div class="kpis"><div class="kpi"><b>${posts}</b><span>posts in range</span></div><div class="kpi"><b>${D.bbs.total}</b><span>total posts</span></div><div class="kpi"><b>${D.bbs.hidden}</b><span>hidden</span></div></div>`);
 } else if (st.sect === 'socials') h += socials();
 else {
  h += win(`recent visits · ${R.length}`, '<div class="scroll"><table class="log">' + R.slice(0, 200).map(v => `<tr><td class="dim">${esc(new Date(v.t).toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}))}</td><td>${v.human ? '<span class="tag h">HUMAN</span>' : `<span class="tag b">${esc(v.k.replace('bot:', 'BOT:'))}</span>`}</td><td>${fl('path', v.path || '/')}</td><td>${fl('host', v.host)}</td><td>${fl('country', v.country)}</td><td class="dim">${esc(v.vid || '')}</td><td>${Math.round((v.dwell_ms || 0) / 1000)}s${v.interacted ? ' ✓' : ''}</td><td>${v.tracks.length ? v.tracks.map(t => fl('track', t, '♪ ' + title(t))).join(' ') : ''}</td><td class="ua">${esc(v.dev)} — ${esc(v.ua || '')}</td></tr>`).join('') + '</table></div>' + (R.length ? '' : '<div class="empty">no visits match.</div>'), true);
 }
 $('#body').innerHTML = h;
 $('#owner').innerHTML = `this browser is marked as <span class="hi">owner</span> — its visits to thomasgrim.com are not logged. <a href="#" id="unowner">stop excluding this browser</a> · updated ${esc(new Date(D.now).toLocaleString('en-US', {timeZone: 'America/New_York'}))} ET`; }
function socials() { const S = D.social || [], last = src => [...S].reverse().find(x => x.source === src), hist = src => S.filter(x => x.source === src);
 const spark = (src, key) => { const pts = hist(src).map(x => x.data[key]).filter(x => x != null); if (pts.length < 2) return '<span class="dim">(growth shows after a few snapshots)</span>'; const d = pts[pts.length - 1] - pts[0]; return `<span class="dim">${pts.length} snapshots · ${d >= 0 ? '+' : ''}${d} since ${esc(new Date(hist(src)[0].at).toLocaleDateString('en-CA'))}</span>`; };
 const yt = last('youtube'), tt = last('tiktok'), sp = last('spotify'); let h = '';
 if (!S.length) return win('socials', '<div class="empty">no snapshots yet — the collector runs every 6 hours.</div>', true);
 if (yt) { const it = (yt.data.items || []).slice().sort((a, b) => (b.views || 0) - (a.views || 0)); const mx = Math.max(1, ...it.map(x => x.views || 0));
  h += win(`youtube ${esc(yt.data.handle)}`, `<div class="kpis"><div class="kpi"><b>${yt.data.subscribers ?? '?'}</b><span>subscribers</span></div><div class="kpi"><b>${it.reduce((a, x) => a + (x.views || 0), 0)}</b><span>views (listed)</span></div></div><p>${spark('youtube', 'subscribers')}</p>
   <table class="list">${it.map(x => `<tr><td><a href="https://www.youtube.com/${x.kind === 'short' ? 'shorts/' : 'watch?v='}${esc(x.id)}" target="_blank" rel="noopener">${esc(x.title)}</a> <span class="dim">${x.kind}</span></td><td class="b"><span class="bar" style="width:${Math.max(1, (x.views || 0) / mx * 100)}%"></span></td><td class="n">${x.views ?? '?'}</td></tr>`).join('')}</table><p class="dim">views from the public channel pages · likes/comments per video need a YouTube Data API key.</p>`, true); }
 if (tt) h += win(`tiktok ${esc(tt.data.handle)}`, `<div class="kpis"><div class="kpi"><b>${tt.data.followers ?? '?'}</b><span>followers</span></div><div class="kpi"><b>${tt.data.hearts ?? '?'}</b><span>total likes</span></div><div class="kpi"><b>${tt.data.videos ?? '?'}</b><span>videos</span></div></div><p>${spark('tiktok', 'followers')}</p><p class="dim">per-video views/likes/comments are not in TikTok's public profile page; they need TikTok's API.</p>`);
 if (sp) h += win('spotify', `<div class="kpis"><div class="kpi"><b>${sp.data.monthly_listeners || '—'}</b><span>monthly listeners</span></div><div class="kpi"><b>${sp.data.followers || '—'}</b><span>followers</span></div></div><p class="dim">${esc(sp.data.note || 'read from the public artist page; may be unreliable.')} <a href="https://artists.spotify.com/" target="_blank" rel="noopener">Spotify for Artists</a> has the real numbers.</p>`);
 h += `<p class="dim" style="grid-column:1/-1">last snapshot ${esc(new Date(S[S.length - 1].at).toLocaleString('en-US', {timeZone: 'America/New_York'}))} ET · collected server-side every 6 hours.</p>`;
 return h; }

/* ---------- clicks (no command input anywhere on the dashboard) ---------- */
document.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return;
 if (a.dataset.s) { e.preventDefault(); st.sect = a.dataset.s; history.replaceState(null, '', '#' + st.sect); return render(); }
 if (a.dataset.r) { e.preventDefault(); st.range = a.dataset.r; return render(); }
 if (a.dataset.w) { e.preventDefault(); st.who = a.dataset.w; return render(); }
 if (a.dataset.fk) { e.preventDefault(); const k = a.dataset.fk, v = a.dataset.fv; if (st.f[k] === v) delete st.f[k]; else st.f[k] = v; if (k === 'k') st.who = v === 'human' ? 'human' : 'bot'; if (k === 'track' && st.sect !== 'log') st.sect = 'log'; return render(); }
 if (a.dataset.unf) { e.preventDefault(); if (a.dataset.unf === '*') st.f = {}; else delete st.f[a.dataset.unf]; return render(); }
 if (a.id === 'refresh') { e.preventDefault(); return load(localStorage.grimStatsPass); }
 if (a.id === 'logout') { e.preventDefault(); localStorage.removeItem('grimStatsPass'); D = null; return showLogin('logout'); }
 if (a.id === 'unowner') { e.preventDefault(); localStorage.removeItem('grimOwner'); a.parentElement.innerHTML = 'owner flag removed — this browser\'s visits will be logged again. (log in here to re-enable)'; } });

let saved = null; try { saved = localStorage.grimStatsPass; } catch (e) {}
if (saved) load(saved); else showLogin();
})();
