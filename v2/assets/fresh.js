/* Design 2 only (THEME "fresh"). One small job.
   Parts marked data-see get the class "in" the first time they are scrolled into view, so a one-time movement can start there.
   With scripts off every page is complete and nothing waits to appear.
   (November 26: the "type your name on the sign" section was taken out of the home page at George's request, and its script with it.
   The earlier version of this file is kept in site3_before_v46/fresh.js.) */
(function (d, w) {
  'use strict';

  /* a name typed on the old sign earlier in this visit is forgotten */
  try { w.sessionStorage.removeItem('rsp-sign'); } catch (e) {}

  /* one-time movement when a part first comes into view. The waiting state is styled under html.see, so it exists only once this script runs. */
  d.documentElement.classList.add('see');
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
