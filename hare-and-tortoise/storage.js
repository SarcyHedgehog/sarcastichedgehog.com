(() => {
  'use strict';

  const DATABASE = 'sarcastic-hedgehog-hare-and-tortoise';
  const VERSION = 1;
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('layouts')) {
          const layouts = db.createObjectStore('layouts', { keyPath: 'id' });
          layouts.createIndex('updatedAt', 'updatedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Local save database is blocked by another tab.'));
    });
    return databasePromise;
  }

  async function request(storeName, mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = operation(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Local save transaction was cancelled.'));
    });
  }

  window.HareTortoiseStorage = {
    ready: openDatabase,
    async getState(key) {
      const record = await request('state', 'readonly', store => store.get(key));
      return record?.value;
    },
    setState(key, value) {
      return request('state', 'readwrite', store => store.put({ key, value }));
    },
    listLayouts() {
      return request('layouts', 'readonly', store => store.getAll()).then(records =>
        (records || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      );
    },
    putLayout(layout) {
      return request('layouts', 'readwrite', store => store.put(layout));
    },
    deleteLayout(id) {
      return request('layouts', 'readwrite', store => store.delete(id));
    },
    async requestPersistence() {
      if (!navigator.storage?.persist) return false;
      return navigator.storage.persist();
    }
  };
})();
