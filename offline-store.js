(() => {
  const DB_NAME = 'wff-pos-offline';
  const DB_VERSION = 1;
  const CATALOG_STORE = 'catalog';
  const QUEUE_STORE = 'order_queue';
  const DEVICE_KEY = 'wff-device-id';

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CATALOG_STORE)) db.createObjectStore(CATALOG_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'client_order_id' });
          store.createIndex('created_at', 'created_at');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB failed'));
    });
  }

  async function tx(storeName, mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = work(store); } catch (error) { db.close(); reject(error); return; }
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('IndexedDB transaction failed')); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('IndexedDB transaction aborted')); };
    });
  }

  async function saveCatalog(catalog) {
    await tx(CATALOG_STORE, 'readwrite', store => store.put({ key: 'catalog', value: catalog, saved_at: new Date().toISOString() }));
    return catalog;
  }

  async function loadCatalog() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CATALOG_STORE, 'readonly');
      const request = transaction.objectStore(CATALOG_STORE).get('catalog');
      request.onsuccess = () => { db.close(); resolve(request.result?.value || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function enqueueOrder(payload, meta = {}) {
    const record = {
      client_order_id: payload.client_order_id,
      created_at: new Date().toISOString(),
      payload: { ...payload, synced_from_offline: true },
      meta,
      attempts: 0,
      last_error: null
    };
    await tx(QUEUE_STORE, 'readwrite', store => store.put(record));
    return record;
  }

  async function listPending() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readonly');
      const request = transaction.objectStore(QUEUE_STORE).getAll();
      request.onsuccess = () => {
        db.close();
        resolve((request.result || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function pendingCount() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readonly');
      const request = transaction.objectStore(QUEUE_STORE).count();
      request.onsuccess = () => { db.close(); resolve(request.result || 0); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function removePending(clientOrderId) {
    await tx(QUEUE_STORE, 'readwrite', store => store.delete(clientOrderId));
  }

  async function markError(clientOrderId, error) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const get = store.get(clientOrderId);
      get.onsuccess = () => {
        const record = get.result;
        if (record) {
          record.attempts = Number(record.attempts || 0) + 1;
          record.last_error = String(error?.message || error || 'Sync failed').slice(0, 500);
          record.last_attempt_at = new Date().toISOString();
          store.put(record);
        }
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }

  async function syncPending(submitter) {
    const items = await listPending();
    const results = [];
    for (const item of items) {
      try {
        const result = await submitter(item.payload, item);
        if (!result || result.error) {
          const error = result?.error || new Error('Sync failed');
          await markError(item.client_order_id, error);
          results.push({ id: item.client_order_id, ok: false, error });
          if (/session|device|stand/i.test(String(error?.message || ''))) break;
          continue;
        }
        await removePending(item.client_order_id);
        results.push({ id: item.client_order_id, ok: true, data: result.data });
      } catch (error) {
        await markError(item.client_order_id, error);
        results.push({ id: item.client_order_id, ok: false, error });
        break;
      }
    }
    return results;
  }

  async function requestPersistence() {
    try {
      if (navigator.storage?.persist) return await navigator.storage.persist();
    } catch {}
    return false;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('./sw.js'); } catch (error) { console.warn('Service worker registration failed', error); return null; }
  }

  window.WFFOffline = {
    uuid,
    getDeviceId,
    saveCatalog,
    loadCatalog,
    enqueueOrder,
    listPending,
    pendingCount,
    removePending,
    syncPending,
    requestPersistence,
    registerServiceWorker
  };
})();