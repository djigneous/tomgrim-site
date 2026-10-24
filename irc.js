/* GRIM/OS mini IRC client: WebSocket + IRC text protocol (irc.unrealircd.org, #tomgrim) */
(() => {
const SERVER = 'wss://irc.unrealircd.org/', CHAN = '#tomgrim', NET = 'irc.unrealircd.org';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const NC = ['var(--hi)', 'var(--acc)', 'var(--fg)', 'var(--br)', '#ff7a3d', '#c58cff', '#ffd23f', '#ff4a8a', '#5fb8ff', '#7dffa0'];
const ncol = n => { let h = 7; for (const c of n.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return NC[h % NC.length]; };
const ts = () => new Date().toTimeString().slice(0, 5);
function linkify(s) { return esc(s).replace(/\bhttps?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`); }
window.tgIRC = function (root, opts = {}) {
 if (root._irc) return root._irc;
 root.classList.add('irc');
 root.innerHTML = `<div class="irc-main"><div class="irc-log" role="log" aria-live="polite"></div><ul class="irc-users" aria-label="users"></ul></div>
  <form class="irc-in"><label class="irc-pr">login:</label><input autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="400" aria-label="IRC input"></form>`;
 const log = root.querySelector('.irc-log'), ul = root.querySelector('.irc-users'), form = root.querySelector('form'), inp = form.querySelector('input'), pr = form.querySelector('.irc-pr');
 let ws = null, nick = '', want = '', users = new Map(), state = 'login', retry = 0, rt = null, quitting = false, echo = false;
 const line = (html, cls = '') => { const d = document.createElement('div'); d.className = 'irc-l ' + cls; d.innerHTML = `<span class="irc-ts">${ts()}</span> ${html}`; const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40; log.appendChild(d); while (log.children.length > 500) log.firstChild.remove(); if (stick) log.scrollTop = log.scrollHeight; };
 const sys = t => line(`<span class="irc-sys">-!- ${linkify(t)}</span>`, 'sys');
 const nk = n => `<span class="irc-nick" style="color:${ncol(n)}">${esc(n)}</span>`;
 const renderUsers = () => { const l = [...users.entries()].sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0])); ul.innerHTML = `<li class="dim">${l.length} users</li>` + l.map(([n, p]) => `<li style="color:${ncol(n)}">${esc(p + n)}</li>`).join(''); };
 const send = s => { if (ws && ws.readyState === 1) ws.send(s); };
 const setPrompt = () => { pr.textContent = state === 'login' ? 'login:' : `[${nick || want}] ${CHAN}>`; inp.placeholder = state === 'login' ? 'pick a nick, press enter' : state === 'connecting' ? 'connecting…' : 'say something · /me /nick /quit'; };
 function connect() {
  clearTimeout(rt); state = 'connecting'; setPrompt(); echo = false; sys(`connecting to ${NET} (wss) as ${want}…`);
  try { ws = new WebSocket(SERVER, ['text.ircv3.net']); } catch (e) { sys('websocket error: ' + e.message); return schedule(); }
  ws.onopen = () => { retry = 0; send('CAP LS 302'); send(`NICK ${want}`); send(`USER ${want.replace(/[^A-Za-z0-9]/g, '').slice(0, 9) || 'grim'} 0 * :GRIM/OS web user`); };
  ws.onmessage = e => String(e.data).split(/\r?\n/).forEach(l => l && handle(l));
  ws.onclose = () => { users.clear(); renderUsers(); if (quitting) { quitting = false; state = 'login'; nick = ''; setPrompt(); sys('disconnected. type a nick to log in again.'); return; } if (state !== 'login') { sys('connection lost.'); schedule(); } };
  ws.onerror = () => {};
 }
 function schedule() { state = 'connecting'; setPrompt(); const d = Math.min(30, 2 ** retry++) ; sys(`reconnecting in ${d}s…`); rt = setTimeout(connect, d * 1000); }
 function parse(l) { const m = {tags: '', prefix: '', cmd: '', params: []}; if (l[0] === '@') { const i = l.indexOf(' '); m.tags = l.slice(1, i); l = l.slice(i + 1); }
  if (l[0] === ':') { const i = l.indexOf(' '); m.prefix = l.slice(1, i); l = l.slice(i + 1); }
  const t = l.indexOf(' :'); let rest = t >= 0 ? l.slice(0, t) : l; const trail = t >= 0 ? l.slice(t + 2) : null; const parts = rest.split(' ').filter(Boolean); m.cmd = parts.shift().toUpperCase(); m.params = parts; if (trail !== null) m.params.push(trail); m.nick = m.prefix.split('!')[0]; return m; }
 function handle(raw) { const m = parse(raw), p = m.params;
  switch (m.cmd) {
   case 'PING': send('PONG :' + (p[0] || '')); break;
   case 'CAP': if (p[1] === 'LS') { if (/\becho-message\b/.test(p[p.length - 1])) send('CAP REQ :echo-message'); else send('CAP END'); } else if (p[1] === 'ACK') { echo = /echo-message/.test(p[p.length - 1]); send('CAP END'); } else if (p[1] === 'NAK') send('CAP END'); break;
   case '001': nick = p[0]; state = 'on'; setPrompt(); sys(`logged in as ${nick}. joining ${CHAN}…`); send('JOIN ' + CHAN); opts.onJoin && opts.onJoin(nick); break;
   case '433': case '432': if (state !== 'on') { want = (want.slice(0, 12) + '_' + (Math.random() * 100 | 0)); sys('nick taken/invalid, trying ' + want); send('NICK ' + want); } else sys(p[p.length - 1] + ': ' + p[1]); break;
   case '353': p[p.length - 1].split(' ').filter(Boolean).forEach(n => { const mm = n.match(/^([~&@%+]*)(.+)$/); users.set(mm[2], mm[1].slice(0, 1)); }); renderUsers(); break;
   case '332': sys('topic: ' + p[p.length - 1]); break;
   case 'JOIN': users.set(m.nick, ''); renderUsers(); m.nick === nick ? sys(`you joined ${CHAN} on ${NET}. say hi.`) : line(`<span class="irc-sys">→ ${nk(m.nick)} joined</span>`, 'sys'); break;
   case 'PART': users.delete(m.nick); renderUsers(); line(`<span class="irc-sys">← ${nk(m.nick)} left${p[1] ? ' (' + esc(p[1]) + ')' : ''}</span>`, 'sys'); break;
   case 'QUIT': if (users.delete(m.nick)) { renderUsers(); line(`<span class="irc-sys">← ${nk(m.nick)} quit${p[0] ? ' (' + esc(p[0]) + ')' : ''}</span>`, 'sys'); } break;
   case 'KICK': users.delete(p[1]); renderUsers(); sys(`${p[1]} was kicked by ${m.nick}`); break;
   case 'NICK': { const nn = p[0]; if (users.has(m.nick)) { users.set(nn, users.get(m.nick)); users.delete(m.nick); renderUsers(); } if (m.nick === nick) { nick = nn; setPrompt(); } line(`<span class="irc-sys">${nk(m.nick)} is now ${nk(nn)}</span>`, 'sys'); break; }
   case 'PRIVMSG': case 'NOTICE': { const txt = p[1] || '', tgt = p[0]; const me = /^\x01ACTION (.*)\x01?$/.exec(txt); if (/^\x01/.test(txt) && !me) break;
    const where = tgt.toLowerCase() === CHAN ? '' : `<span class="dim">[${m.cmd === 'NOTICE' ? 'notice' : 'pm'}]</span> `; if (!m.nick.includes('.') || m.cmd === 'PRIVMSG') {
     if (me) line(`${where}<span class="irc-me">* ${nk(m.nick)} ${linkify(me[1].replace(/\x01$/, ''))}</span>`, m.nick === nick ? 'self' : ''); else line(`${where}&lt;${nk(m.nick)}&gt; ${linkify(txt)}`, m.nick === nick ? 'self' : ''); } break; }
   case 'ERROR': sys('server: ' + (p[0] || '')); break;
   default: if (/^4\d\d$/.test(m.cmd)) sys(p.slice(1).join(' '));
  } }
 function say(text) { send(`PRIVMSG ${CHAN} :${text}`); if (!echo) line(`&lt;${nk(nick)}&gt; ${linkify(text)}`, 'self'); }
 form.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); inp.value = ''; if (!v) return;
  if (state === 'login') { const n = v.replace(/[^A-Za-z0-9_\-\[\]\\^{}|`]/g, '').replace(/^[-0-9]+/, '').slice(0, 20); if (!n) return sys('invalid nick. letters, digits, _ - [ ] only.'); want = n; return connect(); }
  if (state !== 'on') return sys('not connected yet…');
  if (v[0] === '/') { const [c, ...r] = v.slice(1).split(' '), a = r.join(' ');
   switch (c.toLowerCase()) {
    case 'me': if (a) { send(`PRIVMSG ${CHAN} :\x01ACTION ${a}\x01`); if (!echo) line(`<span class="irc-me">* ${nk(nick)} ${linkify(a)}</span>`, 'self'); } break;
    case 'nick': if (a) send('NICK ' + a.split(' ')[0]); else sys('usage: /nick <newnick>'); break;
    case 'quit': quitting = true; clearTimeout(rt); send('QUIT :' + (a || 'logout from GRIM/OS')); setTimeout(() => ws && ws.close(), 400); break;
    case 'msg': { const [t, ...mm] = r; if (t && mm.length) { send(`PRIVMSG ${t} :${mm.join(' ')}`); line(`<span class="dim">[→${esc(t)}]</span> ${linkify(mm.join(' '))}`, 'self'); } break; }
    case 'help': sys('commands: /me <action> · /nick <name> · /msg <nick> <text> · /quit [reason] · /help'); break;
    default: sys('unknown command /' + c + ' (try /help)'); }
   return; }
  say(v); });
 const api = {focus: () => inp.focus({preventScroll: true}), state: () => state, nick: () => nick};
 root._irc = api;
 line(`<span class="irc-sys">GRIM/OS irc 1.0 — ${NET} ${CHAN} — free, public, no account needed.</span>`, 'sys');
 sys('enter a nick to log in. /help for commands.');
 inp.value = opts.nick || ''; setPrompt();
 return api;
};
})();
