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
 tty.textContent = (msg ? msg + '\n\n' : '') + 'GRIM/OS 1.3.9 (Downtempo) tty1\n'; pw.value = ''; pw.focus(); }
$('#login').addEventListener('click', e => { if (!e.target.closest('input')) pw.focus(); });
$('#lform').addEventListener('submit', e => { e.preventDefault(); const p = pw.value; if (!p) return; load(p, true); });
async function load(p, fromLogin) {
 let r; try { r = await rpc('get_stats', {p_pass: p}); } catch (e) { return showLogin('carrier lost — could not reach the stats server.'); }
 if (!r || r.error || r.code) { try { localStorage.removeItem('grimStatsPass'); } catch (e) {}
  return showLogin(r && r.error === 'locked' ? 'Too many failed logins. Locked for a while.' : (fromLogin ? 'Login incorrect' : '')); }
 try { localStorage.grimStatsPass = p; localStorage.grimOwner = '1'; } catch (e) {}
 D = r; prep(); $('#login').hidden = true; $('#dash').hidden = false; render(); review(); }

/* ---------- data prep ---------- */
const host = r => { if (!r) return '(direct)'; try { return new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return '(other)'; } };
const device = ua => /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
const browser = ua => /edg\//i.test(ua) ? 'edge' : /firefox|fxios/i.test(ua) ? 'firefox' : /chrome|crios/i.test(ua) ? 'chrome' : /safari/i.test(ua) ? 'safari' : 'other';
const dayKey = t => new Date(t).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
/* ---------- visitors: UA parsing, bot names, friendly names (no fingerprinting beyond the server-side salted hash) ---------- */
const BOTS = [['Googlebot', /googlebot/i], ['Google-InspectionTool', /google-inspectiontool/i], ['GoogleOther', /googleother/i], ['Google-Extended', /google-extended/i], ['Bingbot', /bingbot|bingpreview/i], ['Applebot', /applebot/i],
 ['DuckDuckBot', /duckduck/i], ['YandexBot', /yandex/i], ['Baiduspider', /baidu/i], ['GPTBot', /gptbot/i], ['ChatGPT-User', /chatgpt-user/i], ['OAI-SearchBot', /oai-searchbot/i], ['ClaudeBot', /claude/i], ['PerplexityBot', /perplexity/i],
 ['CCBot', /ccbot/i], ['Bytespider', /bytespider/i], ['Amazonbot', /amazonbot/i], ['AhrefsBot', /ahrefs/i], ['SemrushBot', /semrush/i], ['MJ12bot', /mj12/i], ['DotBot', /dotbot/i], ['PetalBot', /petal/i],
 ['Facebook preview', /facebookexternalhit|facebot|meta-externalagent/i], ['Twitterbot', /twitterbot/i], ['Discordbot', /discord/i], ['Slackbot', /slack/i], ['TelegramBot', /telegram/i], ['WhatsApp preview', /whatsapp/i],
 ['Lighthouse', /lighthouse|pagespeed/i], ['Headless Chrome', /headlesschrome/i], ['Playwright', /playwright/i], ['curl', /curl\//i], ['wget', /wget/i], ['python', /python/i], ['Go http client', /go-http/i], ['node-fetch', /node-fetch|axios/i]];
const botName = ua => { for (const [n, re] of BOTS) if (re.test(ua)) return n; const m = ua.match(/([\w-]*(?:bot|crawler|spider)[\w-]*)/i); return m ? m[1] : ''; };
const uaInfo = ua => { const b = (re, n) => { const m = ua.match(re); return m ? n + ' ' + m[1] : null; };
 const br = b(/edg(?:e|a|ios)?\/(\d+)/i, 'Edge') || b(/opr\/(\d+)/i, 'Opera') || b(/samsungbrowser\/(\d+)/i, 'Samsung') || b(/(?:firefox|fxios)\/(\d+)/i, 'Firefox') || b(/(?:chrome|crios)\/(\d+)/i, 'Chrome') || (/safari/i.test(ua) ? (b(/version\/(\d+)/i, 'Safari') || 'Safari') : 'other');
 const os = /windows nt/i.test(ua) ? 'Windows' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /cros/i.test(ua) ? 'ChromeOS' : /mac os x|macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : '?';
 return {br, os, dev: device(ua)}; };
const ADJ = ['Neon', 'Static', 'Velvet', 'Amber', 'Chrome', 'Midnight', 'Phantom', 'Cobalt', 'Ember', 'Glass', 'Lunar', 'Rusty', 'Silent', 'Pixel', 'Analog', 'Electric', 'Hollow', 'Frosted', 'Crimson', 'Quantum', 'Dusty', 'Solar', 'Feral', 'Copper'];
const ANI = ['Fox', 'Moth', 'Raven', 'Lynx', 'Otter', 'Heron', 'Wolf', 'Gecko', 'Owl', 'Koi', 'Badger', 'Falcon', 'Hare', 'Viper', 'Bison', 'Crane', 'Mantis', 'Jackal', 'Panda', 'Squid', 'Marten', 'Ibis', 'Yak', 'Wren'];
const vname = fp => { let h = 2166136261; for (const c of String(fp)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return `${ADJ[h % ADJ.length]} ${ANI[(h >>> 8) % ANI.length]} ${(h >>> 16) % 90 + 10}`; };
const loc = v => [v.city, v.region, v.country !== '??' ? v.country : ''].filter(Boolean).join(', ') || '??';
function prep() { (D.visits || []).forEach(v => { v.human = v.k === 'human'; const ua = v.ua || '', bn = botName(ua); v.ui = uaInfo(ua); v.name = !v.human && bn ? '🤖 ' + bn : vname(v.fp || v.vid); v.loc = loc(v); v.host = host(v.ref); v.dev = device(v.ua || '') + ' · ' + browser(v.ua || ''); v.day = dayKey(v.t); v.ms = +new Date(v.t); v.tracks = v.tracks || []; v.country = v.country || '??'; }); }
function since() { const now = Date.now(); if (st.range === 'today') { const d = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})); d.setHours(0, 0, 0, 0); return now - (new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})) - d); }
 return now - ({'7d': 7, '30d': 30, '90d': 90})[st.range] * 864e5; }
