// Third-party analytics: PostHog (EU cloud) and Google Analytics 4. Both mirror the events
// platform/events.js already records in our own database; neither replaces it.
//
// They load only on the production host, so a fork, a self-hosted copy or a local checkout never
// reports into these accounts. Automated browsers and anyone with localStorage 'st.noTrack' are
// left out, exactly as in events.js. Identity is our own user id, never an email or a name.
window.ST = window.ST || {};

ST.analytics = (function () {
  const HOSTS = ['surviv-trainer.vercel.app'];
  const POSTHOG_KEY = 'phc_ACmDdg2oaiAJcE5zMC4NVgLoJEzLSDMVuw8bkPmjGaBL';
  const POSTHOG_HOST = 'https://eu.i.posthog.com';
  const GA_ID = 'G-NE05TEV8GY';
  // European Economic Area, the UK and Switzerland: Google Analytics starts with storage denied
  // there (Consent Mode sends cookieless pings). Everywhere else it may set its cookie.
  const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];

  let on = HOSTS.includes(location.hostname) && !navigator.webdriver;
  try { on = on && !localStorage.getItem('st.noTrack'); } catch (e) { /* ignore */ }

  function loadScript(src) {
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  // PostHog's own loader, reduced to the methods used here: calls made before array.js arrives
  // are queued on the stub and replayed when it loads.
  function initPosthog() {
    const ph = window.posthog = window.posthog || [];
    if (ph.__SV) return;
    ph._i = [];
    ph.init = function (key, config) {
      for (const m of ['capture', 'identify', 'reset', 'register']) {
        ph[m] = function () { ph.push([m].concat([].slice.call(arguments))); };
      }
      ph._i.push([key, config, 'posthog']);
    };
    ph.__SV = 1;
    loadScript(POSTHOG_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js');
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: 'history_change',   // the app routes with pushState
      persistence: 'localStorage',          // no PostHog cookie
    });
  }

  function initGa() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const none = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
    window.gtag('consent', 'default', { ...none, analytics_storage: 'denied', region: CONSENT_REGIONS });
    window.gtag('consent', 'default', { ...none, analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);   // page views on history changes come from enhanced measurement
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  }

  // GA4 parameters must be flat scalars; strings are capped at 100 characters.
  function gaParams(props) {
    const out = {};
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else out[k] = String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 100);
    }
    return out;
  }

  function capture(name, props) {
    if (!on) return;
    try { window.posthog.capture(name, props || {}); } catch (e) { /* ignore */ }
    try { window.gtag('event', name, gaParams(props)); } catch (e) { /* ignore */ }
  }

  // Our server user id once there is one, so PostHog joins devices and GA counts users not browsers.
  let identified = null;
  function identify(userId) {
    if (!on || !userId || userId === identified) return;
    identified = userId;
    try { window.posthog.identify(userId); } catch (e) { /* ignore */ }
    try { window.gtag('config', GA_ID, { user_id: userId }); } catch (e) { /* ignore */ }
  }
  function reset() {
    if (!on) return;
    identified = null;
    try { window.posthog.reset(); } catch (e) { /* ignore */ }
  }

  if (on) { initPosthog(); initGa(); }
  return { capture, identify, reset, enabled: () => on };
})();
