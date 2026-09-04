(() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isSafari = isIOS && /Safari/i.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(ua);
  const appStartUrl = new URL('./index.html', document.baseURI).href;
  let deferredPrompt = null;
  let registration = null;
  let refreshing = false;
  let iosSheet = null;

  function installButtons() {
    return [...document.querySelectorAll('[data-install-app]')];
  }

  function refreshButtons() {
    return [...document.querySelectorAll('[data-app-refresh]')];
  }

  function updateInstallUi() {
    installButtons().forEach(button => {
      button.classList.toggle('hidden', standalone || document.body.classList.contains('pwa-installed'));
      button.disabled = standalone;
      if (isIOS && !standalone) button.textContent = 'App hinzufügen';
    });
  }

  function setRefreshBusy(busy) {
    refreshing = busy;
    refreshButtons().forEach(button => {
      if (!button.dataset.refreshLabel) button.dataset.refreshLabel = button.textContent.trim();
      button.disabled = busy;
      button.classList.toggle('is-refreshing', busy);
      button.setAttribute('aria-busy', String(busy));
      if (!button.classList.contains('app-refresh-icon')) {
        button.textContent = busy ? 'Aktualisiere…' : button.dataset.refreshLabel;
      }
    });
  }

  function closeIOSInstallSheet() {
    if (iosSheet) iosSheet.classList.add('hidden');
    document.body.classList.remove('ios-install-open');
  }

  function showSafariShareHint() {
    document.querySelector('.ios-safari-share-hint')?.remove();
    const hint = document.createElement('div');
    hint.className = 'ios-safari-share-hint';
    hint.innerHTML = '<strong>Jetzt Safari-Teilen antippen</strong><span>Danach „Zum Home-Bildschirm“ wählen.</span><i aria-hidden="true">↓</i>';
    document.body.appendChild(hint);
    setTimeout(() => hint.classList.add('show'), 20);
    setTimeout(() => {
      hint.classList.remove('show');
      setTimeout(() => hint.remove(), 250);
    }, 6500);
  }

  function ensureIOSInstallSheet() {
    if (iosSheet) return iosSheet;

    iosSheet = document.createElement('div');
    iosSheet.className = 'ios-install-sheet hidden';
    iosSheet.setAttribute('role', 'dialog');
    iosSheet.setAttribute('aria-modal', 'true');
    iosSheet.setAttribute('aria-labelledby', 'iosInstallTitle');

    const primaryLabel = isSafari ? 'Safari-Teilen anzeigen' : 'Link für Safari kopieren';
    const footnote = isSafari
      ? 'Apple installiert Web-Apps auf dem iPhone über das native Safari-Teilen-Menü.'
      : 'Du bist gerade nicht direkt in Safari. Link kopieren, in Safari öffnen und dort erneut „App hinzufügen“ wählen.';

    iosSheet.innerHTML =
      '<button class="ios-install-backdrop" type="button" data-ios-install-close aria-label="Schließen"></button>' +
      '<section class="ios-install-card">' +
        '<div class="ios-install-handle" aria-hidden="true"></div>' +
        '<div class="ios-install-head">' +
          '<div><span>IPHONE APP</span><h2 id="iosInstallTitle">WFF Kasse hinzufügen</h2></div>' +
          '<button type="button" data-ios-install-close aria-label="Schließen">×</button>' +
        '</div>' +
        '<p class="ios-install-lead">Auf dem iPhone wird die Kasse über das Safari-Teilen-Menü zum Home-Bildschirm hinzugefügt.</p>' +
        '<ol class="ios-install-steps">' +
          '<li><strong>Safari-Teilen antippen</strong><span>Nutze den Teilen-Button in der Safari-Leiste – nicht einen Button innerhalb der Webseite.</span></li>' +
          '<li><strong>„Zum Home-Bildschirm“ wählen</strong><span>Falls der Punkt nicht sichtbar ist: im Teilen-Menü nach unten scrollen bzw. „Aktionen bearbeiten“ öffnen.</span></li>' +
          '<li><strong>„Als Web-App öffnen“ aktiviert lassen</strong><span>Dann oben rechts auf „Hinzufügen“ tippen.</span></li>' +
        '</ol>' +
        '<button class="ios-share-button" type="button" data-ios-share>' + primaryLabel + '</button>' +
        '<button class="ios-copy-button" type="button" data-ios-copy>Link kopieren</button>' +
        '<small>' + footnote + '</small>' +
      '</section>';

    document.body.appendChild(iosSheet);

    iosSheet.querySelectorAll('[data-ios-install-close]').forEach(button => {
      button.addEventListener('click', closeIOSInstallSheet);
    });

    iosSheet.querySelector('[data-ios-share]').addEventListener('click', async () => {
      if (isSafari) {
        closeIOSInstallSheet();
        showSafariShareHint();
        return;
      }

      try {
        await navigator.clipboard.writeText(appStartUrl);
        const button = iosSheet.querySelector('[data-ios-share]');
        const old = button.textContent;
        button.textContent = 'Kopiert ✓ · jetzt in Safari öffnen';
        setTimeout(() => { button.textContent = old; }, 2600);
      } catch {
        window.prompt('Diesen Link in Safari öffnen:', appStartUrl);
      }
    });

    iosSheet.querySelector('[data-ios-copy]').addEventListener('click', async event => {
      try {
        await navigator.clipboard.writeText(appStartUrl);
        const old = event.currentTarget.textContent;
        event.currentTarget.textContent = 'Kopiert ✓';
        setTimeout(() => { event.currentTarget.textContent = old; }, 1800);
      } catch {
        window.prompt('Diesen Link kopieren:', appStartUrl);
      }
    });

    return iosSheet;
  }

  function openIOSInstallSheet() {
    const sheet = ensureIOSInstallSheet();
    sheet.classList.remove('hidden');
    document.body.classList.add('ios-install-open');
    setTimeout(() => sheet.querySelector('[data-ios-share]')?.focus({ preventScroll: true }), 30);
  }

  async function install() {
    if (standalone) return;

    if (isIOS) {
      openIOSInstallSheet();
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      updateInstallUi();
      return;
    }

    window.alert('Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.');
  }

  function waitForWorker(worker, timeout = 5000) {
    if (!worker || worker.state === 'activated' || worker.state === 'installed') return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' || worker.state === 'installed' || worker.state === 'redundant') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  async function refreshCache(reg) {
    const worker = reg?.active || reg?.waiting || navigator.serviceWorker.controller;
    if (!worker) return;

    await new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(resolve, 7000);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve();
      };
      try {
        worker.postMessage({ type: 'REFRESH_APP_CACHE' }, [channel.port2]);
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  async function refreshApp() {
    if (refreshing) return;

    if (window.WFFPOS?.hasOpenOrder?.()) {
      window.WFFPOS.openCheckout?.();
      window.WFFPOS.flash?.('Offene Bestellung zuerst abschließen oder stornieren.');
      return;
    }

    if (!navigator.onLine) {
      const message = 'Für ein App-Update brauchst du kurz eine Internetverbindung. Deine offline gespeicherten Kassendaten bleiben erhalten.';
      if (window.WFFPOS?.flash) window.WFFPOS.flash(message);
      else window.alert(message);
      return;
    }

    setRefreshBusy(true);

    try {
      if ('serviceWorker' in navigator) {
        registration = registration || await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.register('./sw.js');
        await registration.update();

        if (registration.installing) await waitForWorker(registration.installing);

        if (registration.waiting) {
          try { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch {}
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        registration = await navigator.serviceWorker.getRegistration('./') || registration;
        await refreshCache(registration);
      }

      try {
        await fetch(location.href, { cache: 'reload', credentials: 'same-origin' });
      } catch {}

      location.reload();
    } catch (error) {
      console.warn('App refresh failed', error);
      setRefreshBusy(false);
      const message = 'Aktualisierung konnte gerade nicht abgeschlossen werden. Bitte erneut versuchen.';
      if (window.WFFPOS?.flash) window.WFFPOS.flash(message);
      else window.alert(message);
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    document.body.classList.add('pwa-installed');
    deferredPrompt = null;
    updateInstallUi();
  });

  document.addEventListener('click', event => {
    const installButton = event.target.closest('[data-install-app]');
    if (installButton) {
      install();
      return;
    }

    const refreshButton = event.target.closest('[data-app-refresh]');
    if (refreshButton) refreshApp();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && iosSheet && !iosSheet.classList.contains('hidden')) closeIOSInstallSheet();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => { registration = reg; })
      .catch(error => console.warn('Service worker registration failed', error));
  }

  updateInstallUi();
})();