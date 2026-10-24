document.getElementById('y').textContent=new Date().getFullYear();
const as=[...document.querySelectorAll('audio')];
as.forEach(a=>{a.addEventListener('play',()=>{as.forEach(o=>{if(o!==a)o.pause()});a.closest('.track').classList.add('playing')});
a.addEventListener('pause',()=>a.closest('.track').classList.remove('playing'))});
