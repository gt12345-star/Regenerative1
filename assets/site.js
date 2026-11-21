/* Regenerative Stem Cells Partnership: site behaviour. No libraries. Settings live in assets/config.js. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var CFG = w.RSP_CONFIG || {};
  var RSP = w.RSP = w.RSP || {};
  var reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var fine = !!(w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var onScroll = [];            // per-page scroll work, cleared on each page init
  var pageObservers = [];       // observers to disconnect on each page init
  RSP.query = RSP.query || function () { return w.location.search; };
  RSP.state = null;             // state code the visitor picked, carried into the form
  /* the picked state is kept for this browser tab only, so the next page can open on it */
  var remember = function (code) { try { w.sessionStorage.setItem('rsp-state', code); } catch (e) { /* storage can be blocked; the pick still works on this page */ } };
  var recall = function () { try { var c = w.sessionStorage.getItem('rsp-state'); return /^[A-Z]{2}$/.test(c || '') ? c : null; } catch (e) { return null; } };
  RSP.where = RSP.where || function () { return w.location.pathname; };

  /* ---------------------------------------------------------------- events
     One call for anything worth counting. It reaches whichever measurement service the site owner switched on in
     assets/config.js, and nothing at all when none is. No visitor's name, email or phone is ever passed. */
  function track(name, props) {
    props = props || {};
    if (RSP.geo && !props.visitor_state) props.visitor_state = RSP.geo;
    try { if (w.plausible) w.plausible(name, { props: props }); } catch (e) { /* a measurement service must never break the page */ }
    try { if (w.fathom && w.fathom.trackEvent) w.fathom.trackEvent(name); } catch (e) { /* as above */ }
    try { if (w.umami && w.umami.track) w.umami.track(name, props); } catch (e) { /* as above */ }
    try { if (w.posthog && w.posthog.capture) w.posthog.capture(name, props); } catch (e) { /* as above */ }
    try { if (w.gtag) w.gtag('event', name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), props); else if (w.dataLayer && w.dataLayer.push) { var o = { event: name }; for (var k in props) o[k] = props[k]; w.dataLayer.push(o); } } catch (e) { /* as above */ }
    try { d.dispatchEvent(new CustomEvent('rsp:track', { detail: { name: name, props: props } })); } catch (e) { /* older browsers */ }
  }
  RSP.track = track;

  /* ---------------------------------------------------------------- the visitor's state
     Used to open the map, the menu board and the form on the visitor's own state. Order of trust:
     a state in the address or one the visitor picked, then a lookup (set in config.js), then the device's time zone
     where that names one state. The answer is kept for this browser tab only. */
  RSP.geo = null;
  var NAMES = null;
  var stateFromName = function (nm) {
    if (!nm || !w.RSP_STATES) return null;
    if (!NAMES) { NAMES = {}; w.RSP_STATES.forEach(function (x) { NAMES[x.n.toLowerCase()] = x.c; }); NAMES['washington, d.c.'] = NAMES['washington dc'] = 'DC'; }
    return NAMES[String(nm).toLowerCase()] || null;
  };
  var knownCode = function (c) {
    c = String(c || '').toUpperCase().replace(/^US-/, '');
    if (!/^[A-Z]{2}$/.test(c)) return null;
    if (!w.RSP_STATES) return c;
    for (var i = 0; i < w.RSP_STATES.length; i++) if (w.RSP_STATES[i].c === c) return c;
    return null;
  };
  /* reads the common answer shapes of location lookups: the bundled host functions, and the usual public services */
  function regionOf(j) {
    if (!j || typeof j !== 'object') return null;
    var cc = j.country_code || j.countryCode || j.country_code2 || (j.country && j.country.code) || (typeof j.country === 'string' ? j.country : '');
    if (cc && !/^(US|USA|United States( of America)?)$/i.test(cc)) return null;
    var sub = j.subdivision || {}, cands = [j.region_code, j.regionCode, j.state_code, j.stateCode, sub.code, j.principalSubdivisionCode, j.region, j.state];
    for (var i = 0; i < cands.length; i++) { var c = knownCode(cands[i]); if (c) return c; }
    var names = [j.region, j.regionName, j.region_name, j.state, j.state_prov, j.stateProv, j.principalSubdivision, sub.name];
    for (var k = 0; k < names.length; k++) { var n = stateFromName(names[k]); if (n) return n; }
    return null;
  }
  var ZONES = { 'America/Phoenix': 'AZ', 'America/Detroit': 'MI', 'America/Menominee': 'MI', 'America/Boise': 'ID', 'Pacific/Honolulu': 'HI',
    'America/Anchorage': 'AK', 'America/Juneau': 'AK', 'America/Sitka': 'AK', 'America/Yakutat': 'AK', 'America/Nome': 'AK', 'America/Metlakatla': 'AK' };
  function zoneState() {
    var z = '';
    try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { z = ''; }
    if (ZONES[z]) return ZONES[z];
    if (z.indexOf('America/Indiana/') === 0) return 'IN';
    if (z.indexOf('America/Kentucky/') === 0) return 'KY';
    if (z.indexOf('America/North_Dakota/') === 0) return 'ND';
    return null;
  }
  function useGeo(code, how) {
    code = knownCode(code); if (!code) return;
    RSP.geo = code; RSP.geoHow = how;
    try { w.sessionStorage.setItem('rsp-geo', code + ':' + how); } catch (e) { /* storage blocked: the page still opens on the state */ }
    if (RSP.applyGeo) RSP.applyGeo();
  }
  RSP.useGeo = useGeo;          /* a host that already knows the visitor's state can call RSP.useGeo('NV', 'host') */
  function locate() {
    var kept = '';
    try { kept = w.sessionStorage.getItem('rsp-geo') || ''; } catch (e) { kept = ''; }
    var m = /^([A-Z]{2}):(\w+)$/.exec(kept);
    if (m && knownCode(m[1])) { RSP.geo = m[1]; RSP.geoHow = m[2]; return; }
    var z = zoneState(); if (z) { RSP.geo = z; RSP.geoHow = 'zone'; }      /* a first answer with no request; a lookup, if set, replaces it */
    var ep = CFG.locationLookup;
    if (!ep || !w.fetch) return;
    try {
      w.fetch(ep, { headers: { Accept: 'application/json' }, credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { var c = regionOf(j); if (c) useGeo(c, 'lookup'); })
        .catch(function () { /* no answer: the map opens on its usual state */ });
    } catch (e) { /* as above */ }
  }

  /* ---------------------------------------------------------------- the visit
     How this visitor arrived and what they looked at. It stays in the browser. It leaves only with the partner brief
     form, when the visitor sends it, so whoever follows up knows where the inquiry came from. */
  var visit = null;
  function store(kind, key, val) {
    try { var st = w[kind]; if (val === undefined) return st.getItem(key); st.setItem(key, val); } catch (e) { /* blocked */ }
    return null;
  }
  function logVisit() {
    var path = RSP.where() || '/', q;
    try { q = new URLSearchParams(RSP.query()); } catch (e) { q = null; }
    if (!visit) { try { visit = JSON.parse(store('sessionStorage', 'rsp-visit') || 'null'); } catch (e) { visit = null; } }
    if (!visit) {
      var ref = '';
      try { var u = d.referrer ? new URL(d.referrer) : null; if (u && u.host !== w.location.host) ref = (u.host + u.pathname).slice(0, 160); } catch (e) { ref = ''; }
      visit = { t0: Date.now(), landing: path, ref: ref, utm: {}, pages: [] };
      if (q) ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) { var v = q.get('utm_' + k); if (v) visit.utm[k] = v.slice(0, 80); });
      visit.first = null;
    }
    if (visit.pages[visit.pages.length - 1] !== path && visit.pages.length < 40) visit.pages.push(path);
    noteFirst();
    store('sessionStorage', 'rsp-visit', JSON.stringify(visit));
  }
  /* the one item that outlives the tab: the date and source of a first visit. Kept only where the visitor allows analytics. */
  function noteFirst() {
    if (!visit || visit.first || !allowed('a')) return;
    var first = null;
    try { first = JSON.parse(store('localStorage', 'rsp-first') || 'null'); } catch (e) { first = null; }
    if (!first) first = { t: new Date().toISOString().slice(0, 10), landing: visit.landing, ref: visit.ref, utm: visit.utm, n: 0 };
    first.n = (first.n || 0) + 1;
    store('localStorage', 'rsp-first', JSON.stringify(first));
    visit.first = first;
  }
  /* the fields added to the partner brief form as it is sent */
  function leadContext() {
    var v = visit || { pages: [], utm: {}, first: {} }, fst = v.first || {}, wd = w.innerWidth || 0, tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    return {
      lead_state_estimated: RSP.geo || '',
      lead_landing_page: v.landing || '',
      lead_referrer: v.ref || '',
      lead_utm_source: (v.utm || {}).source || '', lead_utm_medium: (v.utm || {}).medium || '', lead_utm_campaign: (v.utm || {}).campaign || '',
      lead_utm_term: (v.utm || {}).term || '', lead_utm_content: (v.utm || {}).content || '',
      lead_pages_viewed: (v.pages || []).join(' > '),
      lead_minutes_on_site: v.t0 ? String(Math.max(1, Math.round((Date.now() - v.t0) / 60000))) : '',
      lead_visit_number: fst.n ? String(fst.n) : '',
      lead_first_visit: fst.t || '', lead_first_landing_page: fst.landing || '', lead_first_referrer: fst.ref || '',
      lead_device: wd < 700 ? 'phone' : wd < 1100 ? 'tablet' : 'computer',
      lead_time_zone: tz
    };
  }
  RSP.leadContext = leadContext;

  /* ---------------------------------------------------------------- privacy and cookie settings
     Three groups. Essential is always on. Analytics and advertising load nothing until the visitor allows them.
     A browser's Global Privacy Control signal keeps advertising off. The choice is kept on the visitor's device for a year. */
  var CS_KEY = 'rsp-consent', CS_DAYS = 365, consent = null, gtagOn = false, gpc = false;
  try { gpc = !!w.navigator.globalPrivacyControl; } catch (e) { gpc = false; }
  function csMode() {
    var m = CFG.consent || 'always', T = CFG.tags || {}, A = CFG.analytics || {};
    if (m === 'off') return 'off';
    if (m === 'auto') return (A.src || T.googleTagId || T.metaPixelId) ? 'on' : 'off';
    return 'on';
  }
  function csRead() {
    try { var c = JSON.parse(store('localStorage', CS_KEY) || 'null'); if (c && typeof c.t === 'number' && Date.now() - c.t < CS_DAYS * 864e5) return c; } catch (e) { /* unreadable: ask again */ }
    return null;
  }
  function allowed(cat) {                      /* 'a' analytics, 'm' advertising */
    if (cat === 'm' && gpc) return false;
    if (csMode() === 'off') return true;
    return !!(consent && consent[cat]);
  }
  function addScript(src, attrs, mark) {
    var sc = d.createElement('script'); sc.src = src; sc.async = true; sc.setAttribute(mark, '');
    for (var k in (attrs || {})) sc.setAttribute(k, attrs[k]);
    d.head.appendChild(sc);
  }
  function applyConsent() {
    var T = CFG.tags || {}, A = CFG.analytics || {}, a = allowed('a'), m = allowed('m');
    if (a && A.src && !d.querySelector('script[data-rsp-measure]')) addScript(A.src, A.attributes, 'data-rsp-measure');
    if (T.googleTagId) {
      var st = { analytics_storage: a ? 'granted' : 'denied', ad_storage: m ? 'granted' : 'denied', ad_user_data: m ? 'granted' : 'denied', ad_personalization: m ? 'granted' : 'denied' };
      if (!gtagOn && (a || m)) {
        w.dataLayer = w.dataLayer || []; w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
        w.gtag('consent', 'default', st); w.gtag('js', new Date()); w.gtag('config', T.googleTagId);
        addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(T.googleTagId), null, 'data-rsp-gtag'); gtagOn = true;
      } else if (gtagOn) w.gtag('consent', 'update', st);
    }
    if (T.metaPixelId) {
      if (m && !w.fbq) {
        var q = w.fbq = function () { if (q.callMethod) q.callMethod.apply(q, arguments); else q.queue.push(arguments); };
        if (!w._fbq) w._fbq = q;
        q.push = q; q.loaded = true; q.version = '2.0'; q.queue = [];
        addScript('https://connect.facebook.net/en_US/fbevents.js', null, 'data-rsp-meta');
        w.fbq('init', String(T.metaPixelId)); w.fbq('track', 'PageView');
      } else if (w.fbq) { try { w.fbq('consent', m ? 'grant' : 'revoke'); } catch (e) { /* the pixel is not ours to break */ } }
    }
  }
  function csSave(a, m) {
    consent = { a: a ? 1 : 0, m: m && !gpc ? 1 : 0, t: Date.now() };
    store('localStorage', CS_KEY, JSON.stringify(consent));
    if (!consent.a) { try { w.localStorage.removeItem('rsp-first'); } catch (e) { /* storage blocked */ } if (visit) visit.first = null; }
    else noteFirst();
    if (visit) store('sessionStorage', 'rsp-visit', JSON.stringify(visit));
    csClose(); applyConsent();
  }
  function csClose() {
    var el = d.getElementById('rsp-cs'); if (el) el.hidden = true;
    root.classList.remove('cs-open');
  }
  function csOpen(view, byUser) {
    var el = d.getElementById('rsp-cs');
    if (!el) {
      var pl = d.querySelector('.foot-links a'), base = pl ? (pl.getAttribute('href') || '').replace(/privacy\.html.*$/, '') : '';
      var note = '<p class="cs-gpc"' + (gpc ? '' : ' hidden') + '><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg><span>Opt-out request honored. Your browser sent a privacy signal, so advertising cookies stay off.</span></p>';
      el = d.createElement('div'); el.id = 'rsp-cs'; el.className = 'cs'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'cs-h');
      el.innerHTML = '<div class="cs-main"><h2 id="cs-h" tabindex="-1">Privacy and cookie settings</h2>'
        + '<p>We use essential storage to run this site. With your permission, we also use analytics and advertising cookies. We do not collect patient health information.</p>' + note
        + '<div class="cs-acts"><button type="button" data-cs="none">Reject non-essential</button><button type="button" class="go" data-cs="all">Accept all</button><button type="button" class="quiet wide" data-cs="prefs">Manage preferences</button></div></div>'
        + '<div class="cs-prefs"><h2 tabindex="-1">Manage preferences</h2><div class="cs-rows">'
        + '<div class="cs-row"><b>Essential</b><span>Runs the site and the form, and remembers your choices.</span><small>Always on</small></div>'
        + '<div class="cs-row"><b>Analytics</b><span>Counts visits and shows which pages are useful.</span><label><input type="checkbox" id="cs-a" aria-label="Analytics"><i></i></label></div>'
        + '<div class="cs-row"><b>Advertising</b><span>Measures our ads and may be used to show you our ads on other sites.</span><label><input type="checkbox" id="cs-m" aria-label="Advertising"><i></i></label></div></div>' + note
        + '<div class="cs-acts"><button type="button" class="go wide" data-cs="save">Save choices</button><button type="button" data-cs="none">Reject non-essential</button><button type="button" data-cs="all">Accept all</button></div></div>'
        + '<p class="cs-links"><a href="' + base + 'privacy.html">Privacy policy</a><a href="' + base + 'terms.html">Terms</a><a href="' + base + 'cookies.html">Cookie policy</a></p>';
      el.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-cs]') : null;
        if (b) {
          var k = b.getAttribute('data-cs');
          if (k === 'all') csSave(1, 1);
          else if (k === 'none') csSave(0, 0);
          else if (k === 'save') csSave(d.getElementById('cs-a').checked, d.getElementById('cs-m').checked);
          else if (k === 'prefs') csOpen('prefs', true);
        } else if (e.target && e.target.closest && e.target.closest('.cs-links a')) csClose();      /* reading a policy: step aside, ask again on the next page */
      });
      el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && consent) csClose(); });
      d.body.appendChild(el);
    }
    var ca = d.getElementById('cs-a'), cm = d.getElementById('cs-m');
    ca.checked = !!(consent && consent.a); cm.checked = !!(consent && consent.m) && !gpc; cm.disabled = gpc;
    el.setAttribute('data-view', view === 'prefs' ? 'prefs' : 'main'); el.hidden = false;
    root.classList.add('cs-open');
    if (byUser) { var h = el.querySelector(view === 'prefs' ? '.cs-prefs h2' : '.cs-main h2'); if (h) h.focus(); }
  }
  function csStart() {
    d.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-consent-open]') : null;
      if (b) { e.preventDefault(); csOpen('prefs', true); }
    });
    if (csMode() === 'on' && !consent) csOpen('main', false);
  }
  RSP.consent = { open: function (view) { csOpen(view || 'prefs', true); }, get: function () { return consent; }, allowed: allowed };

  /* a sent form, counted once by whichever tags the visitor allowed */
  function leadEvent() {
    var T = CFG.tags || {};
    try { if (w.gtag && T.googleAdsLeadLabel && allowed('m')) w.gtag('event', 'conversion', { send_to: T.googleAdsLeadLabel }); } catch (e) { /* a tag must never break the page */ }
    try { if (w.fbq && allowed('m')) w.fbq('track', 'Lead'); } catch (e) { /* as above */ }
  }
  RSP.go = RSP.go || function (href) { w.location.href = href; };

  function io(cb, opts) {
    var o = new IntersectionObserver(cb, opts || {});
    pageObservers.push(o);
    return o;
  }

  /* ---------------------------------------------------------------- header, menu, progress */
  function chrome() {
    var top = $('#top'), bar = $('#bar'), burger = $('.burger'), menu = $('#menu');
    var last = w.scrollY, ticking = false;
    function tick() {
      var y = w.scrollY, max = root.scrollHeight - w.innerHeight;
      if (top) {
        top.classList.toggle('stuck', y > 24);
        if (!menu || !menu.classList.contains('open')) top.classList.toggle('hide', y > 640 && y > last + 4);
        if (y < last - 4) top.classList.remove('hide');
      }
      if (bar) bar.style.setProperty('--p', max > 0 ? clamp(y / max, 0, 1) : 0);
      for (var i = 0; i < onScroll.length; i++) onScroll[i](y);
      last = y; ticking = false;
    }
    w.addEventListener('scroll', function () { if (!ticking) { ticking = true; w.requestAnimationFrame(tick); } }, { passive: true });
    w.addEventListener('resize', function () { if (!ticking) { ticking = true; w.requestAnimationFrame(tick); } });
    RSP.tick = tick;

    $$('.drop').forEach(function (dr) {
      var b = $('button', dr), timer = 0;
      var set = function (o) { dr.classList.toggle('open', o); b.setAttribute('aria-expanded', o ? 'true' : 'false'); };
      b.addEventListener('click', function () { set(!dr.classList.contains('open')); });
      if (fine) {
        dr.addEventListener('pointerenter', function () { clearTimeout(timer); set(true); });
        dr.addEventListener('pointerleave', function () { timer = setTimeout(function () { set(false); }, 160); });
      }
      d.addEventListener('click', function (e) { if (!dr.contains(e.target)) set(false); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
      dr.addEventListener('focusout', function (e) { if (!dr.contains(e.relatedTarget)) set(false); });
    });

    /* one highlight glides between the header links instead of each link lighting on its own */
    var nav = $('.nav');
    if (nav && fine && !reduce) {
      var ink = d.createElement('i'); ink.className = 'nav-ink'; ink.setAttribute('aria-hidden', 'true');
      nav.insertBefore(ink, nav.firstChild); nav.classList.add('has-ink');
      var glide = function (el) {
        var a = el.getBoundingClientRect(), b = nav.getBoundingClientRect(), fresh = !ink.classList.contains('on');
        if (fresh) ink.style.transition = 'opacity .25s ease';
        ink.style.setProperty('--x', (a.left - b.left).toFixed(1) + 'px'); ink.style.setProperty('--w', a.width.toFixed(1) + 'px');
        if (fresh) { void ink.offsetWidth; ink.style.transition = ''; }
        ink.classList.add('on');
      };
      $$('.nav>a, .nav>.drop>button', nav).forEach(function (el) {
        el.addEventListener('pointerenter', function () { glide(el); });
        el.addEventListener('focus', function () { glide(el); });
      });
      nav.addEventListener('pointerleave', function () { if (!nav.contains(d.activeElement)) ink.classList.remove('on'); });
      nav.addEventListener('focusout', function (e) { if (!nav.contains(e.relatedTarget)) ink.classList.remove('on'); });
    }

    /* the header button carries a chosen state to the form page */
    $$('.top [data-brief], .menu .btn').forEach(function (a) {
      a.addEventListener('click', function () {
        var href = (a.getAttribute('href') || '').split('?')[0];
        if (/partner-brief\.html$/.test(href)) a.setAttribute('href', href + (RSP.state ? '?state=' + RSP.state : ''));
      });
    });

    if (burger && menu) {
      var setMenu = function (o) {
        menu.classList.toggle('open', o);
        menu.setAttribute('aria-hidden', o ? 'false' : 'true');
        if (o) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
        burger.setAttribute('aria-expanded', o ? 'true' : 'false');
        d.body.classList.toggle('lock', o);
        if (o && top) top.classList.remove('hide');
      };
      RSP.closeMenu = function () { setMenu(false); };
      setMenu(false);
      burger.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    }
  }

  /* ---------------------------------------------------------------- reveal, split headlines, counters */
  function splitHead(el) {
    if (el.classList.contains('sp')) return;
    var i = 0, g = 0;
    var label = el.textContent.replace(/\s+/g, ' ').trim();
    var mk = function () {
      var o = d.createElement('span'), inner = d.createElement('span');
      o.className = 'w'; inner.style.setProperty('--wi', i++); o.appendChild(inner);
      return [o, inner];
    };
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = d.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(d.createTextNode(' ')); return; }
          var pr = mk(); pr[1].textContent = p; frag.appendChild(pr[0]);
        });
        el.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') {
        n.setAttribute('data-g', ++g);
        if (n.childNodes.length === 1 && n.firstChild.nodeType === 3 && /\s/.test(n.textContent.trim())) {
          /* a phrase such as <em>seen everything.</em>: split it so it can wrap, one stained word at a time */
          var fr = d.createDocumentFragment();
          n.textContent.trim().split(/\s+/).forEach(function (wd, j) {
            if (j) fr.appendChild(d.createTextNode(' '));
            var c = n.cloneNode(false); c.textContent = wd;
            var q = mk(); q[1].appendChild(c); fr.appendChild(q[0]);
          });
          el.replaceChild(fr, n);
        } else {
          var pr = mk(); el.replaceChild(pr[0], n); pr[1].appendChild(n);
        }
      }
    });
    el.setAttribute('aria-label', label);
    el.classList.add('sp');
  }

  function count(el) {
    var to = parseFloat(el.getAttribute('data-count')), from = parseFloat(el.getAttribute('data-from') || '0') || 0, pre = el.getAttribute('data-pre') || '', suf = el.getAttribute('data-suf') || '';
    var fmt = function (v) { return pre + Math.round(v).toLocaleString('en-US') + suf; };
    if (reduce || !isFinite(to)) { el.textContent = fmt(to); return; }
    var t0 = 0, dur = 1500 + Math.min(900, Math.abs(to - from) * 8);
    el.textContent = fmt(from);
    var step = function (now) {
      if (!t0) t0 = now;
      var p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) w.requestAnimationFrame(step);
    };
    w.requestAnimationFrame(step);
  }

  function reveals(scope) {
    $$('[data-stagger]', scope).forEach(function (p) {
      Array.prototype.slice.call(p.children).forEach(function (c, i) { c.style.setProperty('--i', i); });
    });
    $$('.split', scope).forEach(splitHead);
    var items = $$('[data-r],[data-in],.split,[data-count]', scope);
    var settle = function (el) { el.classList.add('fin'); };
    if (!('IntersectionObserver' in w) || reduce) {
      items.forEach(function (el) {
        el.classList.add('in');
        if (el.hasAttribute('data-count')) count(el);
        if (el.classList.contains('split')) settle(el, false);
      });
      return;
    }
    var pending = items.slice();
    var show = function (el) {
      el.classList.add('in');
      if (el.hasAttribute('data-count')) count(el);
      if (el.hasAttribute('data-r')) w.setTimeout(function () { el.classList.add('done'); }, 1900);
      var wait = RSP.introDelay && el.closest && el.closest('.hero') ? RSP.introDelay : 0;
      if (el.classList.contains('split')) w.setTimeout(function () { if (el.isConnected) settle(el, true); }, 1000 + 65 * $$('.w', el).length + wait);
      var k = pending.indexOf(el); if (k >= 0) pending.splice(k, 1);
    };
    var seen = io(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target);
        seen.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -9% 0px', threshold: 0.08 });
    items.forEach(function (el) { seen.observe(el); });
    /* anything the visitor has already scrolled past (a fast scroll, a jump link) is shown, never left hidden */
    var lastSweep = 0;
    onScroll.push(function () {
      var now = Date.now();
      if (!pending.length || now - lastSweep < 160) return;
      lastSweep = now;
      pending.slice().forEach(function (el) {
        if (el.getBoundingClientRect().bottom < 0) { show(el); seen.unobserve(el); }
      });
    });
  }

  /* ---------------------------------------------------------------- the thesis: words fill in as the page scrolls */
  function scrubs(scope) {
    $$('[data-scrub]', scope).forEach(function (p) {
      if (p.classList.contains('sp')) return;
      var words = [];
      var wrap = function (text, proto) {
        var fr = d.createDocumentFragment();
        text.split(/(\s+)/).forEach(function (t) {
          if (!t) return;
          if (/^\s+$/.test(t)) { fr.appendChild(d.createTextNode(' ')); return; }
          var sp = proto ? proto.cloneNode(false) : d.createElement('span');
          sp.textContent = t; sp.classList.add('sw'); words.push(sp); fr.appendChild(sp);
        });
        return fr;
      };
      Array.prototype.slice.call(p.childNodes).forEach(function (n) {
        if (n.nodeType === 3) p.replaceChild(wrap(n.textContent, null), n);
        else if (n.nodeType === 1) p.replaceChild(wrap(n.textContent, n), n);
      });
      p.classList.add('sp');
      if (reduce) { words.forEach(function (x) { x.classList.add('on'); }); return; }
      var lit = 0;
      var upd = function () {
        var r = p.getBoundingClientRect(), vh = w.innerHeight;
        var f = clamp((vh * .88 - r.top) / (r.height + vh * .36), 0, 1);
        var n = Math.min(words.length, Math.round(f * words.length * 1.06));
        if (n === lit) return;
        for (var i = Math.min(n, lit); i < Math.max(n, lit); i++) words[i].classList.toggle('on', i < n);
        lit = n;
      };
      onScroll.push(upd); upd();
    });
  }

  /* ---------------------------------------------------------------- the law chart: a crosshair and one readout */
  function charts(scope) {
    $$('[data-chart]', scope).forEach(function (plot) {
      var steps = $$('.lc-steps li', plot), tip = $('.lc-tip', plot);
      if (!steps.length || !tip) return;
      var data = steps.map(function (li) {
        return { x: parseFloat(li.style.getPropertyValue('--x')), y: li.getAttribute('data-y'), n: +li.getAttribute('data-n'), s: li.getAttribute('data-s') };
      });
      var tb = $('b', tip), ts = $('span', tip), cur = -1;
      var show = function (i) {
        if (i < 0) { plot.classList.remove('hot'); return; }
        if (i !== cur) {
          cur = i; var dd = data[i];
          tb.textContent = dd.n + (dd.n === 1 ? ' state' : ' states');
          ts.textContent = dd.y + ': ' + dd.s;
          plot.style.setProperty('--cx', dd.x + '%');
          tip.classList.toggle('flip', dd.x > 78);
        }
        plot.classList.add('hot');
      };
      plot.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = plot.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 100, best = 0;
        for (var i = 0; i < data.length; i++) if (data[i].x <= px + 1.5) best = i;      /* the step in force at the pointer's year */
        show(best);
      });
      plot.addEventListener('pointerleave', function () { show(-1); });
      steps.forEach(function (li, i) {
        li.addEventListener('focusin', function () { show(i); });
        li.addEventListener('focusout', function () { show(-1); });
      });
    });
  }

  /* ---------------------------------------------------------------- marquee */
  function marquees(scope) {
    $$('.marq-t', scope).forEach(function (t) {
      if (t.children.length !== 1) return;
      var a = t.children[0], b = a.cloneNode(true);
      b.setAttribute('aria-hidden', 'true');
      t.appendChild(b);
      var speed = parseFloat(t.getAttribute('data-speed') || '60');
      var set = function () { var wd = a.getBoundingClientRect().width; if (wd) t.style.setProperty('--dur', (wd / speed).toFixed(1) + 's'); };
      set(); w.setTimeout(set, 1200);
    });
  }

  /* ---------------------------------------------------------------- pointer light and tilt */
  function pointerFx(scope) {
    if (!fine || reduce) return;
    $$('.hero, .band.dark', scope).forEach(function (sec) {
      if ($('.curglow', sec)) return;
      var g = d.createElement('i'); g.className = 'curglow'; g.setAttribute('aria-hidden', 'true');
      var au = sec.classList.contains('story-band') && $('.aurora', sec);      /* this band cannot clip (its scene is pinned), so the light goes inside the layer that does */
      if (au) au.appendChild(g); else sec.insertBefore(g, sec.firstChild);
      sec.addEventListener('pointermove', function (e) {
        var r = sec.getBoundingClientRect();
        g.style.setProperty('--cx', (e.clientX - r.left) + 'px');
        g.style.setProperty('--cy', (e.clientY - r.top) + 'px');
      });
    });
    $$('.btn.primary', scope).forEach(function (b) {
      if (b.classList.contains('wide')) return;
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty('--bx', ((e.clientX - r.left - r.width / 2) * .16).toFixed(1) + 'px');
        b.style.setProperty('--by', ((e.clientY - r.top - r.height / 2) * .3).toFixed(1) + 'px');
      });
      b.addEventListener('pointerleave', function () { b.style.setProperty('--bx', '0px'); b.style.setProperty('--by', '0px'); });
    });
    $$('.spot', scope).forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
    $$('.tilt', scope).forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-tilt') || '5');
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.setProperty('--ty', (x * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--tx', (-y * max * 2).toFixed(2) + 'deg');
      });
      el.addEventListener('pointerleave', function () { el.style.setProperty('--tx', '0deg'); el.style.setProperty('--ty', '0deg'); });
    });
  }

  /* ---------------------------------------------------------------- the darkfield: fluorescent cells (canvas)
     Cells are drawn once as sprites, then composited with additive light, the way a fluorescence image is built from channels.
     Pink cytoplasm with a blue nucleus is the commonest cell; the other two inks appear less often. */
  var TAU = Math.PI * 2, SPRITES = null;
  var INK = { e: [255, 78, 136], v: [52, 157, 152], a: [80, 182, 248] };
  function cellSprite(rgb, nuc, soft) {
    var S = 320, c = d.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), R = S / 2, r = R * .56, g, i;
    var col = function (k, al) { return 'rgba(' + k[0] + ',' + k[1] + ',' + k[2] + ',' + al + ')'; };
    g = x.createRadialGradient(R, R, r * .4, R, R, R);
    g.addColorStop(0, col(rgb, soft ? .15 : .12)); g.addColorStop(.5, col(rgb, soft ? .07 : .05)); g.addColorStop(1, col(rgb, 0));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (soft) {                                    /* out of the focal plane: a soft disc and a soft nucleus */
      g = x.createRadialGradient(R, R, 0, R, R, r * 1.12);
      g.addColorStop(0, col(rgb, .18)); g.addColorStop(.72, col(rgb, .13)); g.addColorStop(1, col(rgb, 0));
      x.fillStyle = g; x.beginPath(); x.arc(R, R, r * 1.12, 0, TAU); x.fill();
      g = x.createRadialGradient(R + r * .1, R + r * .05, 0, R + r * .1, R + r * .05, r * .52);
      g.addColorStop(0, col(nuc, .36)); g.addColorStop(1, col(nuc, 0));
      x.fillStyle = g; x.beginPath(); x.arc(R + r * .1, R + r * .05, r * .52, 0, TAU); x.fill();
      return c;
    }
    g = x.createRadialGradient(R, R, r * .1, R, R, r);            /* cytoplasm: brighter toward the membrane */
    g.addColorStop(0, col(rgb, .09)); g.addColorStop(.7, col(rgb, .12)); g.addColorStop(.94, col(rgb, .32)); g.addColorStop(1, col(rgb, 0));
    x.fillStyle = g; x.beginPath(); x.arc(R, R, r, 0, TAU); x.fill();
    x.beginPath(); x.arc(R, R, r * .955, 0, TAU);                 /* membrane */
    x.lineWidth = 8; x.strokeStyle = col(rgb, .14); x.stroke();
    x.lineWidth = 1.8; x.strokeStyle = col(rgb, .9); x.stroke();
    for (i = 0; i < 34; i++) {                                    /* grains in the cytoplasm */
      var an = Math.random() * TAU, q = Math.sqrt(Math.random()) * r * .84;
      x.fillStyle = col(rgb, .2 + Math.random() * .45);
      x.beginPath(); x.arc(R + Math.cos(an) * q, R + Math.sin(an) * q, .7 + Math.random() * 1.9, 0, TAU); x.fill();
    }
    var nx = R + r * .12, ny = R + r * .06, nr = r * .37;         /* nucleus, in a second channel */
    g = x.createRadialGradient(nx, ny, nr * .5, nx, ny, nr * 1.7);
    g.addColorStop(0, col(nuc, .24)); g.addColorStop(1, col(nuc, 0));
    x.fillStyle = g; x.beginPath(); x.arc(nx, ny, nr * 1.7, 0, TAU); x.fill();
    g = x.createRadialGradient(nx - nr * .3, ny - nr * .3, nr * .05, nx, ny, nr);
    g.addColorStop(0, col(nuc, .98)); g.addColorStop(.62, col(nuc, .6)); g.addColorStop(1, col(nuc, 0));
    x.fillStyle = g; x.beginPath(); x.arc(nx, ny, nr, 0, TAU); x.fill();
    for (i = 0; i < 5; i++) {                                     /* nucleoli */
      var a2 = Math.random() * TAU, q2 = Math.random() * nr * .55;
      x.fillStyle = 'rgba(255,255,255,' + (.25 + Math.random() * .3) + ')';
      x.beginPath(); x.arc(nx + Math.cos(a2) * q2, ny + Math.sin(a2) * q2, 1 + Math.random() * 2.2, 0, TAU); x.fill();
    }
    return c;
  }
  function sprites() {
    if (!SPRITES) {
      var pairs = [[INK.e, INK.a], [INK.v, INK.e], [INK.a, INK.v]];
      SPRITES = pairs.map(function (pr) { return { sharp: cellSprite(pr[0], pr[1], false), soft: cellSprite(pr[0], pr[1], true) }; });
    }
    return SPRITES;
  }
  function cellField(cv) {
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    var SP = sprites();
    var W = 0, H = 0, dpr = 1, cells = [], dust = [], max = 12, raf = 0, running = false, visible = false, t0 = 0, px = -9999, py = -9999;
    var mode = cv.getAttribute('data-cells') || '';
    var dens = parseFloat(cv.getAttribute('data-density') || '1');
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    function size() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(w.devicePixelRatio || 1, 1.5);
      W = r.width; H = r.height;
      if (W * H * dpr * dpr > 3.4e6) dpr = Math.max(1, Math.sqrt(3.4e6 / (W * H)));   /* a pixel budget, so a tall canvas on a sharp screen stays light */
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    }
    function make(x, y, r, z, kind) {
      if (kind == null) { var k = Math.random(); kind = k < .56 ? 0 : k < .86 ? 1 : 2; }
      return { x: x, y: y, r: r, tr: r, z: z, k: kind, vx: rnd(-1, 1) * 5, vy: rnd(-1, 1) * 3.4 - 1.6, ph: rnd(0, TAU), a: 0, ta: 1, div: -1, ang: rnd(0, TAU), spin: rnd(-.05, .05), next: rnd(4, 22) };
    }
    function seed() {
      cells = []; dust = [];
      var n = clamp(Math.round(W * H / 56000 * dens), 6, 30), i, z, x, y;
      if (mode === 'specimen') {
        /* Each page grows its own specimen. kind 0 is pink, 1 violet, 2 blue: the page's ink. */
        var big = clamp(Math.min(H * .34, W * .2), 70, 210), spec = cv.getAttribute('data-spec') || '', ink = parseInt(cv.getAttribute('data-ink') || '0', 10) || 0;
        var hold = function (c1, sx, sy) { c1.vx = sx; c1.vy = sy; c1.spin *= .3; c1.next = 1e9; c1.a = .001; return c1; };
        var o1 = (ink + 1) % 3, o2 = (ink + 2) % 3, c0;
        if (spec === 'trio') {                       /* three parties: three cells, one of each ink */
          cells.push(hold(make(W * .64, H * .36, big * .64, 1, 1), -1.2, -.5));
          cells.push(hold(make(W * .85, H * .6, big * .74, 1, 0), 1, -.7));
          cells.push(hold(make(W * .6, H * .8, big * .5, .9, 2), -.6, .5));
          cells.push(make(W * .95, H * .16, big * .3, .62, 1));
        } else if (spec === 'quad') {                /* four areas of care: four cells */
          cells.push(hold(make(W * .63, H * .32, big * .56, 1, 1), -1.1, -.5));
          cells.push(hold(make(W * .85, H * .36, big * .64, 1, 0), 1, -.6));
          cells.push(hold(make(W * .68, H * .74, big * .6, 1, 2), -.7, .5));
          cells.push(hold(make(W * .9, H * .78, big * .46, .9, 1), .8, .6));
        } else if (spec === 'colony') {              /* eight deliverables: a colony of eight */
          [[.6, .3, .36], [.74, .22, .3], [.88, .34, .4], [.67, .56, .46], [.83, .62, .34], [.94, .7, .28], [.58, .84, .3], [.76, .88, .38]].forEach(function (q, j) {
            cells.push(hold(make(W * q[0], H * q[1], big * q[2], j % 3 === 2 ? .8 : 1, j === 3 ? o1 : ink), rnd(-1.4, 1.4), rnd(-1, .6)));
          });
        } else if (spec === 'rings') {               /* six layers of law: one cell inside six membranes */
          c0 = hold(make(W * .74, H * .5, big * .56, 1, ink), -1, -.4); c0.rings = 5; c0.ang = 0; c0.spin = 0;
          cells.push(c0);
          cells.push(make(W * .95, H * .16, big * .34, .7, o1));
          cells.push(make(W * .54, H * .88, big * .3, .64, ink));
        } else if (spec === 'swarm') {               /* many questions: many small cells */
          for (i = 0; i < 9; i++) cells.push(hold(make(W * rnd(.5, .97), H * rnd(.1, .9), big * rnd(.2, .42), rnd(.7, 1), i % 3), rnd(-2, 2), rnd(-1.4, .8)));
        } else {                                     /* one cell, dividing */
          c0 = make(W * .73, H * .5, big, 1, ink); c0.div = .16; c0.vx = -1.5; c0.vy = -.6; c0.ang = -.5; c0.spin = .012; c0.a = .001;
          cells.push(c0);
          cells.push(make(W * .93, H * .2, big * .52, .8, o1));
          cells.push(make(W * .55, H * .84, big * .42, .7, ink));
          cells.push(make(W * .9, H * .86, big * .34, .62, o2));
        }
        n = Math.max(4, Math.round(n * .5));
      }
      if (mode === 'edges') {                      /* a few sharp cells frame the first screen; the rest are scattered */
        var top = Math.min(H, 940), anchors = [[.03, .44, 58, 0], [.972, .7, 66, 0], [.965, .26, 40, 1], [.022, .9, 46, 2]];
        if (W > 900) anchors.forEach(function (q) { var c1 = make(W * q[0], top * q[1], q[2], rnd(.86, 1), q[3]); c1.vx *= .4; c1.vy = rnd(-1.2, .4); cells.push(c1); });
      }
      for (i = 0; i < n; i++) {
        z = rnd(.25, 1);
        if (mode === 'specimen' || mode === 'right') x = W * (1 - Math.pow(Math.random(), 1.5) * .8);
        else if (mode === 'edges') { x = Math.random(); x = W * (x < .5 ? Math.pow(x * 2, 1.7) * .5 : 1 - Math.pow((1 - x) * 2, 1.7) * .5); }
        else x = rnd(0, W);
        y = rnd(0, H);
        cells.push(make(x, y, rnd(24, 64) * (.5 + z * .62), z));
      }
      cells.sort(function (a, b) { return a.z - b.z; });
      for (i = 0; i < Math.round(n * 3.2); i++) dust.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(.5, 1.7), v: rnd(3, 10), a: rnd(.12, .55), ph: rnd(0, TAU), k: Math.random() < .5 ? INK.e : Math.random() < .6 ? INK.v : INK.a });
      max = cells.length + Math.max(2, Math.round(n * .3));
    }
    function stamp(c, ox, oy, rr, alpha) {
      var s = rr / .56 * 2;                                        /* the sprite's cell radius is .56 of its half-size */
      ctx.globalAlpha = alpha;
      ctx.drawImage(c.z < .56 ? SP[c.k].soft : SP[c.k].sharp, ox - s / 2, oy - s / 2, s, s);
    }
    function draw(c, t) {
      var alpha = c.a * (.3 + c.z * .7);
      if (alpha < .01) return;
      var br = 1 + Math.sin(t * .7 + c.ph) * .035, r = c.r * br;
      var co = Math.cos(c.ang), si = Math.sin(c.ang);
      ctx.setTransform(dpr * co, dpr * si, -dpr * si * (2 - br), dpr * co * (2 - br), dpr * c.x, dpr * c.y);
      if (c.rings) {                                              /* extra membranes, each a little fainter and breathing out of step */
        var kk = c.k === 0 ? INK.e : c.k === 1 ? INK.v : INK.a;
        for (var j = 1; j <= c.rings; j++) {
          var rj = r * (1 + j * .25 + Math.sin(t * .5 + c.ph + j * .9) * .012);
          ctx.globalAlpha = alpha * (.62 - j * .09);
          ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(' + kk[0] + ',' + kk[1] + ',' + kk[2] + ',.16)'; ctx.beginPath(); ctx.arc(0, 0, rj, 0, TAU); ctx.stroke();
          ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(' + kk[0] + ',' + kk[1] + ',' + kk[2] + ',.95)'; ctx.beginPath(); ctx.arc(0, 0, rj, 0, TAU); ctx.stroke();
        }
      }
      if (c.div < 0) stamp(c, 0, 0, r, alpha);
      else {
        var p = c.div, e = p < .12 ? 0 : (p - .12) / .88; e = e * e * (3 - 2 * e);
        var rr = r * (1 - .2 * e), half = e * rr * 1.02;
        stamp(c, -half, 0, rr, alpha * (1 - .22 * (1 - e)));
        stamp(c, half, 0, rr, alpha * (1 - .22 * (1 - e)));
      }
    }
    function divide(c, i) {
      var rr = c.r * .8, half = rr * 1.02, cx = Math.cos(c.ang), sy = Math.sin(c.ang);
      var a = make(c.x - cx * half, c.y - sy * half, rr, c.z, c.k), b = make(c.x + cx * half, c.y + sy * half, rr, c.z, c.k);
      [a, b].forEach(function (n, j) {
        var sgn = j ? 1 : -1;
        n.a = c.a; n.tr = c.r * rnd(.84, .96); n.vx = c.vx + cx * 5 * sgn; n.vy = c.vy + sy * 5 * sgn; n.next = rnd(18, 46); n.ang = c.ang; n.spin = c.spin;
      });
      cells.splice(i, 1, a, b);
    }
    function frame(now) {
      raf = 0;
      if (!cv.isConnected) { running = false; return; }
      var t = now / 1000, dt = Math.min(.05, t0 ? t - t0 : .016); t0 = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'lighter';
      var i, c, o;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (i = 0; i < dust.length; i++) {
        o = dust[i]; o.y -= o.v * dt; o.x += Math.sin(t * .5 + o.ph) * 4 * dt;
        if (o.y < -4) { o.y = H + 4; o.x = rnd(0, W); }
        ctx.globalAlpha = o.a * (.55 + .45 * Math.sin(t * 1.3 + o.ph));
        ctx.fillStyle = 'rgb(' + o.k[0] + ',' + o.k[1] + ',' + o.k[2] + ')';
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill();
      }
      for (i = cells.length - 1; i >= 0; i--) {
        c = cells[i];
        c.x += c.vx * c.z * dt; c.y += c.vy * c.z * dt; c.ang += c.spin * dt;
        var dx = c.x - px, dy = c.y - py, dd = dx * dx + dy * dy, reach = 30000 + c.r * c.r * 2;
        if (dd < reach) { var f = (1 - dd / reach) * 26 * dt, m = Math.sqrt(dd) || 1; c.x += dx / m * f; c.y += dy / m * f; }
        var pad = c.r * 2.6;
        if (c.x < -pad) c.x = W + pad; else if (c.x > W + pad) c.x = -pad;
        if (c.y < -pad) c.y = H + pad; else if (c.y > H + pad) c.y = -pad;
        c.a += (c.ta - c.a) * Math.min(1, dt * .9);
        c.r += (c.tr - c.r) * Math.min(1, dt * .2);
        if (c.ta === 0 && c.a < .02) { cells.splice(i, 1); continue; }
        if (c.div >= 0) { c.div += dt / (c.r > 90 ? 16 : 9); if (c.div >= 1) divide(c, i); }
        else { c.next -= dt; if (c.next <= 0) { if (c.z > .56 && c.a > .9 && cells.length <= max) c.div = 0; else c.next = rnd(6, 16); } }
      }
      if (cells.length > max) { for (i = 0; i < cells.length; i++) { if (cells[i].ta && cells[i].div < 0 && cells[i].r < 80) { cells[i].ta = 0; break; } } }
      for (i = 0; i < cells.length; i++) draw(cells[i], t);
      if (running) raf = w.requestAnimationFrame(frame);
    }
    function start() { if (running || reduce) return; running = true; t0 = 0; raf = w.requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) w.cancelAnimationFrame(raf); raf = 0; }
    size(); seed();
    if (reduce) {                                                   /* one still frame */
      ctx.globalCompositeOperation = 'lighter';
      cells.forEach(function (c, i) { c.a = 1; if (c.div < 0 && i % 4 === 1 && c.z > .56) c.div = .6; });
      for (var q = 0; q < cells.length; q++) draw(cells[q], 0);
      return;
    }
    var host = cv.parentElement;
    host.addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; });
    host.addEventListener('pointerleave', function () { px = py = -9999; });
    var rs = 0;
    w.addEventListener('resize', function () {
      if (!cv.isConnected) return;
      clearTimeout(rs);
      rs = setTimeout(function () { var ow = W; size(); if (Math.abs(ow - W) > 80) seed(); }, 180);
    });
    io(function (es) { visible = es[0].isIntersecting; if (visible && !d.hidden) start(); else stop(); }).observe(cv);
    d.addEventListener('visibilitychange', function () { if (d.hidden) stop(); else if (visible && cv.isConnected) start(); });
  }

  /* ---------------------------------------------------------------- the territory map */
  /* every state is open; the tier says what a state's law adds on top of the telehealth menu */
  var TIER = { o: 'Open to partners', p: 'Open to partners', c: 'Open to partners' };      /* every state reads the same */
  var TCLS = { o: 'open', p: 'program', c: 'core' };
  var MINI = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];

  function territoryMap(stage, scope) {
    var M = w.RSP_MAP, S = w.RSP_STATES;
    if (!M || !S) return;
    var by = {}; S.forEach(function (s) { by[s.c] = s; });
    var base = stage.getAttribute('data-base') || '';
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    var years = [];
    S.forEach(function (s) { if (s.yr && years.indexOf(s.yr) < 0) years.push(s.yr); });
    years.sort();

    var bb = M.b || {}, pc = function (v) { return (v * 100).toFixed(3) + '%'; };
    /* a raised copy of one state: four wall layers and a lid, sized to the state's own box so the layers stay small */
    function riserHTML(s, cls) {
      var b = bb[s.c], p = M.p[s.c], l = M.l[s.c]; if (!b || !p) return '';
      var pad = 3, x = b[0] - pad, y = b[1] - pad, wd = b[2] - b[0] + pad * 2, ht = b[3] - b[1] + pad * 2, vb = x + ' ' + y + ' ' + wd + ' ' + ht, sides = '';
      for (var k = 1; k <= 4; k++) sides += '<svg class="side" viewBox="' + vb + '" style="--k:' + (k / 5) + '" aria-hidden="true"><path d="' + p + '"/></svg>';
      return '<div class="rz ' + cls + '" data-rz="' + s.c + '" style="left:' + pc(x / M.w) + ';top:' + pc(y / M.h) + ';width:' + pc(wd / M.w) + ';height:' + pc(ht / M.h) + '">' + sides +
        '<svg viewBox="' + vb + '" aria-hidden="true"><path class="st t-' + s.t + '" data-c="' + s.c + '" d="' + p + '"/>' +
        (s.t === 'o' ? '<circle class="ping" cx="' + l[0] + '" cy="' + l[1] + '" r="15" style="--d:' + (-Math.random() * 3).toFixed(2) + 's"/>' : '') +
        (MINI.indexOf(s.c) < 0 ? '<text x="' + l[0] + '" y="' + (l[1] + 4) + '">' + s.c + '</text>' : '') + '</svg>' +
        (s.t === 'o' ? '<span class="beam" style="--x:' + ((l[0] - x) / wd * 100).toFixed(2) + ';--y:' + ((l[1] - 15 - y) / ht * 100).toFixed(2) + ';--d:' + (-Math.random() * 3).toFixed(2) + 's"><b></b><i></i></span>' : '') + '</div>';
    }
    var open = '', all = '', labels = '', minis = '', risers = '';
    S.forEach(function (s) {
      var p = M.p[s.c]; if (!p) return;
      if (s.t === 'o') open += '<path d="' + p + '"/>';
      all += '<path class="st t-' + s.t + '" data-c="' + s.c + '" d="' + p + '"/>';
      var l = M.l[s.c];
      if (MINI.indexOf(s.c) < 0) labels += '<text data-l="' + s.c + '" x="' + l[0] + '" y="' + (l[1] + 4) + '">' + s.c + '</text>';
      if (s.t !== 'c') risers += riserHTML(s, 't-' + s.t);
    });
    MINI.forEach(function (c, i) {
      var s = by[c]; if (!s) return;
      var x = 874 + (i % 3) * 34, y = 300 + Math.floor(i / 3) * 22;
      minis += '<g class="mini t-' + s.t + '" data-c="' + c + '"><rect x="' + x + '" y="' + y + '" width="30" height="18" rx="5"/><text x="' + (x + 15) + '" y="' + (y + 12.6) + '">' + c + '</text></g>';
    });
    var ext = '';
    for (var k = 5; k >= 1; k--) ext += '<svg class="xt" viewBox="0 0 ' + M.w + ' ' + M.h + '" style="transform:translateZ(' + (-k * 4) + 'px)" aria-hidden="true"><path d="' + M.n + '"/></svg>';
    stage.innerHTML =
      '<div class="plane-f"><div class="plane"><div class="underglow"></div>' + ext +
      '<svg class="usmap" viewBox="0 0 ' + M.w + ' ' + M.h + '" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="rsp-open" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8FB3"/><stop offset="1" stop-color="#DC1A3E"/></linearGradient>' +
      '<linearGradient id="rsp-open-h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB9D0"/><stop offset="1" stop-color="#F24263"/></linearGradient>' +
      '<linearGradient id="rsp-prog" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#57C4C7"/><stop offset="1" stop-color="#348497"/></linearGradient>' +
      '<linearGradient id="rsp-prog-h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C4D0EE"/><stop offset="1" stop-color="#32A2BD"/></linearGradient>' +
      '<filter id="rsp-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>' +
      '<clipPath id="rsp-clip"><path d="' + M.n + '"/></clipPath>' +
      '<linearGradient id="rsp-scan" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".2"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>' +
      '<g class="halo" filter="url(#rsp-blur)">' + open + '</g><g>' + all + '</g>' +
      '<g clip-path="url(#rsp-clip)" style="pointer-events:none"><rect class="scan" x="-320" y="-40" width="260" height="' + (M.h + 80) + '" fill="url(#rsp-scan)"/></g>' +
      '<g>' + labels + '</g><g>' + minis + '</g></svg>' +
      risers + '<div class="rz usr" data-rz="pick"></div></div></div><div class="map-tip" aria-hidden="true"></div>';

    var svg = $('.usmap', stage), tip = $('.map-tip', stage), plane = $('.plane', stage);
    var el = {}, lab = {}, mini = {}, rz = {}, lid = {}, pickRz = $('.rz.usr', stage);
    $$('.st', svg).forEach(function (p) { el[p.getAttribute('data-c')] = p; });
    $$('text[data-l]', svg).forEach(function (t) { lab[t.getAttribute('data-l')] = t; });
    $$('.mini', svg).forEach(function (g) { mini[g.getAttribute('data-c')] = g; });
    $$('.rz[data-rz]', stage).forEach(function (r) { var c = r.getAttribute('data-rz'); if (c !== 'pick') { rz[c] = r; lid[c] = $('.st', r); } });
    var yearEl = $('#m-year', scope), countEl = $('#m-count', scope), pick = $('#pick', scope), claim = $('#claim', scope);

    function light(s, flash) {
      var p = el[s.c]; if (!p) return;
      p.classList.add('lit'); if (flash) { p.classList.add('flash'); }
      if (mini[s.c]) mini[s.c].classList.add('lit');
      if (lab[s.c]) lab[s.c].classList.add('on');
      if (rz[s.c]) {                                   /* in the 3D stage the state lifts off the plane and leaves its footprint */
        rz[s.c].classList.add('lit'); p.classList.add('up');
        if (lab[s.c]) lab[s.c].classList.add('up');
        if (flash && lid[s.c]) lid[s.c].classList.add('flash');
      }
    }
    function lightAll() {
      S.forEach(function (s) { if (s.t !== 'c') light(s, false); });
      $('.halo', svg).classList.add('lit');
    }
    function openAll(wave, t0) {                                /* every state switches on: all are open */
      S.slice().sort(function (a, b) { return (M.l[a.c] ? M.l[a.c][0] : 0) - (M.l[b.c] ? M.l[b.c][0] : 0); }).forEach(function (s, i) {
        var on = function () {
          if (el[s.c]) el[s.c].classList.add('on');
          if (mini[s.c]) mini[s.c].classList.add('on');
          if (lab[s.c]) lab[s.c].classList.add('on');
        };
        if (wave) w.setTimeout(function () { if (stage.isConnected) on(); }, t0 + i * 15); else on();
      });
    }
    var started = false;
    function sequence() {
      if (started) return; started = true;
      if (reduce) { openAll(false, 0); lightAll(); return; }
      openAll(true, 240 + (RSP.introDelay || 0));
      var LEAD = 1500 + (RSP.introDelay || 0), STEP = 520;
      if (yearEl && years.length) yearEl.textContent = years[0];
      if (countEl) countEl.textContent = '0';
      years.forEach(function (y, i) {
        w.setTimeout(function () {
          if (!stage.isConnected) return;
          S.forEach(function (s) { if (s.yr === y) light(s, true); });
          if (yearEl) yearEl.textContent = y;
          var nLaw = S.filter(function (s) { return s.yr && s.yr <= y; }).length, unit = $('#m-unit', scope);
          if (countEl) countEl.textContent = nLaw;
          if (unit) unit.textContent = nLaw === 1 ? 'state' : 'states';
          if (i === years.length - 1) $('.halo', svg).classList.add('lit');
        }, LEAD + i * STEP);
      });
    }
    if ('IntersectionObserver' in w) io(function (es, o) { if (es[0].isIntersecting) { sequence(); o.disconnect(); } }, { threshold: .2 }).observe(stage);
    else { openAll(false, 0); sequence(); }

    /* the hero plane leans back at rest and tips toward the reader as it scrolls into the middle of the screen */
    if (stage.getAttribute('data-map') === 'hero' && !reduce) {
      var tip3d = function () {
        var r = stage.getBoundingClientRect(), vh = w.innerHeight;
        plane.style.setProperty('--sp', clamp(1 - (r.top - vh * .12) / (vh * .78), 0, 1).toFixed(3));
      };
      onScroll.push(tip3d); tip3d();
    }

    var current = null;
    function select(code, user) {
      var s = by[code]; if (!s) return;
      current = s;
      S.forEach(function (x) {
        if (el[x.c]) el[x.c].classList.toggle('sel', x === s);
        if (mini[x.c]) mini[x.c].classList.toggle('sel', x === s);
        if (lab[x.c]) lab[x.c].classList.toggle('sel', x === s);
        if (rz[x.c]) rz[x.c].classList.toggle('sel', x === s);
      });
      if (el[code] && el[code].parentNode) el[code].parentNode.appendChild(el[code]);   // draw the outline on top
      if (pickRz) {                                    /* a state with no riser of its own gets one while it is picked */
        var old = pickRz.getAttribute('data-for');
        if (old && el[old]) el[old].classList.remove('up');
        if (old && lab[old]) lab[old].classList.remove('up');
        pickRz.classList.remove('lit'); pickRz.removeAttribute('data-for'); pickRz.innerHTML = '';
        if (!rz[code] && bb[code] && MINI.indexOf(code) < 0) {
          var tmp = d.createElement('div'); tmp.innerHTML = riserHTML(s, 'usr');
          var src = tmp.firstChild;
          pickRz.style.cssText = src.style.cssText; pickRz.innerHTML = src.innerHTML; pickRz.setAttribute('data-for', code);
          void pickRz.offsetWidth;
          pickRz.classList.add('lit'); el[code].classList.add('up'); if (lab[code]) lab[code].classList.add('up');
        }
      }
      if (pick) pick.value = code;
      if (!claim) return;
      var set = function (id, t) { var n = $('#' + id, claim); if (n) n.textContent = t; };
      set('c-name', s.n);
      var chip = $('#c-chip', claim);
      if (chip) { chip.className = 'chip ' + TCLS[s.t]; chip.innerHTML = (s.t === 'c' ? '<i></i>' : '') + TIER[s.t]; }
      set('c-offer', 'A compliant model built for ' + (s.n === 'District of Columbia' ? 'the District of Columbia' : s.n) + ', with physician oversight provided.');
      var link = $('#c-link', claim), btn = $('#c-btn', claim);
      if (link) { link.setAttribute('href', base + 'states/' + s.s + '.html'); $('span', link).textContent = 'See ' + s.n; }
      if (btn) $('span', btn).textContent = 'Request the ' + s.n + ' brief';
      if (user && !reduce) { claim.classList.remove('swap'); void claim.offsetWidth; claim.classList.add('swap'); }
    }
    RSP.selectState = select;

    function codeOf(t) { var n = t && t.closest ? t.closest('[data-c]') : null; return n ? n.getAttribute('data-c') : null; }
    plane.addEventListener('click', function (e) { var c = codeOf(e.target); if (c) RSP.choose(c, 'map'); });
    var hov = null;
    function showTip(c, e) {
      var s = by[c]; if (!s) return;
      if (hov !== c) {
        setHov(hov, false);
        hov = c; setHov(c, true);
        tip.innerHTML = esc(s.n) + '<small>' + TIER[s.t] + '</small>';
      }
      var r = stage.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
      tip.classList.add('on');
    }
    function setHov(c, on) {
      if (!c) return;
      if (el[c]) el[c].classList.toggle('hov', on);
      if (lid[c]) lid[c].classList.toggle('hov', on);
    }
    function hideTip() { setHov(hov, false); hov = null; tip.classList.remove('on'); }
    if (fine) {
      plane.addEventListener('pointermove', function (e) { var c = codeOf(e.target); if (c) showTip(c, e); else hideTip(); });
      plane.addEventListener('pointerleave', hideTip);
      plane.addEventListener('pointerout', function (e) { if (!codeOf(e.relatedTarget)) hideTip(); });
      /* the map lies flat and stays still: it no longer turns with the pointer */
    }
    if (pick) {
      if (pick.options.length < 3) S.slice().sort(function (a, b) { return a.n.localeCompare(b.n); }).forEach(function (s) {
        var o = d.createElement('option'); o.value = s.c; o.textContent = s.n; pick.appendChild(o);
      });
      pick.addEventListener('change', function () { RSP.choose(pick.value, 'map'); });
    }
    var want = '';
    try { want = (new URLSearchParams(RSP.query()).get('state') || '').toUpperCase(); } catch (e) { want = ''; }
    var kept = recall();
    if (want && by[want]) { select(want, false); RSP.state = want; }
    else if (kept && by[kept]) { select(kept, false); RSP.state = kept; }
    else if (RSP.geo && by[RSP.geo]) select(RSP.geo, false);
    else select(stage.getAttribute('data-start') || 'GA', false);
    RSP.mapFollowsGeo = !(want && by[want]) && !(kept && by[kept]);

    /* filters on the state law page */
    var fbtns = $$('[data-f]', scope), rows = $$('.st-list li', scope), search = $('#st-search', scope), none = $('.st-none', scope);
    if (fbtns.length || search) {
      var f = 'all', q = '';
      var ok = function (s) {
        return (f === 'all' || (f === 'd' ? s.own === 'd' : s.t === f)) && (!q || s.n.toLowerCase().indexOf(q) >= 0 || s.c.toLowerCase() === q);
      };
      var fitList = $('.st-list.fit', scope), moreP = $('.st-more', scope);        /* the list opens short; a tap, a filter or a search shows every row */
      var showAllRows = function () { if (fitList) fitList.classList.remove('fit'); if (moreP) moreP.hidden = true; };
      var moreB = moreP ? $('button', moreP) : null;
      if (moreB) moreB.addEventListener('click', function () { showAllRows(); track('Detail opened', { detail: 'All states' }); });
      var apply = function () {
        var shown = 0;
        if (f !== 'all' || q) showAllRows();
        S.forEach(function (s) {
          var o = ok(s);
          if (el[s.c]) el[s.c].classList.toggle('dim', !o);
          if (mini[s.c]) mini[s.c].classList.toggle('dim', !o);
          if (lab[s.c]) lab[s.c].classList.toggle('dim', !o);
        });
        rows.forEach(function (li) { var o = ok(by[li.getAttribute('data-c')]); li.hidden = !o; if (o) shown++; });
        if (none) none.hidden = shown > 0;
      };
      fbtns.forEach(function (b) {
        b.addEventListener('click', function () {
          f = b.getAttribute('data-f');
          fbtns.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-f') === f ? 'true' : 'false'); });
          apply();
        });
      });
      if (search) search.addEventListener('input', function () { q = search.value.trim().toLowerCase(); apply(); });
    }
  }

  /* ---------------------------------------------------------------- scroll-linked pieces */
  function timelines(scope) {
    $$('.tl', scope).forEach(function (tl) {
      var line = $('.tl-line', tl), items = $$('.tl-item', tl);
      if (!line) return;
      var upd = function () {
        var r = tl.getBoundingClientRect(), vh = w.innerHeight;
        var f = reduce ? 1 : clamp((vh * .62 - r.top) / Math.max(1, r.height), 0, 1);
        line.style.setProperty('--f', f.toFixed(4));
        var y = r.top + 10 + (r.height - 20) * f;
        items.forEach(function (it) { var dr = $('.tl-dot', it).getBoundingClientRect(); it.classList.toggle('on', dr.top + dr.height / 2 <= y + 2); });
      };
      onScroll.push(upd); upd();
    });
    $$('.plates', scope).forEach(function (pl) {
      var ul = $('ul', pl), lis = $$('li', pl), list = $$('.lawlist li', scope);
      var upd = function () {
        var r = pl.getBoundingClientRect(), vh = w.innerHeight;
        var f = reduce ? 1 : clamp(1 - (r.top - vh * .2) / (vh * .7), 0, 1);
        ul.style.setProperty('--gap', (24 + f * 30).toFixed(1) + 'px');
      };
      onScroll.push(upd); upd();
      list.forEach(function (li) {
        var k = li.getAttribute('data-k'), plate = lis.filter(function (x) { return x.getAttribute('data-k') === k; })[0];
        if (!plate) return;
        var on = function (o) { plate.classList.toggle('hot', o); li.classList.toggle('hot', o); };
        li.addEventListener('pointerenter', function () { on(true); });
        li.addEventListener('pointerleave', function () { on(false); });
      });
      if ('IntersectionObserver' in w && list.length) {
        var spy = io(function (es) {
          es.forEach(function (e) {
            var k = e.target.getAttribute('data-k');
            lis.forEach(function (x) { if (x.getAttribute('data-k') === k) x.classList.toggle('hot', e.isIntersecting); });
            e.target.classList.toggle('hot', e.isIntersecting);
          });
        }, { rootMargin: '-42% 0px -42% 0px' });
        list.forEach(function (li) { spy.observe(li); });
      }
    });
    var dial = $('.dial', scope), dl = $$('.dlv-i', scope);
    if (dial && dl.length && 'IntersectionObserver' in w) {
      var L = $('#dial-l', dial), I = $('#dial-i', dial), T = $('#dial-t', dial), face = $('.dial-face', dial), cur = -1;
      var setDial = function (i) {
        if (i === cur) return; cur = i;
        dl.forEach(function (x, j) { x.classList.toggle('cur', j === i); });
        L.textContent = dl[i].getAttribute('data-letter'); I.textContent = i + 1; T.textContent = dl[i].getAttribute('data-title');
        face.style.setProperty('--pct', ((i + 1) / dl.length).toFixed(4));
        if (!reduce) { L.classList.remove('flip'); void L.offsetWidth; L.classList.add('flip'); }
      };
      var spy2 = io(function (es) { es.forEach(function (e) { if (e.isIntersecting) setDial(dl.indexOf(e.target)); }); }, { rootMargin: '-38% 0px -52% 0px' });
      dl.forEach(function (x) { spy2.observe(x); });
      setDial(0);
    }
  }

  /* ---------------------------------------------------------------- how it works: one scene, three flows
     Where the scene is pinned (a tall, wide screen) the page's own scroll moves through the flows.
     Elsewhere the flows change on a timer until the reader picks one. */
  function flows(scope) {
    /* three views of one diagram, picked by tab. Until the visitor picks one, the views take turns. */
    $$('[data-story]', scope).forEach(function (st) {
      var flow = $('.flow', st), steps = $$('.story-steps li', st);
      if (!flow || !steps.length) return;
      var btns = steps.map(function (li) { return $('button', li); });
      var order = btns.map(function (b) { return b.getAttribute('data-flow'); }), n = order.length, idx = -1, auto = 0, hands = false;
      var set = function (i) {
        if (i === idx) return; idx = i;
        flow.setAttribute('data-flow', order[i]);
        steps.forEach(function (li, j) { li.classList.toggle('on', j === i); btns[j].setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      };
      var stop = function () { if (auto) { w.clearInterval(auto); auto = 0; } st.classList.remove('auto'); };
      var start = function () {
        if (auto || hands || reduce) return;
        st.classList.add('auto');
        auto = w.setInterval(function () { if (!st.isConnected) { stop(); return; } set((idx + 1) % n); }, 5200);
      };
      btns.forEach(function (b, i) {
        b.addEventListener('click', function () { hands = true; stop(); set(i); track('Model view', { view: order[i] }); });
      });
      set(0);
      /* every view's caption gets the room of the longest one, so nothing below moves when the view changes */
      var caps = steps.map(function (li) { return $('.cap > span', li); });
      var fit = function () { var m = 0; caps.forEach(function (c) { if (c) m = Math.max(m, c.scrollHeight); }); st.style.setProperty('--capmax', m + 'px'); };
      fit();
      if ('ResizeObserver' in w) { var ro = new ResizeObserver(fit); ro.observe(st); pageObservers.push(ro); }
      if (d.fonts && d.fonts.ready && d.fonts.ready.then) d.fonts.ready.then(fit);
      if ('IntersectionObserver' in w) io(function (es) { if (es[0].isIntersecting) start(); else stop(); }, { threshold: .35 }).observe(flow);
    });
  }

  /* ---------------------------------------------------------------- questions */
  function faqs(scope) {
    $$('.faq details, details.tap, details.tapx, details.fold, details.claim-more', scope).forEach(function (dt) {
      var sum = dt.querySelector('summary'), ans = null;
      for (var c = dt.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains('ans')) ans = c;
      if (!sum || !ans) return;
      var isQ = !!dt.closest('.faq');
      dt.addEventListener('toggle', function () {
        if (!dt.open) return;
        /* what is inside a drawer shows at once, and anything that measures itself gets a chance to */
        $$('[data-r],[data-in],.split,[data-stagger]', dt).forEach(function (el) { el.classList.add('in'); });
        w.dispatchEvent(new Event('resize'));
      });
      sum.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('a')) return;
        if (!dt.open) track(isQ ? 'Question opened' : 'Detail opened', isQ ? { question: sum.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) } : { detail: sum.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) });
        if (reduce || !ans.animate) return;
        ev.preventDefault();
        if (dt.open) {
          var h = ans.offsetHeight;
          var a = ans.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)' });
          a.onfinish = function () { dt.open = false; };
        } else {
          dt.open = true;
          var h2 = ans.offsetHeight;
          ans.animate([{ height: '0px', opacity: 0 }, { height: h2 + 'px', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      });
    });
    var search = $('#faq-search', scope), cats = $$('[data-cat]', scope), secs = $$('.faq-sec', scope), none = $('.faq-none', scope);
    if (search || cats.length) {
      var cat = 'all', q = '';
      var apply = function () {
        var total = 0;
        secs.forEach(function (sec) {
          var shown = 0, okCat = cat === 'all' || sec.getAttribute('data-sec') === cat;
          $$('details', sec).forEach(function (dt) {
            var o = okCat && (!q || dt.textContent.toLowerCase().indexOf(q) >= 0);
            dt.hidden = !o; if (o) shown++;
          });
          sec.hidden = shown === 0; total += shown;
        });
        if (none) none.hidden = total > 0;
      };
      cats.forEach(function (b) {
        b.addEventListener('click', function () {
          cat = b.getAttribute('data-cat');
          cats.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          apply();
        });
      });
      if (search) search.addEventListener('input', function () { q = search.value.trim().toLowerCase(); apply(); });
    }
  }

  /* ---------------------------------------------------------------- the partner brief form */
  function forms(scope) {
    var form = $('#form', scope); if (!form) return;
    var steps = $$('.fstep', form), msg = $('.form-msg', form), err = $('.form-err', form), fs = $('#f-state', form), progT = $('#prog-t', form);
    var show = function (n, focus) {
      steps.forEach(function (f) { f.hidden = f.getAttribute('data-step') !== String(n); });
      form.setAttribute('data-step', n);
      if (progT) progT.textContent = 'Step ' + n + ' of 2';
      if (focus) { var f = $('.fstep[data-step="' + n + '"] input, .fstep[data-step="' + n + '"] select', form); if (f) f.focus(); }
    };
    var valid = function (n) {
      var first = null;
      $$('.fstep[data-step="' + n + '"] [required]', form).forEach(function (el) { if (!el.checkValidity() && !first) first = el; });
      if (first) { first.reportValidity(); return false; }
      return true;
    };
    var done = function (title, text) {
      steps.forEach(function (f) { f.hidden = true; });
      $('.prog', form).hidden = true; $('.form-note', form).hidden = true;
      msg.hidden = false; $('h3', msg).textContent = title; $('p', msg).textContent = text;
      msg.setAttribute('tabindex', '-1'); msg.focus();
    };
    show(1, false);
    var want = '';
    try { want = (new URLSearchParams(RSP.query()).get('state') || '').toUpperCase(); } catch (e) { want = ''; }
    var preset = want || form.getAttribute('data-state') || RSP.state || '';
    if (fs && preset && $('option[value="' + preset + '"]', fs)) fs.value = preset;
    $('[data-next]', form).addEventListener('click', function () { if (valid(1)) { show(2, true); track('Form started', { state: fs ? fs.value : '' }); } });
    $('[data-back]', form).addEventListener('click', function () { show(1, true); });
    if (fs) fs.addEventListener('change', function () { if (fs.value) RSP.choose(fs.value, 'form'); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!valid(2)) return;
      var ctx = leadContext();
      for (var key in ctx) {
        var hid = form.querySelector('input[type=hidden][name="' + key + '"]');
        if (!hid) { hid = d.createElement('input'); hid.type = 'hidden'; hid.name = key; form.appendChild(hid); }
        hid.value = ctx[key];
      }
      track('Brief requested', { state: fs ? fs.value : '' });
      var ep = CFG.formEndpoint || form.getAttribute('data-endpoint');
      if (!ep) { done('This form is not connected yet.', 'Pre-launch draft. Nothing was sent. Add your form address to assets/config.js to connect it to your customer system.'); return; }
      var btn = $('[type=submit]', form);
      btn.disabled = true; $('span', btn).textContent = 'Sending';
      err.hidden = true;
      w.fetch(ep, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('send failed');
          var next = CFG.thankYouPage === false ? '' : form.getAttribute('data-thanks');
          if (next) { store('sessionStorage', 'rsp-lead', '1'); RSP.go(next); return; }
          done('The brief is on its way.', 'Check your inbox. We reply within two business days.'); leadEvent();
        })
        .catch(function () { btn.disabled = false; $('span', btn).textContent = 'Send me the partner brief'; err.hidden = false; });
    });
    /* controls that open the form carry the chosen state with them */
    $$('[data-brief]', scope).forEach(function (a) {
      a.addEventListener('click', function () {
        var pickd = RSP.state || RSP.geo;
        if (fs && pickd && (a.id === 'c-btn' || !fs.value)) fs.value = pickd;
        track('Brief button', { place: a.id === 'c-btn' ? 'state card' : a.closest('.dock') ? 'dock' : a.closest('.hero') ? 'first screen' : 'page' });
      });
    });
  }

  /* ---------------------------------------------------------------- the menu board's state picker */
  function picks(scope) {
    /* Pickers elsewhere on a page follow the state picked on the map or the form. None is on the site now; the hook stays for later. */
    var synced = [];
    RSP.pickSync = function (code) { synced.forEach(function (f) { f(code); }); };      /* a state picked on the map lights the board too */
    $$('[data-mall]', scope).forEach(function (b) {                 /* on a phone the full lists open on one tap */
      b.addEventListener('click', function () { var m = b.closest('.mboard'); if (m) m.classList.add('all'); track('Detail opened', { detail: 'Every service' }); });
    });
  }

  /* ---------------------------------------------------------------- mobile dock */
  function dock(scope) {
    var dk = $('#dock'); if (!dk || !('IntersectionObserver' in w)) return;
    var cta = $('.hero .cta', scope) || $('.hero h1', scope), fin = $('#brief', scope) || $('#form', scope);
    var a = true, b = false, upd = function () { dk.classList.toggle('on', !a && !b); };
    dk.classList.remove('on');
    if (cta) io(function (e) { a = e[0].isIntersecting; upd(); }).observe(cta); else a = false;
    if (fin) io(function (e) { b = e[0].isIntersecting; upd(); }, { threshold: .04 }).observe(fin);
  }

  /* ---------------------------------------------------------------- start */
  RSP.page = function (scope) {
    scope = scope || d;
    pageObservers.forEach(function (o) { o.disconnect(); }); pageObservers = [];
    onScroll.length = 0;
    var own = d.body.getAttribute('data-state');        /* a state page counts as picking that state */
    if (own) remember(own);
    RSP.state = own || recall() || null;
    RSP.selectState = null; RSP.pickSync = null; RSP.mapFollowsGeo = false;
    /* One state for the whole page. Whichever control the visitor uses (the map, the menu board, the form),
       every other part of the page follows, and the choice is carried to the next page. */
    RSP.choose = function (code, from) {
      if (!/^[A-Z]{2}$/.test(code || '')) return;
      RSP.state = code; RSP.mapFollowsGeo = false; remember(code);
      var fs = $('#f-state', scope);
      if (fs && fs.value !== code && $('option[value="' + code + '"]', fs)) fs.value = code;
      if (RSP.selectState) RSP.selectState(code, true);
      if (RSP.pickSync) RSP.pickSync(code);
      if (RSP.applyGeo) RSP.applyGeo();
      track('State picked', { state: code, from: from || 'page' });
    };
    logVisit();
    /* the visitor's own state, used wherever they have not chosen one */
    RSP.applyGeo = function () {
      var shown = RSP.state || RSP.geo;
      if (!shown) return;
      var nm = '', op = $('#f-state option[value="' + shown + '"]', scope);
      if (w.RSP_STATES) w.RSP_STATES.forEach(function (x) { if (x.c === shown) nm = x.n; });
      else nm = op ? op.textContent : '';
      var home = d.body.getAttribute('data-state');      /* a state page names its own state in the heading, so the line shows only for a different choice */
      if (nm) $$('[data-geo-line]', scope).forEach(function (el) {
        if (home && shown === home) { el.hidden = true; return; }
        var b = $('[data-geo-name]', el); if (b) b.textContent = nm === 'District of Columbia' ? 'the District of Columbia' : nm; el.hidden = false;
      });
      if (RSP.state || !RSP.geo) return;
      if (RSP.mapFollowsGeo && RSP.selectState) RSP.selectState(RSP.geo, false);
      if (RSP.pickSync) RSP.pickSync(RSP.geo);
      var fs = $('#f-state', scope); if (fs && !fs.value) fs.value = RSP.geo;
    };
    reveals(scope);
    scrubs(scope);
    charts(scope);
    marquees(scope);
    pointerFx(scope);
    $$('[data-map]', scope).forEach(function (st) { territoryMap(st, scope); });
    $$('canvas.cells', scope).forEach(cellField);
    timelines(scope);
    flows(scope);
    var ht = $('.hero-top', scope) || $('.hero-in', scope);       /* the first screen drifts back as the next sheet rises over it */
    if (ht && !reduce) {
      var h0 = ht.classList.contains('hero-in') ? 30 : 160, h1 = ht.classList.contains('hero-in') ? 440 : 560;
      var par = function (y) { ht.style.setProperty('--hp', clamp((y - h0) / h1, 0, 1).toFixed(3)); };
      onScroll.push(par); par(w.scrollY);
    }
    faqs(scope);
    var hb = $('.top [data-brief]');            /* on a landing page the header button goes to the form on that page */
    if (hb) {
      if (!hb.getAttribute('data-href')) hb.setAttribute('data-href', hb.getAttribute('href'));
      hb.setAttribute('href', d.body.classList.contains('page-lp') && $('#brief', scope) ? '#brief' : hb.getAttribute('data-href'));
    }
    if ($('[data-thanks-page]', scope) && store('sessionStorage', 'rsp-lead') === '1') { store('sessionStorage', 'rsp-lead', '0'); leadEvent(); }
    /* a scheduling page, when one is set: the thank-you page offers the call at once */
    var book = $('[data-book]', scope);
    if (book && CFG.bookingLink) {
      var bl = $('[data-book-link]', book);
      bl.setAttribute('href', CFG.bookingLink); book.hidden = false;
      bl.addEventListener('click', function () { track('Call booking opened', {}); });
    }
    forms(scope);
    picks(scope);
    dock(scope);
    RSP.applyGeo();
    $$('a.ext, .readlaw a', scope).forEach(function (a) { a.addEventListener('click', function () { track('Law link', { link: (a.getAttribute('href') || '').replace(/^https?:\/\//, '').slice(0, 80) }); }); });
    if (RSP.tick) RSP.tick();
  };
  function boot() {
    root.classList.add('rv');
    locate();
    chrome();
    if (root.classList.contains('intro-on')) {            /* set in config.js; the overlay itself is CSS, so it shows before any script runs */
      var now = w.performance && w.performance.now ? w.performance.now() : 0, go = Math.max(240, 940 - now);
      RSP.introDelay = Math.round(go + 40);
      root.style.setProperty('--intro-d', RSP.introDelay + 'ms');
      w.setTimeout(function () { root.classList.add('intro-go'); }, go);
      w.setTimeout(function () { root.classList.add('intro-done'); }, go + 950);
      w.setTimeout(function () { root.classList.remove('intro-on'); root.classList.remove('intro-go'); root.classList.remove('intro-done'); root.style.removeProperty('--intro-d'); RSP.introDelay = 0; }, go + 2700);
    }
    consent = csRead();
    applyConsent();             /* tags the visitor already allowed are ready before the page asks for them */
    RSP.page(d);
    csStart();
    w.addEventListener('beforeprint', function () { $$('details').forEach(function (x) { x.open = true; }); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* A visitor who has just booked a call arrives from the booking page with ?booked=1. Tell them what to do before it. */
(function () {
  var d = document, on = false, hit = /[?&]booked=1(&|$)/.test(location.search);
  try { if (hit) sessionStorage.setItem('rsp-booked', '1'); on = sessionStorage.getItem('rsp-booked') === '1'; } catch (e) { on = hit; }
  if (!on) return;
  function show() {
    var letter = d.getElementById('letter'), pill = d.querySelector('.hero-home .pill');
    if (!letter || !pill || d.querySelector('.booked')) return;
    var bar = d.createElement('div'); bar.className = 'booked'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<p><b>Your call is booked.</b> Before we talk, read the letter below. It answers what most people ask first.</p><button type="button">Read the letter</button>';
    pill.parentNode.insertBefore(bar, pill);
    bar.querySelector('button').addEventListener('click', function () { letter.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', show); else show();
})();
