document.addEventListener('DOMContentLoaded', () => {
  // --- ELEMENT SELECTORS ---
  const API_BASE_URL = 'http://localhost:3000/api';
  const authView = document.getElementById('auth-view');
  const mainView = document.getElementById('main-view');
  const authForm = document.getElementById('auth-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const authMessage = document.getElementById('auth-message');
  const usernameDisplay = document.getElementById('username-display');
  const logoutBtn = document.getElementById('logout-btn');
  const viewDashboardBtn = document.getElementById('view-dashboard-btn');
  const processedCountEl = document.getElementById('processed-count');
  const statusIndicatorEl = document.getElementById('status-indicator');

  // --- UI FUNCTIONS ---
  const showMainView = (user) => {
    authView.style.display = 'none';
    mainView.style.display = 'block';
    usernameDisplay.textContent = user.username;
    updateStats(); // Initial update
  };

  const showAuthView = () => {
    authView.style.display = 'block';
    mainView.style.display = 'none';
  };

  // --- CORE LOGIC ---
  const updateStats = async () => {
    try {
      // Check if the runtime is still connected before sending a message
      if (chrome.runtime?.id) {
        const stats = await chrome.runtime.sendMessage({ type: 'getStats' });
        if (stats) {
          processedCountEl.textContent = stats.processedCount;
          statusIndicatorEl.style.color = stats.isActive ? '#48bb78' : '#a0aec0'; // Green for active, Gray for inactive
        }
      }
    } catch (e) {
      // This catch block now handles the "message channel closed" error gracefully.
      // We can log it quietly or ignore it, but it won't be an "uncaught" error anymore.
      if (e.message.includes("Could not establish connection") || e.message.includes("Receiving end does not exist")) {
        console.log("Popup closed before background script could respond. This is normal.");
      } else {
        console.warn("Could not get stats from background script:", e.message);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return;
    authMessage.textContent = 'Logging in...';

    try {
      const res = await fetch(`${API_BASE_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      await chrome.storage.local.set({ urlNexusUser: data });
      showMainView(data);
    } catch (err) {
      authMessage.textContent = err.message || 'Connection error.';
    }
  };

  const handleLogout = () => {
    chrome.storage.local.remove('urlNexusUser');
    showAuthView();
  };

  const checkLoginState = async () => {
    const { urlNexusUser } = await chrome.storage.local.get('urlNexusUser');
    if (urlNexusUser && urlNexusUser.token) {
      showMainView(urlNexusUser);
    } else {
      showAuthView();
    }
  };

  // --- EVENT LISTENERS & INITIALIZATION ---
  authForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  viewDashboardBtn.addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:3000' }));

  checkLoginState();

  // Start polling for stats only when the main view is visible
  setInterval(() => {
    if (mainView.style.display !== 'none') {
      updateStats();
    }
  }, 3000);
});