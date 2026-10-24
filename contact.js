/* GRIM/OS contact form: plain FormSubmit form, shared by the in-page modal and contact.html */
(() => {
const EP = 'https://formsubmit.co/ajax/' + ['info', 'thomasgrim.com'].join('@');
window.tgContactInit = function (root) {
 const f = root.querySelector('form.cform'), st = root.querySelector('.cstatus'), btn = f.querySelector('button[type=submit]');
 const set = txt => { st.className = 'cstatus'; st.textContent = txt; };
 f.addEventListener('submit', async e => {
  e.preventDefault(); if (f._honey.value) return set('> sent.');
  btn.disabled = true; set('> sending…');
  try {
   const r = await fetch(EP, {method: 'POST', headers: {Accept: 'application/json'}, body: new FormData(f)});
   const j = await r.json().catch(() => ({}));
   if (!r.ok || String(j.success) === 'false') throw 0;
   set('> sent. thanks — tom will get back to you.'); f.reset(); window.tgTrack && window.tgTrack('contact', 'sent');
  } catch (err) { set('> send failed. try again later.'); }
  btn.disabled = false;
 });
};
})();