const DIMS = {fp: 'visitor', loc: 'location', host: 'referrer', country: 'country', tz: 'timezone', dev: 'device', path: 'page', track: 'track', day: 'day', k: 'class'};
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
/* ---------- SVG line charts (theme-styled, no libraries) ---------- */
function allDays() { const m = new Map((D.daily || []).map(x => [x.d, x])); const out = []; if (!D.daily || !D.daily.length) return out;
 const end = dayKey(Date.now()); for (let t = +new Date(D.daily[0].d + 'T12:00:00'); ; t += 864e5) { const k = dayKey(t); const x = m.get(k) || {h: 0, b: 0}; out.push({d: k, h: x.h, b: x.b}); if (k >= end || out.length > 3650) break; } return out; }
function lineChart(days, series, label) { if (!days.length) return '<div class="empty">no visits yet.</div>';
 const W = 640, H = 170, P = 26, n = days.length, mx = Math.max(1, ...series.flatMap(s => s.pts)), X = i => P + (n === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (n - 1)), Y = v => H - P + 4 - v / mx * (H - 2 * P);
 const grid = [0, .5, 1].map(f => `<line x1="${P}" x2="${W - P}" y1="${Y(mx * f)}" y2="${Y(mx * f)}" class="gl"/><text x="2" y="${Y(mx * f) + 4}" class="gt">${Math.round(mx * f)}</text>`).join('');
 const lines = series.map(s => `<polyline class="ln ${s.cls}" points="${s.pts.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')}"/>` + s.pts.map((v, i) => `<circle class="pt ${s.cls}" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${n > 60 ? 1.2 : 2.4}"><title>${days[i].d}: ${v} ${s.name}</title></circle>`).join('')).join('');
 return `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">${grid}${lines}</svg><div class="axis"><span>${days[0].d}</span><span class="lg">${series.map(s => `<span class="${s.cls}">━ ${esc(s.name)} (${s.pts[s.pts.length - 1]}${s.cum ? ' total' : ' last day'})</span>`).join(' ')}</span><span>${days[n - 1].d}</span></div>`; }
