/* GRIM/OS contact form: shared by the in-page modal and contact.html */
(() => {
const EP = 'https://formsubmit.co/ajax/' + ['tom', 'thomasgrim.com'].join('@');
window.tgContactInit = function (root) {
 const f = root.querySelector('form.cform'), st = root.querySelector('.cstatus'), btn = f.querySelector('button[type=submit]');
 const set = (cls, txt) => { st.className = 'cstatus ' + cls; st.textContent = txt; };
 f.addEventListener('submit', async e => {
  e.preventDefault(); if (f._honey.value) return set('ok', '[ OK ] message queued.');
  const d = Object.fromEntries(new FormData(f)); if (!d.name || !d.email || !d.message) return set('err', '[FAIL] name, email and message are required.');
  btn.disabled = true; set('busy', '> smtp: connecting to mail.thomasgrim.com … transmitting');
  try {
   const r = await fetch(EP, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({name: d.name, email: d.email, _replyto: d.email, _subject: `[thomasgrim.com] ${d.subject}: ${d.name}`, subject: d.subject, message: d.message, _honey: '', _captcha: 'false', _template: 'table'})});
   const j = await r.json().catch(() => ({}));
   if (!r.ok || String(j.success) === 'false') throw new Error(j.message || 'HTTP ' + r.status);
   set('ok', '[ OK ] 250 message accepted. tom will get back to you.'); f.reset(); window.tgTrack && window.tgTrack('contact', d.subject);
  } catch (err) { set('err', '[FAIL] 451 transmission error: ' + err.message + '. try again in a bit.'); }
  btn.disabled = false;
 });
};
})();
