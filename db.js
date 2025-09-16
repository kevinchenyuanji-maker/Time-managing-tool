(function(){
  const DB_NAME = 'mvd';
  const DB_VERSION = 1;
  const SETTINGS_ID = 'default';

  const dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('by_date', 'date', { unique: false });
        sessionStore.createIndex('by_start', 'start', { unique: false });
      }
      if (!db.objectStoreNames.contains('ifthen')) {
        db.createObjectStore('ifthen', { keyPath: 'id' });
      }
    };
  });

  let migrationPromise = null;

  async function performMigration(){
    const legacyRaw = localStorage.getItem('mvd_data_v1');
    if (!legacyRaw) return;
    let legacy;
    try {
      legacy = JSON.parse(legacyRaw);
    } catch (err) {
      localStorage.removeItem('mvd_data_v1');
      return;
    }
    const db = await dbPromise;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['settings', 'days', 'sessions'], 'readwrite');
      tx.oncomplete = () => {
        localStorage.removeItem('mvd_data_v1');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      const settingsStore = tx.objectStore('settings');
      if (legacy) {
        const baseSettings = legacy.settings ? { ...legacy.settings } : {};
        if (legacy.day && legacy.day.date) {
          baseSettings.lastDayDate = legacy.day.date;
        }
        if (Object.keys(baseSettings).length > 0) {
          settingsStore.put({ id: SETTINGS_ID, ...baseSettings });
        }
      }
      const dayStore = tx.objectStore('days');
      const sessionStore = tx.objectStore('sessions');
      if (legacy && legacy.day) {
        const legacyDay = { ...legacy.day };
        dayStore.put(legacyDay);
        const sessions = Array.isArray(legacyDay.sessions) ? legacyDay.sessions : [];
        sessions.forEach(sess => {
          const record = { ...sess };
          if (!record.id) {
            record.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `legacy-${Date.now()}-${Math.random()}`;
          }
          if (!record.date) {
            record.date = legacyDay.date;
          }
          sessionStore.put(record);
        });
      }
    });
  }

  function ensureMigration(){
    if (!migrationPromise) {
      migrationPromise = performMigration().catch(err => {
        console.error('Migration failed', err);
      });
    }
    return migrationPromise;
  }

  async function getDay(date){
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('days', 'readonly');
      const store = tx.objectStore('days');
      const request = store.get(date);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function upsertDay(dayObj){
    if (!dayObj || !dayObj.date) {
      throw new Error('dayObj requires date');
    }
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('days', 'readwrite');
      const store = tx.objectStore('days');
      store.put(dayObj);
      tx.oncomplete = () => resolve(dayObj);
      tx.onerror = () => reject(tx.error);
    });
  }

  function ensureSessionId(session){
    if (!session.id) {
      session.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random()}`;
    }
    return session;
  }

  async function addSession(sessionObj){
    if (!sessionObj) throw new Error('sessionObj required');
    const record = ensureSessionId({ ...sessionObj });
    if (!record.date) {
      record.date = (record.start ? new Date(record.start) : new Date());
      if (record.date instanceof Date) {
        record.date = record.date.toISOString().slice(0, 10);
      }
    }
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSessionsInRange(startDate, endDate){
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const index = store.index('by_date');
      let range = null;
      if (startDate && endDate) {
        range = IDBKeyRange.bound(startDate, endDate);
      } else if (startDate) {
        range = IDBKeyRange.lowerBound(startDate);
      } else if (endDate) {
        range = IDBKeyRange.upperBound(endDate);
      }
      const sessions = [];
      const request = index.openCursor(range);
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          sessions.push(cursor.value);
          cursor.continue();
        } else {
          resolve(sessions);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getSettings(){
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(SETTINGS_ID);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        const { id, ...settings } = result;
        resolve(settings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function saveSettings(settingsObj){
    const db = await dbPromise;
    const record = { ...settingsObj, id: SETTINGS_ID };
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put(record);
      tx.oncomplete = () => resolve(settingsObj);
      tx.onerror = () => reject(tx.error);
    });
  }

  const DB = {
    ready: dbPromise,
    migrateFromLocalStorage: ensureMigration,
    getDay,
    upsertDay,
    addSession,
    getSessionsInRange,
    getSettings,
    saveSettings
  };

  DB.ready.then(() => ensureMigration());

  window.DB = DB;
})();
