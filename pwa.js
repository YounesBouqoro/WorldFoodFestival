(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferredPrompt = null;
  let registration = null;
  let refreshing = false;

  function installButtons() {
    return [...document.querySelectorAll('[data-install-app]')];
  }

  function refreshButtons() {
    return [...document.querySelectorAll('[data-app-refresh]')];
  }

  function updateInstallUi() {
    installButtons().forEach(button => {
      button.classList.toggle('hidden', standalone || document.body.classList.contains('pwa-installed'));
      if (!standalone) button.disabled = false;
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

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      updateInstallUi();
      return;
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (ios) {
      window.alert('Auf iPhone/iPad: In Safari auf Teilen tippen und „Zum Home-Bildschirm“ wählen.');
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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => { registration = reg; })
      .catch(error => console.warn('Service worker registration failed', error));
  }

  updateInstallUi();
})();