function cumul(a) { let t = 0; return a.map(v => t += v); }
function render() { if (!D) return;
 document.querySelectorAll('#sect a').forEach(a => a.classList.toggle('on', a.dataset.s === st.sect));
 document.querySelectorAll('#range a').forEach(a => a.classList.toggle('on', a.dataset.r === st.range));
 document.querySelectorAll('#who a').forEach(a => a.classList.toggle('on', a.dataset.w === st.who));
 $('#chips').innerHTML = Object.entries(st.f).map(([k, v]) => `<span class="chip">${esc(DIMS[k] || k)}: <span class="hi">${esc(k === 'track' ? title(v) : v)}</span><a href="#" data-unf="${esc(k)}" aria-label="clear filter">✕</a></span>`).join('') + (Object.keys(st.f).length > 1 ? '<a href="#" data-unf="*">clear all</a>' : '');
 const R = rows(), all = rows(true), H = all.filter(v => v.human), B = all.filter(v => !v.human), days = st.range === 'today' ? 1 : st.range === '7d' ? 7 : st.range === '30d' ? 30 : 90;
 let h = '';
 if (st.sect === 'traffic') {
  const uniq = new Set(H.map(v => v.vid)).size, dw = H.filter(v => v.dwell_ms > 0), avg = dw.length ? Math.round(dw.reduce((a, v) => a + Math.min(v.dwell_ms, 36e5), 0) / dw.length / 1000) : 0;
  h += win('overview', `<div class="kpis"><div class="kpi"><b>${uniq}</b><span>unique humans</span></div><div class="kpi" data-m="h"><b>${H.length}</b><span>human visits</span></div><div class="kpi" data-m="b"><b>${B.length}</b><span>bot visits</span></div><div class="kpi"><b>${avg}s</b><span>avg human time</span></div><div class="kpi"><b>${H.reduce((a, v) => a + v.tracks.length, 0)}</b><span>tracks played</span></div></div>`, true);
  const AD = allDays();
  h += win('total visits since tracking began · humans vs bots', lineChart(AD, [{name: 'human', cls: 'h', cum: 1, pts: cumul(AD.map(x => x.h))}, {name: 'bot', cls: 'b', cum: 1, pts: cumul(AD.map(x => x.b))}], 'cumulative visits, human and bot'), true);
  h += win('daily visits since tracking began', lineChart(AD, [{name: 'human', cls: 'h', pts: AD.map(x => x.h)}, {name: 'bot', cls: 'b', pts: AD.map(x => x.b)}], 'daily visits, human and bot'), true);
  h += win(`visits per day · ${st.who === 'all' ? 'humans (bright) + bots (dim)' : st.who}`, days > 1 ? chart(R, days) : `<div class="kpis"><div class="kpi"><b>${R.length}</b><span>visits today</span></div></div>`, true);
  h += win('referrers', table(count(R, v => v.host), 'host'));
  h += win('countries', table(count(R, v => v.country), 'country'));
  h += win('locations (city, region)', table(count(R, v => v.loc), 'loc'));
  h += win('timezones', table(count(R, v => v.tz || '?'), 'tz'));
  h += win('devices', table(count(R, v => v.dev), 'dev'));
  h += win('pages', table(count(R, v => v.path || '/'), 'path'));
  h += win('bots by reason', table(count(rows(true).filter(v => !v.human), v => v.k), 'k'));
 } else if (st.sect === 'music') {
  const s = since(), likes = (D.likes || []).filter(l => +new Date(l.t) >= s), byDay = {};
  likes.forEach(l => { const k = dayKey(l.t); byDay[k] = (byDay[k] || 0) + 1; });
  h += win('most played (visits)', table(count(R, v => v.tracks, 15), 'track', title));
  h += win(`most liked · ${likes.length} in range · <span data-m="likes">${(D.likes || []).length} total</span>`, table(count(likes, l => l.file, 15), 'track', title));
  const keys = []; for (let i = days - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * 864e5)); const mx = Math.max(1, ...keys.map(k => byDay[k] || 0));
  h += win('likes over time', `<div class="chart">${keys.map(k => `<a href="#" title="${k}: ${byDay[k] || 0} likes"><i style="height:${(byDay[k] || 0) / mx * 100}%"></i></a>`).join('')}</div><div class="axis"><span>${keys[0]}</span><span>${keys[keys.length - 1]}</span></div>`, true);
  const posts = (D.bbs.posts || []).filter(t => +new Date(t) >= s).length;
  h += win('bbs ~/feedback', `<div class="kpis"><div class="kpi"><b>${posts}</b><span>posts in range</span></div><div class="kpi" data-m="posts"><b>${D.bbs.total}</b><span>total posts</span></div><div class="kpi"><b>${D.bbs.hidden}</b><span>hidden</span></div></div>`);
 } else if (st.sect === 'socials') h += socials();
 else {
  const G = new Map(); R.forEach(v => { const g = G.get(v.fp) || G.set(v.fp, {fp: v.fp, name: v.name, human: false, n: 0, first: v.ms, last: v.ms, lastId: 0, v}).get(v.fp); g.n++; g.human = g.human || v.human; g.first = Math.min(g.first, v.ms); if (v.ms >= g.last) { g.last = v.ms; g.v = v; } g.lastId = Math.max(g.lastId, v.id); });
  const VS = [...G.values()].sort((a, b) => b.last - a.last), fdt = t => new Date(t).toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
  h += win(`visitors · ${VS.length} (grouped by device + connection)`, '<div class="scroll"><table class="log"><tr class="dim"><td>visitor</td><td>class</td><td>visits</td><td>first seen</td><td>last seen</td><td>location</td><td>browser · os · device</td><td>screen</td><td>tz · lang</td></tr>' + VS.slice(0, 300).map(g => `<tr class="${PREV && g.lastId > PREV.maxid ? 'chg' : ''}"><td>${fl('fp', g.fp, g.name)}</td><td>${g.human ? '<span class="tag h">HUMAN</span>' : '<span class="tag b">BOT</span>'}</td><td class="n">${g.n}</td><td class="dim">${esc(fdt(g.first))}</td><td>${esc(fdt(g.last))}</td><td>${fl('loc', g.v.loc)}</td><td>${esc(g.v.ui.br)} · ${esc(g.v.ui.os)} · ${esc(g.v.ui.dev)}</td><td class="dim">${esc(g.v.screen || '')}</td><td class="dim">${esc(g.v.tz || '')} · ${esc(g.v.lang || '')}</td></tr>`).join('') + '</table></div><p class="dim">visitor = salted hash of IP + browser + screen + timezone (raw IPs are never stored); names are generated from that hash. Same person on a new network or device shows as a new visitor. Visits before 1.3.7 are grouped by their browser id only.</p>', true);
  h += win(`recent visits · ${R.length}`, '<div class="scroll"><table class="log">' + R.slice(0, 200).map(v => `<tr class="${PREV && v.id > PREV.maxid ? 'chg' : ''}"><td class="dim">${esc(new Date(v.t).toLocaleString('en-US', {timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}))}</td><td>${v.human ? '<span class="tag h">HUMAN</span>' : `<span class="tag b">${esc(v.k.replace('bot:', 'BOT:'))}</span>`}</td><td>${fl('path', v.path || '/')}</td><td>${fl('host', v.host)}</td><td>${fl('fp', v.fp, v.name)}</td><td>${fl('loc', v.loc)}</td><td>${Math.round((v.dwell_ms || 0) / 1000)}s${v.interacted ? ' ✓' : ''}</td><td>${v.tracks.length ? v.tracks.map(t => fl('track', t, '♪ ' + title(t))).join(' ') : ''}</td><td class="ua">${esc(v.ui.br)} · ${esc(v.ui.os)} · ${esc(v.ui.dev)} · ${esc(v.screen || '')} — ${esc(v.ua || '')}</td></tr>`).join('') + '</table></div>' + (R.length ? '' : '<div class="empty">no visits match.</div>'), true);
 }
 $('#body').innerHTML = h; markChanged();
 $('#owner').innerHTML = `this browser is marked as <span class="hi">owner</span> — its visits to thomasgrim.com are not logged. <a href="#" id="unowner">stop excluding this browser</a> · updated ${esc(new Date(D.now).toLocaleString('en-US', {timeZone: 'America/New_York'}))} ET`; }
