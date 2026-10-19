/* Mizan service worker: çevrimdışı çalışma + ödeme günü bildirimleri */
const V='mizan-v2';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/^mizan-v/.test(k)&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    if(r.mode==='navigate'){
      // önce ağ (güncelleme gelsin), yoksa önbellek
      e.respondWith(fetch(r.url,{cache:'no-cache',credentials:'same-origin'}).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put('./index.html',c))}return res}).catch(()=>caches.match('./index.html')));
      return;
    }
    if(/\/(ocr|bins)\//.test(u.pathname)){e.respondWith(caches.open('mizan-data').then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}))));return}
    e.respondWith(caches.match(r).then(m=>m||fetch(r)));return;
  }
  if(u.host==='fonts.googleapis.com'||u.host==='fonts.gstatic.com'){
    e.respondWith(caches.open('mizan-fonts').then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{c.put(r,res.clone());return res}))));
  }
});
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
async function readJSON(c,k,def){try{const r=await c.match(k);return r?await r.json():def}catch(e){return def}}
async function check(){
  const c=await caches.open('mizan-nt');
  const cfg=await readJSON(c,'/nt.json',null);if(!cfg||!cfg.on||!cfg.items)return;
  const now=new Date(),today=ds(now),tom=ds(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
  const shown=await readJSON(c,'/nt-shown.json',{});
  // eski kayıtları temizle
  for(const k in shown)if(shown[k]<today)delete shown[k];
  const groups=[['today',today],['tom',tom]];
  for(const [kind,day] of groups){
    if(kind==='tom'&&now.getHours()<12)continue; // yarınki ödemeleri öğleden sonra hatırlat
    const it=cfg.items.filter(x=>x.d===day&&!shown[kind+'|'+x.k]);
    if(!it.length)continue;
    const lines=it.slice(0,3).map(x=>x.n+' · '+x.v);
    if(it.length>3)lines.push(String(cfg.tx.more||'+{n}').replace('{n}',it.length-3));
    await self.registration.showNotification(cfg.tx[kind]||'Mizan',{body:lines.join('\n'),icon:'icon-192.png',badge:'icon-192.png',tag:'mizan-'+kind+'-'+day,data:{url:'./'}});
    it.forEach(x=>{shown[kind+'|'+x.k]=day});
  }
  await c.put('/nt-shown.json',new Response(JSON.stringify(shown),{headers:{'content-type':'application/json'}}));
}
self.addEventListener('periodicsync',e=>{if(e.tag==='mizan-due')e.waitUntil(check())});
self.addEventListener('message',e=>{if(e.data==='check')e.waitUntil(check())});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const w of l)if('focus' in w)return w.focus();return clients.openWindow('./')}));
});
