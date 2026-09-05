// IndexedDB Database Helper for Agendaku PWA & Service Worker
const DB_NAME = 'agendaku_pwa_db';
const DB_VERSION = 1;

export interface IDBReminder {
  id: string;
  user_id?: string;
  title: string;
  body?: string;
  scheduledAt: string; // ISO string UTC
  timezone: string;
  status: 'scheduled' | 'sent' | 'snoozed' | 'completed' | 'dismissed' | 'cancelled';
  snoozedUntil?: string;
  time: string; // HH:mm for legacy display
  frequency: 'once' | 'daily' | 'weekdays' | 'weekly';
  daysOfWeek?: number[];
  sound?: string;
  notificationTag?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface IDBOfflineQueueItem {
  id: string;
  type: 'CREATE_REMINDER' | 'SNOOZE_REMINDER' | 'DISMISS_REMINDER' | 'DELETE_REMINDER';
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
        const reminderStore = db.createObjectStore('reminders', { keyPath: 'id' });
        reminderStore.createIndex('status', 'status', { unique: false });
        reminderStore.createIndex('scheduledAt', 'scheduledAt', { unique: false });
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
    console.error('IDB saveRemindersToIDB error:', e);
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
    console.error('IDB getRemindersFromIDB error:', e);
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
    console.error('IDB updateSingleReminderInIDB error:', e);
  }
}

export async function addToOfflineQueue(item: Omit<IDBOfflineQueueItem, 'id' | 'createdAt'>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    const fullItem: IDBOfflineQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };
    store.put(fullItem);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IDB addToOfflineQueue error:', e);
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
    console.error('IDB getOfflineQueue error:', e);
    return [];
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
    console.error('IDB clearOfflineQueue error:', e);
  }
}