function socials() { const S = D.social || [], last = src => [...S].reverse().find(x => x.source === src), hist = src => S.filter(x => x.source === src);
 const spark = (src, key) => { const pts = hist(src).map(x => x.data[key]).filter(x => x != null); if (pts.length < 2) return '<span class="dim">(growth shows after a few snapshots)</span>'; const d = pts[pts.length - 1] - pts[0]; return `<span class="dim">${pts.length} snapshots · ${d >= 0 ? '+' : ''}${d} since ${esc(new Date(hist(src)[0].at).toLocaleDateString('en-CA'))}</span>`; };
 const yt = last('youtube'), tt = last('tiktok'), sa = last('spotify_artists'), sp = last('spotify'); let h = '';
 if (!S.length) return win('socials', '<div class="empty">no snapshots yet — the collector runs every 6 hours.</div>', true);
 if (yt) { const it = (yt.data.items || []).slice().sort((a, b) => (b.views || 0) - (a.views || 0)); const mx = Math.max(1, ...it.map(x => x.views || 0));
  h += win(`youtube ${esc(yt.data.handle)}`, `<div class="kpis"><div class="kpi" data-m="yt_subs"><b>${yt.data.subscribers ?? '?'}</b><span>subscribers</span></div><div class="kpi" data-m="yt_views"><b>${it.reduce((a, x) => a + (x.views || 0), 0)}</b><span>views (listed)</span></div></div><p>${spark('youtube', 'subscribers')}</p>
   <table class="list">${it.map(x => `<tr><td><a href="https://www.youtube.com/${x.kind === 'short' ? 'shorts/' : 'watch?v='}${esc(x.id)}" target="_blank" rel="noopener">${esc(x.title)}</a> <span class="dim">${x.kind}</span></td><td class="b"><span class="bar" style="width:${Math.max(1, (x.views || 0) / mx * 100)}%"></span></td><td class="n">${x.views ?? '?'}</td></tr>`).join('')}</table><p class="dim">views from the public channel pages · likes/comments per video need a YouTube Data API key.</p>`, true); }
 if (tt) h += win(`tiktok ${esc(tt.data.handle)}`, `<div class="kpis"><div class="kpi" data-m="tt_followers"><b>${tt.data.followers ?? '?'}</b><span>followers</span></div><div class="kpi" data-m="tt_hearts"><b>${tt.data.hearts ?? '?'}</b><span>total likes</span></div><div class="kpi" data-m="tt_videos"><b>${tt.data.videos ?? '?'}</b><span>videos</span></div></div><p>${spark('tiktok', 'followers')}</p><p class="dim">per-video views/likes/comments are not in TikTok's public profile page; they need TikTok's API.</p>`);
 if (sa) { const d = sa.data, k = (m, v, l) => `<div class="kpi" data-m="${m}"><b>${v ?? '—'}</b><span>${l}</span></div>`;
  h += win('spotify for artists', `<div class="kpis">${k('sp_followers', d.followers, 'followers')}${k('sp_listeners', d.listeners_28d, 'listeners (28d)')}${k('sp_ml', d.monthly_active ?? d.monthly_listeners, 'monthly active')}${k('sp_streams', d.streams_28d, 'streams (28d)')}${k('sp_saves', d.saves_28d, 'saves (28d)')}${k('sp_adds', d.playlist_adds_28d, 'playlist adds (28d)')}</div>
   ${(d.top_songs || []).length ? '<table class="list">' + d.top_songs.map(t => `<tr><td>${esc(t.title)}</td><td class="dim">${t.streams ?? '—'} streams · ${t.listeners ?? '—'} listeners · ${t.saves ?? 0} saves · ${t.canvas_views ?? 0} canvas views</td></tr>`).join('') + '</table>' : ''}
   <p class="dim">${esc(d.note || '')} · snapshot ${esc(new Date(sa.at).toLocaleDateString('en-CA'))} · <a href="https://artists.spotify.com/" target="_blank" rel="noopener" title="Open Spotify for Artists (new tab)">Spotify for Artists</a></p>`); }
 else if (sp) h += win('spotify', `<div class="kpis"><div class="kpi"><b>${sp.data.monthly_listeners || '—'}</b><span>monthly listeners</span></div><div class="kpi"><b>${sp.data.followers || '—'}</b><span>followers</span></div></div>`);
 h += `<p class="dim" style="grid-column:1/-1">last snapshot ${esc(new Date(S[S.length - 1].at).toLocaleString('en-US', {timeZone: 'America/New_York'}))} ET · collected server-side every 6 hours.</p>`;
 return h; }

