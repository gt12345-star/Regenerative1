/* The preview is open: nothing here is locked. This file takes the place of the worker that used to unlock the pages in a
   visitor's browser. A browser that still has the old worker picks this one up, which hands every request straight to the
   site, reloads any page that is open, and removes itself. It has no other job. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { await self.clients.claim(); } catch (err) {}
    var open = [];
    try { open = await self.clients.matchAll({type: 'window'}); } catch (err) {}
    await Promise.all(open.map(function (c) { return c.navigate(c.url).catch(function () {}); }));
    try { await self.registration.unregister(); } catch (err) {}
  })());
});
