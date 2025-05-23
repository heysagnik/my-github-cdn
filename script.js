(function() {
  const SV = "1.3.0";
  const DBG = false;
  const REST_EP = "http://localhost:3000/api/track";
  const GQL_EP = "http://localhost:3000/api/graphql";
  const USE_GQL = true;
  const EP = USE_GQL ? GQL_EP : REST_EP;
  const TIMEOUT = 20 * 60 * 1000;
  const OPT_KEY = '_ia_optout';
  const SID_KEY = '_ia_sid';
  const UID_KEY = '_ia_uid';

  const log = (...a) => DBG && console.log('[A]', ...a);
  const err = (...a) => DBG && console.error('[A]', ...a);
  const warn = (...a) => DBG && console.warn('[A]', ...a);

  log('Init', SV, EP);
  
  let url = location.href;
  let sid = getSID();
  let lastActivity = Date.now();
  
  function genID() { return Math.random().toString(36).substring(2, 10); }

  function getSID() {
    if (localStorage.getItem(OPT_KEY)) return null;
    let id = sessionStorage.getItem(SID_KEY);
    if (!id) {
      id = genID();
      sessionStorage.setItem(SID_KEY, id);
      log('New sid:', id);
    }
    return id;
  }
  
  function getUID() {
    if (localStorage.getItem(OPT_KEY)) return null;
    let id = localStorage.getItem(UID_KEY);
    if (!id) {
      id = genID();
      localStorage.setItem(UID_KEY, id);
    }
    return id;
  }
  
  function refresh() {
    const now = Date.now();
    if (now - lastActivity > TIMEOUT) {
      if (!localStorage.getItem(OPT_KEY)) {
        sid = genID();
        sessionStorage.setItem(SID_KEY, sid);
      } else {
        sid = null;
      }
    }
    lastActivity = now;
  }
  
  ["mousedown", "keydown", "touchstart", "scroll"].forEach(e => 
    window.addEventListener(e, refresh, { passive: true }));
  
  function pageview() {
    if (!sid) return;
    refresh();
    if (!sid) return;
    
    const params = new URLSearchParams(window.location.search);
    const data = {
      domain: location.hostname,
      type: "pageview",
      url: location.href,
      referrer: document.referrer || null,
      sessionId: sid,
      uid: getUID()
    };

    if (USE_GQL) {
      const payload = {
        query: `mutation Track($input: EventInput!) { track(input: $input) { success sessionId error } }`,
        variables: { input: data }
      };
      send(payload);
    } else {
      const payload = {
        ...data,
        v: SV,
        path: location.pathname,
        us: params.get('utm_source'),
        um: params.get('utm_medium'),
        uc: params.get('utm_campaign'),
        ut: params.get('utm_term'),
        ue: params.get('utm_content'),
        ts: Date.now()
      };
      send(payload);
    }
  }
  
  window.trackEvent = function(name, data) {
    if (!sid) return;
    refresh();
    if (!sid) return;
    
    const commonData = {
      domain: location.hostname,
      type: "event",
      url: location.href,
      eventName: name,
      eventData: typeof data === 'object' ? JSON.stringify(data) : String(data),
      sessionId: sid,
      uid: getUID()
    };
    
    if (USE_GQL) {
      const payload = {
        query: `mutation Track($input: EventInput!) { track(input: $input) { success sessionId error } }`,
        variables: { input: commonData }
      };
      send(payload);
    } else {
      const payload = {
        ...commonData,
        v: SV,
        referrer: document.referrer || null,
        ts: Date.now()
      };
      send(payload);
    }
  };
  
  function send(data) {
    const json = JSON.stringify(data);
    
    fetch(EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true
    })
    .then(r => {
      if (!r.ok) {
        r.text().then(t => err(`HTTP ${r.status}: ${t}`)).catch(() => {});
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json().catch(() => ({}));
    })
    .then(r => {
      if (USE_GQL && r.errors) {
        err('GQL errors:', r.errors);
        throw new Error('GQL error');
      }
    })
    .catch(e => {
      err('Send error:', e.message);
      fallback(data);
    });
  }
  
  function fallback(data) {
    const json = JSON.stringify(data);
    
    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(EP, json)) return;
        warn('Beacon failed');
      } catch (e) {
        err('Beacon error', e);
      }
    }
    
    if (!USE_GQL) {
      const img = new Image();
      const param = "?d=" + encodeURIComponent(json);
      if ((REST_EP + param).length > 2048) warn("URL too long");
      img.src = REST_EP + param;
    } else {
      err('GQL fallback not available');
    }
  }
  
  function handleNav() {
    if (url !== location.href) {
      url = location.href;
      setTimeout(pageview, 150);
    }
  }
  
  function init() {
    window.insightAnalytics = {
      optOut: function() {
        localStorage.setItem(OPT_KEY, '1');
        sessionStorage.removeItem(SID_KEY);
        sid = null;
        return "Analytics disabled";
      },
      optIn: function() {
        localStorage.removeItem(OPT_KEY);
        sid = getSID();
        if (sid) pageview();
        return "Analytics enabled";
      },
      isOptedOut: function() {
        return !!localStorage.getItem(OPT_KEY);
      }
    };
    
    if (!window.insightAnalytics.isOptedOut()) {
      pageview();
      
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      
      history.pushState = function() {
        origPush.apply(this, arguments);
        handleNav();
      };
      
      history.replaceState = function() {
        origReplace.apply(this, arguments);
        handleNav();
      };
      
      window.addEventListener('popstate', handleNav);
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh();
      });
    }
  }
  
  window.iaTrackEvent = window.trackEvent;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
