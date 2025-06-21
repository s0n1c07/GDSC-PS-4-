let currentUser = null;
let webSocket = null;
const tabTimers = new Map();
const visitedUrls = new Set();
const VISIT_DELAY = 15000; // 15 seconds
const API_BASE_URL = "http://localhost:3000/api";

async function initialize() {
  const { urlNexusUser } = await chrome.storage.local.get("urlNexusUser");
  if (urlNexusUser) startSession(urlNexusUser);
}

function startSession(userData) {
  if (currentUser?.userId === userData.userId) return;
  console.log("URL Nexus: Session started for", userData.username);
  currentUser = userData;
  connectWebSocket();
}

function endSession() {
  if (!currentUser) return;
  console.log("URL Nexus: Session ended.");
  currentUser = null;
  if (webSocket) webSocket.close();
  visitedUrls.clear();
  tabTimers.forEach((timer) => clearTimeout(timer));
  tabTimers.clear();
}

function connectWebSocket() {
  if (!currentUser || (webSocket && webSocket.readyState < 2)) return;
  webSocket = new WebSocket("ws://localhost:3000");
  webSocket.onopen = () =>
    webSocket.send(
      JSON.stringify({ type: "register", userId: currentUser.userId })
    );
  webSocket.onmessage = (event) => {
    /* Optional: Handle messages from server */
  };
  webSocket.onclose = () => {
    if (currentUser) setTimeout(connectWebSocket, 5000);
  };
}

function isValidUrl(url) {
  if (!url || !url.startsWith("http")) return false;
  // Exclude common non-article pages and social media homepages
  const exclude = [
    "google.com/search",
    "amazon.com/s",
    "youtube.com",
    "facebook.com",
    "twitter.com",
    "instagram.com",
  ];
  return !exclude.some((pattern) => url.includes(pattern));
}

async function processUrlForTab(tabId, url) {
  if (visitedUrls.has(url)) return;
  console.log(`URL Nexus: 15s timer elapsed. Processing ${url}`);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content_script.js"],
    });

    if (chrome.runtime.lastError || !results || results.length === 0) {
      console.warn(
        "URL Nexus: Could not inject script into tab.",
        chrome.runtime.lastError?.message
      );
      return;
    }

    // After injecting, send message to trigger content extraction
    const content = await chrome.tabs.sendMessage(tabId, {
      type: "extractContent",
    });

    if (!content) {
      console.log("URL Nexus: No meaningful content extracted. Skipping.");
      return;
    }

    // If we got content, mark URL as processed and send to backend
    visitedUrls.add(url);
    sendToBackend(content, url);
  } catch (error) {
    console.warn(
      `URL Nexus: Failed to process tab ${tabId}. It might be a protected page (e.g., Chrome Web Store).`,
      error
    );
  }
}

async function sendToBackend(content, url) {
  if (!currentUser) return;
  try {
    const body = {
      url: url,
      title: content.title, // Send the extracted title
      text: content.text, // Send the full text for the backend to summarize
    };
    await fetch(`${API_BASE_URL}/process-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify(body),
    });
    console.log("URL Nexus: Sent content to backend for:", content.title);
  } catch (error) {
    console.error("URL Nexus: Failed to send data to backend.", error);
    visitedUrls.delete(url); // Allow retry if sending failed
  }
}

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.urlNexusUser)
    changes.urlNexusUser.newValue
      ? startSession(changes.urlNexusUser.newValue)
      : endSession();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabTimers.has(tabId)) clearTimeout(tabTimers.get(tabId));
  if (currentUser && changeInfo.status === "complete" && isValidUrl(tab.url)) {
    const timer = setTimeout(
      () => processUrlForTab(tabId, tab.url),
      VISIT_DELAY
    );
    tabTimers.set(tabId, timer);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabTimers.has(tabId)) clearTimeout(tabTimers.get(tabId));
  tabTimers.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getStats") {
    sendResponse({ processedCount: visitedUrls.size, isActive: !!currentUser });
  }
  return true;
});
