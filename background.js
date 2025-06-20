// background.js
const DB_NAME    = 'ContentSummarizerDB';
const STORE_NAME = 'content';

let db = null;

// Initialize IndexedDB
function initDB() {
  const req = indexedDB.open(DB_NAME, 1);
  req.onerror = () => console.error('❌ IndexedDB open failed', req.error);
  req.onsuccess = e => {
    db = e.target.result;
    console.log('✅ IndexedDB ready');
  };
  req.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      store.createIndex('timestamp', 'timestamp');
      store.createIndex('type', 'type');
      store.createIndex('tags', 'tags', { multiEntry: true });
    }
  };
}
initDB();

// Store or update a content item
function storeContent(item) {
  if (!db) return console.warn('⚠️ DB not ready yet');
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(item);
}

// Handle incoming messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'contentExtracted':
      // raw extraction from content script
      storeContent({ ...msg.data, processed: false, summary: '', tags: [] });
      sendResponse({ success: true });
      break;

    case 'storeProcessed':
      // update after popup generates summary/tags
      if (db) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.get(msg.data.url).onsuccess = e => {
          const rec = e.target.result || { url: msg.data.url };
          rec.summary   = msg.data.summary;
          rec.tags      = msg.data.tags;
          rec.processed = true;
          store.put(rec);
          sendResponse({ success: true });
        };
      } else {
        sendResponse({ success: false, error: 'DB not ready' });
      }
      return true; // keep channel open

    case 'getSummaries':
      if (!db) return sendResponse([]);
      const txR = db.transaction(STORE_NAME, 'readonly');
      const storeR = txR.objectStore(STORE_NAME);
      storeR.getAll().onsuccess = e => {
        const items = e.target.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);
        sendResponse(items);
      };
      return true;

    case 'getStatus':
      // popup uses this to know when it can call LlamaCpp
      sendResponse({ initialized: !!db, model: 'llama.cpp' });
      break;
  }
});
