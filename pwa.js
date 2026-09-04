(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferredPrompt = null;

  function installButtons() {
    return [...document.querySelectorAll('[data-install-app]')];
  }

  function updateInstallUi() {
    const buttons = installButtons();
    buttons.forEach(button => {
      button.classList.toggle('hidden', standalone || document.body.classList.contains('pwa-installed'));
      if (!standalone) button.disabled = false;
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
    const button = event.target.closest('[data-install-app]');
    if (button) install();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
  }

  updateInstallUi();
})();