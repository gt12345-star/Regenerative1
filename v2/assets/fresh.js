/* Design 2 only (THEME "fresh"). Two small jobs.
   1. The sign. On the home page a visitor types a name on the clinic's sign. That name is then shown on every drawing that says YOUR NAME HERE,
      on this page and on the pages opened after it, for this visit. It is kept in this browser tab only (session storage) and is never sent anywhere.
   2. Parts marked data-see get the class "in" the first time they are scrolled into view, so a one-time movement can start there.
   With scripts off every page is complete: the sign reads YOUR NAME HERE and nothing waits to appear. */
(function (d, w) {
  'use strict';
  var K = 'rsp-sign', MAX = 22;
  function clean(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9 &'.\-]/g, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '').slice(0, MAX); }
  function stored() { try { return clean(w.sessionStorage.getItem(K)).replace(/\s+$/, ''); } catch (e) { return ''; } }

  /* every drawing that carries the name: <text data-sign="widest run, in the drawing's own units"> */
  var texts = [].slice.call(d.querySelectorAll('[data-sign]'));
  texts.forEach(function (t) { t._o = t.textContent; });
  function fitText(t, name) {
    t.style.fontSize = '';
    t.textContent = name ? name.toUpperCase() : t._o;
    if (!name) return;
    var max = parseFloat(t.getAttribute('data-sign')) || 0, n, len, fs;
    if (!max) return;
    for (n = 0; n < 3; n++) {                       // letter-spacing does not shrink with the type, so one pass can land a little wide
      len = 0; fs = parseFloat(w.getComputedStyle(t).fontSize) || 0;
      try { len = t.getComputedTextLength(); } catch (e) {}
      if (!len && fs) len = name.length * fs * 0.7;
      if (!fs || len <= max) break;
      t.style.fontSize = (fs * max / len * 0.985).toFixed(2) + 'px';
    }
  }

  /* the sign itself: an input laid over the clinic drawing */
  var inp = d.querySelector('[data-sign-input]'), stg = inp && inp.closest ? inp.closest('.fr-stg') : null;
  var note = d.querySelector('[data-sign-note]'), say = d.querySelector('[data-sign-say]'), note0 = note ? note.textContent : '';
  var cv = null; try { cv = d.createElement('canvas').getContext('2d'); } catch (e) {}
  function fitInput() {
    if (!inp) return;
    var v = (inp.value || inp.placeholder || '').toUpperCase(), k = 1;
    if (cv && v) { cv.font = '800 100px Jakarta, system-ui, Arial, sans-serif'; k = Math.min(1, 10.8 / (cv.measureText(v).width / 100 + v.length * 0.043)); }
    inp.style.setProperty('--k', k.toFixed(3));
  }
  function apply(name, typed) {
    texts.forEach(function (t) { fitText(t, name); });
    if (inp && !typed) inp.value = name;
    fitInput();
    if (stg) { if (name) stg.setAttribute('data-named', ''); else stg.removeAttribute('data-named'); }
    if (note) note.textContent = name ? 'That is your office' : note0;
    try { if (name) w.sessionStorage.setItem(K, name); else w.sessionStorage.removeItem(K); } catch (e) {}
  }
  var first = stored();
  if (first) apply(first, false); else fitInput();
  if (inp) {
    var t0;
    inp.addEventListener('input', function () {
      var v = clean(inp.value);
      if (v !== inp.value) inp.value = v;
      v = v.replace(/\s+$/, '');
      apply(v, true);
      clearTimeout(t0);
      t0 = setTimeout(function () { if (say) say.textContent = v ? 'The sign now reads ' + v + '.' : 'The sign is blank again.'; }, 900);
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
  }
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { var n = stored(); if (n) texts.forEach(function (t) { fitText(t, n); }); fitInput(); });

  /* one-time movement when a part first comes into view */
  var seen = [].slice.call(d.querySelectorAll('[data-see]'));
  if (seen.length) {
    if ('IntersectionObserver' in w) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -22% 0px' });
      seen.forEach(function (s) { io.observe(s); });
    } else seen.forEach(function (s) { s.classList.add('in'); });
  }
})(document, window);