/* ---------- 'what changed' review: snapshot stored server-side (mark_reviewed RPC), works across devices ---------- */
let PREV = null, CHG = new Set();
const M = {h: 'human visits (all time)', b: 'bot visits (all time)', likes: 'likes', posts: 'feedback posts', yt_subs: 'YouTube subscribers', yt_views: 'YouTube views', tt_followers: 'TikTok followers', tt_hearts: 'TikTok likes', tt_videos: 'TikTok videos', sp_followers: 'Spotify followers', sp_listeners: 'Spotify listeners (28d)', sp_ml: 'Spotify monthly active', sp_streams: 'Spotify streams (28d)', sp_saves: 'Spotify saves (28d)', sp_adds: 'Spotify playlist adds (28d)'};
function snap() { const S = D.social || [], L = src => [...S].reverse().find(x => x.source === src), yt = L('youtube'), tt = L('tiktok'), sa = L('spotify_artists'), d = sa ? sa.data : {};
 return {maxid: Math.max(0, ...(D.visits || []).map(v => v.id)), h: (D.daily || []).reduce((a, x) => a + x.h, 0), b: (D.daily || []).reduce((a, x) => a + x.b, 0), likes: (D.likes || []).length, posts: D.bbs.total,
  yt_subs: yt ? yt.data.subscribers : null, yt_views: yt ? (yt.data.items || []).reduce((a, x) => a + (x.views || 0), 0) : null, tt_followers: tt ? tt.data.followers : null, tt_hearts: tt ? tt.data.hearts : null, tt_videos: tt ? tt.data.videos : null,
  sp_followers: d.followers ?? null, sp_listeners: d.listeners_28d ?? null, sp_ml: d.monthly_active ?? d.monthly_listeners ?? null, sp_streams: d.streams_28d ?? null, sp_saves: d.saves_28d ?? null, sp_adds: d.playlist_adds_28d ?? null}; }
