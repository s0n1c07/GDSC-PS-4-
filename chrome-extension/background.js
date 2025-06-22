// --- START OF FILE background.js (Final, Structurally Correct Version) ---

// --- 1. Configuration & State Variables ---
const API_BASE_URL = "http://localhost:3000/api";
const VISIT_DELAY = 15000; // 15 seconds
let currentUser = null;
const tabTimers = new Map();
const visitedUrls = new Set();
let webSocket = null;

// --- 2. Function Definitions (All functions are defined here, BEFORE they are used) ---

function isValidUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  // Exclude our own website to prevent feedback loops
  if (url.startsWith('http://localhost:3000')) return false;

  // Exclude common non-article sites
  const exclude = ['google.com/search', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'amazon.com'];
  return !exclude.some(pattern => url.includes(pattern));
}

async function sendToBackend(content, url) {
  if (!currentUser) return;
  try {
    await fetch(`${API_BASE_URL}/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
      body: JSON.stringify({ url, title: content.title, text: content.text })
    });
    console.log("[BACKGROUND] Successfully sent content to backend:", content.title);
  } catch (error) {
    console.error("[BACKGROUND] Failed to send content to backend.", error);
    visitedUrls.delete(url); // Allow retry if sending failed
  }
}

async function processUrlForTab(tabId, url) {
  if (visitedUrls.has(url)) return;
  console.log(`[BACKGROUND] 15s timer finished for: ${url}. Processing...`);

  try {
    // We use scripting.executeScript to inject the file
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content_script.js']
    });

    // After injection, we send a message to the content script to get the text
    const content = await chrome.tabs.sendMessage(tabId, { type: 'extractContent' });

    if (!content || !content.text || content.text.length < 250) {
      console.log("[BACKGROUND] Content too short or null. Skipping.");
      return;
    }

    // If we get valid content, we mark the URL as processed and send it
    visitedUrls.add(url);
    sendToBackend(content, url);

  } catch (error) {
    console.warn(`[BACKGROUND] Failed to process tab ${tabId}. It might be a protected page or closed. Error:`, error.message);
  }
}

function startTimerForTab(tab) {
  if (!currentUser || !tab || !isValidUrl(tab.url)) {
    return;
  }

  // Clear any existing timer for this tab to handle quick navigations
  if (tabTimers.has(tab.id)) {
    clearTimeout(tabTimers.get(tab.id));
  }

  // Set a new timer
  const timerId = setTimeout(() => {
    processUrlForTab(tab.id, tab.url);
    tabTimers.delete(tab.id); // Clean up the finished timer
  }, VISIT_DELAY);

  tabTimers.set(tab.id, timerId);
}

function connectWebSocket() {
  if (!currentUser || (webSocket && webSocket.readyState < 2)) return;
  webSocket = new WebSocket('ws://localhost:3000');
  webSocket.onopen = () => webSocket.send(JSON.stringify({ type: 'register', userId: currentUser.userId }));
  webSocket.onmessage = (event) => { /* Handle server messages if needed in the future */ };
  webSocket.onclose = () => { if (currentUser) setTimeout(connectWebSocket, 5000); };
}

function startSession(userData) {
  if (currentUser?.userId === userData.userId) return;
  console.log("[BACKGROUND] Session started for", userData.username);
  currentUser = userData;
  connectWebSocket();
}

function endSession() {
  if (!currentUser) return;
  console.log("[BACKGROUND] Session ended.");
  currentUser = null;
  if (webSocket) webSocket.close();
  visitedUrls.clear();
  tabTimers.forEach(timer => clearTimeout(timer));
  tabTimers.clear();
}

async function initialize() {
  console.log('[BACKGROUND] Service worker initializing...');
  const { urlNexusUser } = await chrome.storage.local.get('urlNexusUser');
  if (urlNexusUser) {
    startSession(urlNexusUser);
  }
}

// --- 3. Event Listeners (Set up all listeners at the end of the file) ---

// Run initialize once when the extension is installed or the browser starts
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

// Listen for login/logout events from the popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.urlNexusUser) {
    if (changes.urlNexusUser.newValue) {
      startSession(changes.urlNexusUser.newValue);
    } else {
      endSession();
    }
  }
});

// Listen for tab focus changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError) {
      startTimerForTab(tab);
    }
  });
});

// Listen for when a tab finishes loading a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    startTimerForTab(tab);
  }
});

// Clean up timers when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabTimers.has(tabId)) {
    clearTimeout(tabTimers.get(tabId));
    tabTimers.delete(tabId);
  }
});

// Listen for messages from the popup (e.g., to get stats)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStats') {
    sendResponse({
      processedCount: visitedUrls.size,
      isActive: !!currentUser
    });
  }
  return true; // Keep message channel open for async response
});