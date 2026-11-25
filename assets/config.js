/* Site settings. These are the only lines you need to edit. README.txt explains each one. */
window.RSP_CONFIG = {
  prelaunch: true,   // true shows the "Pre-launch draft" bar on every page. Change to false after counsel review.
  formEndpoint: "",  // paste the address the partner-brief form should send to (your CRM, Formspree, or a Zapier webhook)
  intro: false,      // true plays the one-second opening the first time a visitor arrives. false turns it off.

  /* The visitor's state. With an address here, the map, the menu and the form open on the visitor's own state.
     "/geo" works once you add the small file for your host from the extras folder. Leave "" to switch the lookup off. */
  locationLookup: "",

  /* Privacy and cookie settings. "always" shows the settings pop-up to every new visitor.
     "auto" shows it only when a tag below is filled in. "off" never shows it. Ask counsel before choosing "off". */
  consent: "always",

  /* Tags. Leave "" for any you do not use. Nothing here loads until the visitor allows that group. */
  tags: {
    googleTagId: "",         // Google Analytics or Google Ads tag, for example "G-XXXXXXX" or "AW-XXXXXXX"
    googleAdsLeadLabel: "",  // Google Ads conversion for a sent form, for example "AW-XXXXXXX/abcDEF"
    metaPixelId: ""          // Meta Pixel ID, numbers only
  },

  /* Any other measurement script (Plausible, Fathom, Umami, PostHog). Paste its address and any attributes it asks for. */
  analytics: { src: "", attributes: {} },

  /* After a sent form, visitors go to thank-you.html, where conversions are counted. false keeps them on the page. */
  thankYouPage: true,

  /* Optional. Your scheduling page (Calendly or similar). With an address here, the thank-you page shows
     a "Pick a time for your call" button, so a new inquiry can book the thirty-minute call at once. */
  bookingLink: ""
};

/* Nothing to edit below this line. */
(function (r) {
  var C = window.RSP_CONFIG;
  r.className = r.className.replace(/\bno-js\b/, 'js');
  if (C.prelaunch) r.setAttribute('data-prelaunch', '');
  /* The opening plays once per visit, and never for visitors who ask their device for less motion. */
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, seen = false;
  try { seen = window.sessionStorage.getItem('rsp-intro') === '1'; window.sessionStorage.setItem('rsp-intro', '1'); } catch (e) { /* storage blocked: play it */ }
  if (C.intro && !calm && !seen) r.className += ' intro-on';
  /* On a web server, ask for the text font early so headlines do not flash in a fallback face.
     Skipped when a page is opened straight from a folder, where browsers refuse the request. */
  var s = document.currentScript;
  if (s && s.src && /^https?:$/.test(location.protocol)) {
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous';
    l.href = s.src.replace(/config\.js(\?.*)?$/, 'fonts/geist-latin.woff2');
    document.head.appendChild(l);
  }
})(document.documentElement);
