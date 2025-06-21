document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "http://localhost:3000/api";
  const authView = document.getElementById("auth-view"),
    mainView = document.getElementById("main-view"),
    authForm = document.getElementById("auth-form"),
    usernameInput = document.getElementById("username"),
    passwordInput = document.getElementById("password"),
    authMessage = document.getElementById("auth-message"),
    usernameDisplay = document.getElementById("username-display"),
    logoutBtn = document.getElementById("logout-btn"),
    viewDashboardBtn = document.getElementById("view-dashboard-btn"),
    processedCountEl = document.getElementById("processed-count"),
    statusIndicatorEl = document.getElementById("status-indicator");

  const checkLoginState = async () => {
    const { urlNexusUser } = await chrome.storage.local.get("urlNexusUser");
    if (urlNexusUser && urlNexusUser.token) showMainView(urlNexusUser);
    else showAuthView();
  };

  const showMainView = (user) => {
    authView.style.display = "none";
    mainView.style.display = "block";
    usernameDisplay.textContent = user.username;
    updateStats();
  };

  const showAuthView = () => {
    authView.style.display = "block";
    mainView.style.display = "none";
  };

  const updateStats = async () => {
    try {
      const stats = await chrome.runtime.sendMessage({ type: "getStats" });
      if (stats) {
        processedCountEl.textContent = stats.processedCount;
        statusIndicatorEl.style.color = stats.isActive ? "#48bb78" : "#a0aec0";
      }
    } catch (e) {
      console.warn("Could not get stats from inactive background script.");
    }
  };

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim(),
      password = passwordInput.value.trim();
    if (!username || !password) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      await chrome.storage.local.set({ urlNexusUser: data });
      showMainView(data);
    } catch (err) {
      authMessage.textContent = err.message || "Connection error.";
    }
  });

  logoutBtn.addEventListener("click", () => {
    chrome.storage.local.remove("urlNexusUser");
    showAuthView();
  });
  viewDashboardBtn.addEventListener("click", () =>
    chrome.tabs.create({ url: "http://localhost:3000/profile" })
  );

  checkLoginState();
  setInterval(() => {
    if (mainView.style.display !== "none") updateStats();
  }, 3000);
});