function markChanged() { document.querySelectorAll('[data-m]').forEach(e => { const on = CHG.has(e.dataset.m); e.classList.toggle('chg', on); if (on) e.title = 'changed since your last review'; });
 const b = $('#clearhl'); if (b) b.hidden = !CHG.size && !document.querySelector('tr.chg'); }
function review() { const R0 = D.review, now = snap(); PREV = R0 && R0.snap ? R0.snap : null; CHG = new Set();
 const lines = []; if (PREV) Object.keys(M).forEach(k => { const a = PREV[k], c = now[k]; if (c != null && (a ?? 0) !== c) { CHG.add(k); const d = (c || 0) - (a || 0); lines.push(`<tr><td>${esc(M[k])}</td><td class="n">${a ?? '—'} → <span class="chgc">${c}</span></td><td class="n chgc">${d >= 0 ? '+' : ''}${d}</td></tr>`); } });
 const nv = PREV ? (D.visits || []).filter(v => v.id > PREV.maxid) : [], nh = nv.filter(v => v.human).length;
 render(); if (sessionStorage.grimReviewShown === String(R0 ? R0.at : 'none')) return; sessionStorage.grimReviewShown = String(R0 ? R0.at : 'none');
 if (PREV && !lines.length && !nv.length) return;
 const dlg = $('#chgdlg'); $('#chgbody').innerHTML = PREV ? `<p class="dim">since your last review · ${esc(new Date(R0.at).toLocaleString('en-US', {timeZone: 'America/New_York'}))} ET</p>
  <p><span class="chgc">${nv.length}</span> new visits (${nh} human, ${nv.length - nh} bot) from <span class="chgc">${new Set(nv.map(v => v.fp)).size}</span> visitors</p>${lines.length ? '<table class="list">' + lines.join('') + '</table>' : '<p class="dim">no stat changes.</p>'}`
  : '<p>first review — nothing to compare yet.</p><p class="dim">clear highlights to save the current numbers as your baseline; next time this shows what changed.</p>';
 dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); }
async function clearHl() { const s = snap(); let r; try { r = await rpc('mark_reviewed', {p_pass: localStorage.grimStatsPass, p_snap: s}); } catch (e) {}
 if (!r || !r.ok) { alert('could not save the review — try again.'); return; } D.review = {at: r.at, snap: s}; PREV = s; CHG = new Set(); sessionStorage.grimReviewShown = String(r.at); const dlg = $('#chgdlg'); if (dlg.open) dlg.close(); render(); }
document.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'clearhl' || b.id === 'dlgclear') clearHl(); if (b.id === 'dlglater') $('#chgdlg').close(); if (b.id === 'showchg') { sessionStorage.removeItem('grimReviewShown'); review(); } });

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
