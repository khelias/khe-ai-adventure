(function () {
  const script = document.currentScript;
  const token = script?.dataset.analyticsToken || '';
  const privacyUrl = script?.dataset.analyticsPrivacyUrl || '/privacy';
  const storageKey = 'khe.analyticsConsent.v1';
  const configured = token && !token.startsWith('__');

  function currentLocale() {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    const fromHtml = document.documentElement.lang;
    let fromStorage = '';
    try {
      fromStorage = window.localStorage.getItem('app_locale') || '';
    } catch {
      // Ignore storage errors.
    }

    const value = (fromUrl || fromStorage || fromHtml || 'en').toLowerCase();
    return value.startsWith('et') ? 'et' : 'en';
  }

  const copy = {
    en: {
      title: 'Analytics?',
      body: 'I use Cloudflare Web Analytics for aggregate stats. No ads, cookies, or cross-site tracking.',
      allow: 'Allow',
      deny: 'Decline',
      privacy: 'Privacy',
      savedAllowed: 'Analytics allowed.',
      savedDenied: 'Analytics declined.',
    },
    et: {
      title: 'Analüütika?',
      body: 'Kasutan Cloudflare Web Analyticsit koondstatistika jaoks. Ei reklaame, küpsiseid ega saitideülest jälitamist.',
      allow: 'Luba',
      deny: 'Keeldu',
      privacy: 'Privaatsus',
      savedAllowed: 'Analüütika lubatud.',
      savedDenied: 'Analüütika keelatud.',
    },
  };

  function currentCopy() {
    return copy[currentLocale()];
  }

  function localizedPrivacyUrl() {
    const locale = currentLocale();

    try {
      const url = new URL(privacyUrl, window.location.origin);
      url.searchParams.set('lang', locale);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return `/privacy?lang=${locale}`;
    }
  }

  function readChoice() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      return parsed && typeof parsed.value === 'string' ? parsed.value : null;
    } catch {
      return null;
    }
  }

  function writeChoice(value) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ value, updatedAt: new Date().toISOString() }));
    } catch {
      // If localStorage is blocked, apply the current page choice without persistence.
    }
  }

  function loadBeacon() {
    if (!configured || document.querySelector('script[data-cf-beacon]')) return;

    const beacon = document.createElement('script');
    beacon.defer = true;
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    document.head.appendChild(beacon);
  }

  function injectStyles() {
    if (document.getElementById('khe-analytics-consent-style')) return;

    const style = document.createElement('style');
    style.id = 'khe-analytics-consent-style';
    style.textContent = `
      .khe-analytics-consent {
        position: fixed;
        right: 0.75rem;
        bottom: 0.75rem;
        z-index: 10000;
        width: min(20.5rem, calc(100vw - 1.5rem));
        padding: 0.7rem;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(12,13,15,0.94);
        color: #fafafa;
        box-shadow: 0 10px 34px rgba(0,0,0,0.3);
        contain: content;
        font: 400 0.78rem/1.35 Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .khe-analytics-consent strong {
        display: block;
        margin-bottom: 0.24rem;
        color: #fafafa;
        font-size: 0.9rem;
        font-weight: 650;
      }
      .khe-analytics-consent p {
        margin: 0 0 0.56rem;
        color: #d1d5db;
      }
      .khe-analytics-consent a {
        color: #f3f4f6;
        white-space: nowrap;
      }
      .khe-analytics-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.4rem;
      }
      .khe-analytics-actions button {
        min-height: 2rem;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 8px;
        padding: 0 0.62rem;
        background: rgba(255,255,255,0.05);
        color: #fafafa;
        cursor: pointer;
        font: 650 0.76rem/1 Inter, system-ui, sans-serif;
      }
      .khe-analytics-actions button:disabled {
        cursor: default;
        opacity: 0.72;
      }
      .khe-analytics-status {
        min-height: 0;
        margin-top: 0.36rem;
        color: #a1a1aa;
        font-size: 0.72rem;
      }
      @media (max-width: 520px) {
        .khe-analytics-consent {
          right: 0.5rem;
          bottom: max(0.5rem, env(safe-area-inset-bottom));
          width: min(20.5rem, calc(100vw - 1rem));
          padding: 0.62rem;
        }
        .khe-analytics-consent p {
          max-width: 34ch;
        }
      }
      @media (max-width: 520px) {
        body.lab-atlas-v4 .khe-analytics-consent {
          position: static;
          width: auto;
          max-height: none;
          margin: 0.72rem;
          overflow: visible;
          padding: 0.56rem;
        }
        body.lab-atlas-v4 .khe-analytics-consent strong {
          font-size: 0.84rem;
        }
        body.lab-atlas-v4 .khe-analytics-consent p {
          margin-bottom: 0.44rem;
        }
        body.lab-atlas-v4 .khe-analytics-actions {
          gap: 0.36rem;
        }
        body.lab-atlas-v4 .khe-analytics-status {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeBanner() {
    document.querySelector('[data-analytics-consent-panel]')?.remove();
  }

  function showBanner() {
    if (!configured) return;
    injectStyles();
    closeBanner();

    const text = currentCopy();
    const panel = document.createElement('section');
    panel.className = 'khe-analytics-consent';
    panel.setAttribute('data-analytics-consent-panel', '');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', text.title);
    panel.innerHTML = `
      <strong>${text.title}</strong>
      <p>${text.body} <a href="${localizedPrivacyUrl()}">${text.privacy}</a>.</p>
      <div class="khe-analytics-actions">
        <button type="button" data-consent-choice="granted">${text.allow}</button>
        <button type="button" data-consent-choice="denied">${text.deny}</button>
      </div>
      <div class="khe-analytics-status" aria-live="polite"></div>
    `;

    panel.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const button = event.target.closest('[data-consent-choice]');
      if (!button) return;

      const choice = button.dataset.consentChoice;
      if (choice !== 'granted' && choice !== 'denied') return;

      writeChoice(choice);
      if (choice === 'granted') loadBeacon();
      panel.querySelectorAll('button').forEach((item) => {
        item.disabled = true;
      });
      panel.querySelector('.khe-analytics-status').textContent =
        choice === 'granted' ? text.savedAllowed : text.savedDenied;
      window.setTimeout(closeBanner, 180);
    });

    document.body.appendChild(panel);
  }

  function scheduleBanner() {
    const open = () => {
      if (!readChoice()) showBanner();
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(open, { timeout: 1200 });
      return;
    }

    window.setTimeout(open, 350);
  }

  function applyChoice() {
    const choice = readChoice();

    if (choice === 'granted') {
      loadBeacon();
      return;
    }

    if (!choice) {
      scheduleBanner();
    }
  }

  window.kheAnalyticsConsent = {
    show: showBanner,
    reset() {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors.
      }
      showBanner();
    },
  };

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-analytics-preferences]')) {
      showBanner();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyChoice, { once: true });
  } else {
    applyChoice();
  }
})();
