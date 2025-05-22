<script>
(function() {
  // --- Configuration ---
  const SCRIPT_VERSION = "1.1.0"; // Example version, update as needed
  // DEBUG_MODE should be false in production to reduce script size and console noise
  const DEBUG_MODE = true;
  const ENDPOINT = "http://localhost:3000/api/track";
  const SESSION_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
  const OPT_OUT_KEY = '_ia_optout';
  const SESSION_ID_KEY = '_ia_sid';

  // --- Logging Utility ---
  function log(...args) { if (DEBUG_MODE) console.log('[Analytics]', ...args); }
  function errorLog(...args) { if (DEBUG_MODE) console.error('[Analytics]', ...args); }
  function warnLog(...args) { if (DEBUG_MODE) console.warn('[Analytics]', ...args); }

  log('Script Initializing. Version:', SCRIPT_VERSION, 'Debug:', DEBUG_MODE, 'Endpoint:', ENDPOINT);
  
  let currentUrl = location.href;
  let sessionId = getSessionId();
  let lastActivityTime = Date.now();
  
  function generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  function getSessionId() {
    if (localStorage.getItem(OPT_OUT_KEY)) {
      log('Opt-out flag is set. No session ID.');
      return null;
    }
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = generateId();
      sessionStorage.setItem(SESSION_ID_KEY, id);
      log('New session ID created:', id);
    } else {
      log('Existing session ID found:', id);
    }
    return id;
  }
  
  function refreshSession() {
    const now = Date.now();
    if (now - lastActivityTime > SESSION_TIMEOUT_MS) {
      log('Session timeout. Refreshing session ID.');
      // Only refresh if not opted out
      if (!localStorage.getItem(OPT_OUT_KEY)) {
        sessionId = generateId();
        sessionStorage.setItem(SESSION_ID_KEY, sessionId);
      } else {
        sessionId = null; // Ensure session ID is null if opted out during timeout
      }
    }
    lastActivityTime = now;
  }
  
  ["mousedown", "keydown", "touchstart", "scroll"].forEach(eventType => {
    window.addEventListener(eventType, refreshSession, { passive: true });
  });
  
  function trackPageView() {
    if (!sessionId) {
      log('No session ID (possibly opted out or not initialized). Exiting trackPageView.');
      return;
    }
    
    refreshSession(); // Ensure session is active and ID is current
    if (!sessionId) { // Re-check after refresh, in case opt-out happened
        log('Session ID became null after refresh (e.g. opt-out). Exiting trackPageView.');
        return;
    }
    
    const searchParams = new URLSearchParams(window.location.search);
    const payload = {
      v: SCRIPT_VERSION,
      type: "pageview",
      domain: location.hostname,
      url: location.href, // Full URL
      path: location.pathname, // Path only
      ref: document.referrer || null, // Referrer
      us: searchParams.get('utm_source'),    // utm_source
      um: searchParams.get('utm_medium'),   // utm_medium
      uc: searchParams.get('utm_campaign'), // utm_campaign
      ut: searchParams.get('utm_term'),     // utm_term
      ue: searchParams.get('utm_content'),  // utm_content (ue for 'element' or 'extra')
      sid: sessionId,
      ts: Date.now()
    };
    log('Payload to send:', payload);
    sendPayload(payload);
  }
  
  function sendPayload(data) {
    const jsonData = JSON.stringify(data);
    log('Attempting to send payload. Size:', jsonData.length, 'bytes');
    
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonData,
      keepalive: true // Important for requests that might outlive the page
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => {
          errorLog(`HTTP error ${response.status}. Server response: ${text}`);
        }).catch(() => {
          errorLog(`HTTP error ${response.status}. Could not retrieve server response.`);
        });
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json().catch(() => ({})); // Handle cases where response might not be JSON
    })
    .then(responseData => log('Fetch response:', responseData))
    .catch(error => {
      errorLog('Fetch error:', error.message, 'Falling back.');
      if (navigator.sendBeacon) {
        try {
          log('Using navigator.sendBeacon.');
          if (navigator.sendBeacon(ENDPOINT, jsonData)) {
            log('sendBeacon call successful (queued).');
            return;
          } else {
            warnLog('sendBeacon call returned false (not queued). Falling back to image.');
          }
        } catch (beaconError) {
          errorLog('sendBeacon error. Falling back to image.', beaconError);
        }
      } else {
        log('navigator.sendBeacon not available. Using image fallback.');
      }
      
      const img = new Image();
      img.onload = () => log('Image fallback: request likely sent (onload).');
      img.onerror = () => errorLog('Image fallback: request error (onerror).');
      const getParam = "?d=" + encodeURIComponent(jsonData);
      if ((ENDPOINT + getParam).length > 2048) { // Common URL length limit
          warnLog("Data for image beacon is too long, might be truncated.", (ENDPOINT + getParam).length, "chars");
      }
      img.src = ENDPOINT + getParam;
      log('Image fallback src (truncated):', img.src.substring(0, 200) + (img.src.length > 200 ? '...' : ''));
    });
  }
  
  function handleNavigationChange() {
    if (currentUrl !== location.href) {
      log('Navigation detected. Old URL:', currentUrl, 'New URL:', location.href);
      currentUrl = location.href;
      // Delay slightly to allow SPA routers to update document.title, etc.
      setTimeout(trackPageView, 150); 
    }
  }
  
  function initializeAnalytics() {
    log('Initializing analytics interface...');
    window.insightAnalytics = {
      optOut: function() {
        localStorage.setItem(OPT_OUT_KEY, '1');
        sessionStorage.removeItem(SESSION_ID_KEY);
        sessionId = null;
        log('Opted out. Tracking disabled.');
        return "Analytics tracking disabled.";
      },
      optIn: function() {
        localStorage.removeItem(OPT_OUT_KEY);
        log('Opted in. Re-initializing session and tracking.');
        sessionId = getSessionId(); // This will create/retrieve a session ID
        if (sessionId) {
          trackPageView(); // Track current page immediately on opt-in
        } else {
          log('Could not obtain session ID after opt-in.');
        }
        return "Analytics tracking enabled.";
      },
      isOptedOut: function() {
        return !!localStorage.getItem(OPT_OUT_KEY);
      }
    };
    
    if (!window.insightAnalytics.isOptedOut()) {
      log('Initial trackPageView call.');
      trackPageView(); // Initial page view
      
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function() {
        originalPushState.apply(this, arguments);
        handleNavigationChange();
      };
      
      history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        handleNavigationChange();
      };
      
      window.addEventListener('popstate', handleNavigationChange);
      
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          log('Tab became visible, refreshing session.');
          refreshSession();
        }
      });
    } else {
      log('User is opted out. No initial pageview track.');
    }
  }
  
  // Wait for DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAnalytics);
  } else {
    initializeAnalytics(); // DOMContentLoaded has already fired
  }
  log('Script Fully Initialized.');
})();
</script>
