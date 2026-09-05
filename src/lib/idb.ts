// IndexedDB Helper v2 for Agendaku PWA & Service Worker
// Stores: 'reminders', 'occurrences', 'offline_queue', 'app_state'

const DB_NAME = 'agendaku_pwa_db';
const DB_VERSION = 2;

export interface IDBReminder {
  id: string;
  user_id?: string;
  title: string;
  body?: string;
  time: string; // HH:mm format
  timezone: string;
  frequency: 'once' | 'daily' | 'weekdays' | 'weekly';
  daysOfWeek?: number[];
  sound?: string;
  isActive: boolean;
  deliveryMode?: 'hybrid' | 'server' | 'local';
  createdAt: string;
  updatedAt?: string;
}

export interface IDBOccurrence {
  id: string;
  reminderId: string;
  user_id?: string;
  scheduledAt: string; // ISO string UTC
  status: 'scheduled' | 'processing' | 'sent' | 'snoozed' | 'completed' | 'dismissed' | 'cancelled' | 'failed';
  snoozedUntil?: string;
  sentAt?: string;
  completedAt?: string;
  dismissedAt?: string;
  notificationTag: string; // reminder-{reminderId}-occurrence-{occurrenceId}
  createdAt: string;
  updatedAt?: string;
}

export interface IDBOfflineQueueItem {
  id: string;
  type: 'CREATE_REMINDER' | 'UPDATE_REMINDER' | 'DELETE_REMINDER' | 'SNOOZE_OCCURRENCE' | 'COMPLETE_OCCURRENCE' | 'DISMISS_OCCURRENCE';
  payload: any;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      if (!db.objectStoreNames.contains('reminders')) {
        db.createObjectStore('reminders', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('occurrences')) {
        const occStore = db.createObjectStore('occurrences', { keyPath: 'id' });
        occStore.createIndex('reminderId', 'reminderId', { unique: false });
        occStore.createIndex('status', 'status', { unique: false });
        occStore.createIndex('scheduledAt', 'scheduledAt', { unique: false });
      } else {
        const occStore = event.target.transaction.objectStore('occurrences');
        if (!occStore.indexNames.contains('reminderId')) {
          occStore.createIndex('reminderId', 'reminderId', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('app_state')) {
        db.createObjectStore('app_state', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==========================================
// REMINDERS OPERATIONAL API
// ==========================================

export async function saveRemindersToIDB(reminders: IDBReminder[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('reminders', 'readwrite');
    const store = tx.objectStore('reminders');
    store.clear();
    for (const item of reminders) {
      store.put(item);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] saveRemindersToIDB error:', e);
  }
}

export async function getRemindersFromIDB(): Promise<IDBReminder[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('reminders', 'readonly');
    const store = tx.objectStore('reminders');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[IDB] getRemindersFromIDB error:', e);
    return [];
  }
}

export async function updateSingleReminderInIDB(reminder: IDBReminder): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('reminders', 'readwrite');
    const store = tx.objectStore('reminders');
    store.put(reminder);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] updateSingleReminderInIDB error:', e);
  }
}

export async function deleteReminderFromIDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(['reminders', 'occurrences'], 'readwrite');
    tx.objectStore('reminders').delete(id);
    
    // Also delete occurrences of this reminder
    const occStore = tx.objectStore('occurrences');
    const index = occStore.index('reminderId');
    const req = index.getAllKeys(id);
    req.onsuccess = () => {
      const keys = req.result;
      keys.forEach(k => occStore.delete(k));
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] deleteReminderFromIDB error:', e);
  }
}

// ==========================================
// OCCURRENCES OPERATIONAL API
// ==========================================

export async function saveOccurrencesToIDB(occurrences: IDBOccurrence[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('occurrences', 'readwrite');
    const store = tx.objectStore('occurrences');
    for (const item of occurrences) {
      store.put(item);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] saveOccurrencesToIDB error:', e);
  }
}

export async function getOccurrencesFromIDB(): Promise<IDBOccurrence[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('occurrences', 'readonly');
    const store = tx.objectStore('occurrences');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[IDB] getOccurrencesFromIDB error:', e);
    return [];
  }
}

export async function updateOccurrenceInIDB(occ: IDBOccurrence): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('occurrences', 'readwrite');
    const store = tx.objectStore('occurrences');
    store.put(occ);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] updateOccurrenceInIDB error:', e);
  }
}

// ==========================================
// OFFLINE QUEUE OPERATIONAL API
// ==========================================

export async function addToOfflineQueue(item: Omit<IDBOfflineQueueItem, 'id' | 'createdAt'>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    const fullItem: IDBOfflineQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: Date.now(),
    };
    store.put(fullItem);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] addToOfflineQueue error:', e);
  }
}

export async function getOfflineQueue(): Promise<IDBOfflineQueueItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('offline_queue', 'readonly');
    const store = tx.objectStore('offline_queue');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[IDB] getOfflineQueue error:', e);
    return [];
  }
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] removeFromOfflineQueue error:', e);
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[IDB] clearOfflineQueue error:', e);
  }
}
