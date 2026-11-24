/* Private preview: every file on this site is stored encrypted. Once the visitor has entered the password,
   this worker fetches the encrypted copy of whatever the page asks for and hands back the readable one. */
const SCOPE = new URL(self.registration.scope).pathname;
const TYPES = {html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', txt: 'text/plain; charset=utf-8',
  xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', vtt: 'text/vtt; charset=utf-8', pdf: 'application/pdf', zip: 'application/zip'};
const MAX_AGE = 30 * 24 * 3600 * 1000;
const big = new Map();                                   // readable copies of large files, kept while the worker lives, so a video can be read in pieces
let keyP = null;

function db() { return new Promise((ok, no) => { const r = indexedDB.open('private-preview', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function readKey() {
  try { const d = await db(); const v = await new Promise((ok, no) => { const q = d.transaction('k').objectStore('k').get('key'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); d.close();
    if (!v || !v.key || v.id !== self.LOCK_ID || Date.now() - v.at > MAX_AGE) return null; return v.key; } catch (e) { return null; }
}
async function dropKey() { keyP = null; big.clear(); try { const d = await db(); await new Promise(ok => { const t = d.transaction('k', 'readwrite'); t.objectStore('k').delete('key'); t.oncomplete = ok; t.onerror = ok; }); d.close(); } catch (e) {} }
const getKey = () => keyP || (keyP = readKey().then(k => { if (!k) keyP = null; return k; }));

self.LOCK_ID = '676029549224d452';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => { if (e.data === 'unlocked') { keyP = null; big.clear(); } if (e.data === 'lock') e.waitUntil(dropKey()); });

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || !u.pathname.startsWith(SCOPE)) return;
  const rel = decodeURIComponent(u.pathname.slice(SCOPE.length));
  if (rel === 'sw.js' || rel === 'robots.txt' || rel.endsWith('.enc')) return;
  e.respondWith(serve(e.request, u, rel));
});

async function open(path, key) {
  if (big.has(path)) return big.get(path);
  let r; try { r = await fetch(SCOPE + path.split('/').map(encodeURIComponent).join('/') + '.enc'); } catch (e) { return null; }
  if (!r.ok) return null;
  const raw = await r.arrayBuffer();
  if (raw.byteLength < 28) return null;
  let out; try { out = await crypto.subtle.decrypt({name: 'AES-GCM', iv: raw.slice(0, 12)}, key, raw.slice(12)); } catch (e) { return 'wrong-key'; }
  if (/\.(mp4|webm|mp3|pdf)$/i.test(path)) { big.set(path, out); if (big.size > 4) big.delete(big.keys().next().value); }
  return out;
}

async function serve(req, u, rel) {
  if (u.search === '?lock') { await dropKey(); return fetch(req); }      // add ?lock to any address to lock this browser again
  const key = await getKey();
  if (!key) return fetch(req);                             // not unlocked: the server answers with the password page
  let path = rel === '' || rel.endsWith('/') ? rel + 'index.html' : rel, status = 200;
  let buf = await open(path, key);
  if (buf === null && !/\.[a-z0-9]{2,5}$/i.test(path)) {    // "/start" for "/start/", "/faq" for "/faq.html"
    if (await open(path + '/index.html', key)) return Response.redirect(u.pathname + '/' + u.search, 302);
    const h = await open(path + '.html', key); if (h && h !== 'wrong-key') { buf = h; path += '.html'; }
  }
  if (buf === 'wrong-key') { await dropKey(); return fetch(req); }      // the password was changed since this visitor last unlocked
  if (buf === null) { buf = await open('404.html', key); status = 404; path = '404.html'; if (!buf || buf === 'wrong-key') return new Response('Not found', {status: 404}); }
  const type = TYPES[(path.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const head = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'};
  const range = req.headers.get('range'), m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && status === 200) {
    const size = buf.byteLength; let a, b;
    if (m[1] === '') { const n = Math.min(parseInt(m[2] || '0', 10), size); a = size - n; b = size - 1; } else { a = parseInt(m[1], 10); b = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1); }
    if (!(a <= b) || a >= size) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
    return new Response(buf.slice(a, b + 1), {status: 206, headers: Object.assign(head, {'Content-Range': 'bytes ' + a + '-' + b + '/' + size, 'Content-Length': String(b - a + 1)})});
  }
  return new Response(buf, {status, headers: Object.assign(head, {'Content-Length': String(buf.byteLength)})});
}
