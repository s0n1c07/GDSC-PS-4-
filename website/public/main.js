// --- START OF FILE public/main.js ---
document.addEventListener("DOMContentLoaded", () => {
  let currentUser = null;
  let socket = null;
  const API_BASE_URL = "http://localhost:3000/api";

  // --- INITIALIZATION ---
  function initializeApp() {
    setupEventListeners();
    const token = localStorage.getItem("authToken");
    const userData = localStorage.getItem("userData");
    if (token && userData) {
      currentUser = JSON.parse(userData);
      showSection("profile");
      updateNav();
      setupWebSocket();
      loadUserItems(currentUser.userId);
    } else {
      showSection("home");
      updateNav();
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchAuthTab(tab.dataset.tab));
    });
    document
      .getElementById("login-form")
      .addEventListener("submit", handleLogin);
    document
      .getElementById("register-form")
      .addEventListener("submit", handleRegister);
    document
      .querySelectorAll(".nav-links a, .cta-buttons a")
      .forEach((link) => {
        link.addEventListener("click", (e) => {
          const href = link.getAttribute("href");
          if (href.startsWith("#")) {
            e.preventDefault();
            const sectionId = href.substring(1);
            if (sectionId === "logout") handleLogout();
            else showSection(sectionId);
          }
        });
      });
  }

  // --- UI & NAVIGATION ---
  function showSection(sectionId) {
    if (!currentUser && (sectionId === "profile" || sectionId === "discover")) {
      sectionId = "auth";
    }
    document.querySelectorAll(".page-section").forEach((section) => {
      section.style.display = section.id === sectionId ? "block" : "none";
    });
    if (sectionId === "discover") loadDiscoverUsers();
  }

  function updateNav() {
    const loggedInLinks = document.querySelectorAll(
      'a[href="#profile"], a[href="#discover"], a.logout-btn'
    );
    const getStartedBtn = document.querySelector('a[href="#auth"]');
    if (currentUser) {
      loggedInLinks.forEach((link) => {
        link.style.display = "inline-flex";
      });
      if (getStartedBtn) getStartedBtn.style.display = "none";
    } else {
      loggedInLinks.forEach((link) => {
        link.style.display = "none";
      });
      if (getStartedBtn) getStartedBtn.style.display = "inline-flex";
    }
  }

  function switchAuthTab(tabType) {
    document
      .querySelectorAll(".auth-tab")
      .forEach((tab) => tab.classList.remove("active"));
    document.querySelector(`[data-tab="${tabType}"]`).classList.add("active");
    document
      .querySelectorAll(".auth-form")
      .forEach((form) => (form.style.display = "none"));
    document.getElementById(`${tabType}-form`).style.display = "block";
  }

  function showAlert(message, type = "error") {
    const container = document.getElementById("alert-container");
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }

  // --- API & DATA HANDLING ---
  async function handleLogin(e) {
    e.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(e.target));
    try {
      const response = await fetch(`${API_BASE_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      localStorage.setItem("authToken", data.token);
      localStorage.setItem(
        "userData",
        JSON.stringify({ userId: data.userId, username: data.username })
      );
      currentUser = { userId: data.userId, username: data.username };
      initializeApp();
    } catch (error) {
      showAlert(error.message || "Login failed.");
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(e.target));
    try {
      const response = await fetch(`${API_BASE_URL}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      showAlert("Registration successful! Please login.", "success");
      switchAuthTab("login");
    } catch (error) {
      showAlert(error.message || "Registration failed.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
    currentUser = null;
    if (socket) socket.close();
    initializeApp();
  }

  async function loadUserItems(userId) {
    const itemsContainer = document.getElementById("items-container");
    itemsContainer.innerHTML = "";
    document.getElementById(
      "profile-username"
    ).textContent = `${currentUser.username}'s Dashboard`;
    const response = await fetch(`${API_BASE_URL}/users/${userId}/items`);
    const items = await response.json();
    items.forEach((item) =>
      itemsContainer.appendChild(createItemCard(item, true))
    );
  }

  async function loadDiscoverUsers() {
    const usersContainer = document.getElementById("users-container");
    usersContainer.innerHTML = "";
    const response = await fetch(`${API_BASE_URL}/users`);
    const users = await response.json();
    users.forEach((user) => {
      const userCard = document.createElement("div");
      userCard.className = "user-card";
      userCard.innerHTML = `<div class="user-avatar">${user.username
        .charAt(0)
        .toUpperCase()}</div><h3><a href="#">${user.username}</a></h3>`;
      usersContainer.appendChild(userCard);
    });
  }

  // --- WEBSOCKET & REAL-TIME UPDATES ---
  function setupWebSocket() {
    if (!currentUser || (socket && socket.readyState < 2)) return;
    socket = new WebSocket("ws://localhost:3000");
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ type: "register", userId: currentUser.userId })
      );
    socket.onmessage = (event) =>
      handleWebSocketMessage(JSON.parse(event.data));
    socket.onclose = () => {
      console.log("WebSocket closed.");
      socket = null;
    };
  }

  function handleWebSocketMessage(message) {
    if (message.type === "status_update") {
      updateLLMStatus(message.isProcessing);
      return;
    }
    let card = document.querySelector(
      `.item-card[data-url="${message.data.url}"]`
    );
    if (!card && message.type === "queued") {
      card = createItemCard(message.data);
      document.getElementById("items-container").prepend(card);
    }
    if (card) updateItemCard(card, message.type, message.data);
  }

  function createItemCard(data, isComplete = false) {
    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.url = data.url;
    card.innerHTML = `
            <h3><a href="${data.url}" target="_blank">${
      data.title || data.url
    }</a></h3>
            <div class="processing-status" style="${
              isComplete ? "display: none;" : ""
            }">
                <div class="spinner-container" style="display: none;"><div class="spinner"></div><div class="spinner-percent">0%</div></div>
                <p class="item-status-text">In queue...</p>
            </div>
            <div class="summary" style="${isComplete ? "" : "display: none;"}">
                <strong>Summary:</strong><p class="summary-text-content">${
                  data.extracted_summary || ""
                }</p>
            </div>
            <p class="meta">${
              isComplete
                ? `Saved on: ${new Date(data.created_at).toLocaleString()}`
                : "Processing now..."
            }</p>`;
    return card;
  }

  function updateItemCard(card, type, data) {
    const statusContainer = card.querySelector(".processing-status"),
      statusText = card.querySelector(".item-status-text"),
      spinnerContainer = card.querySelector(".spinner-container"),
      summaryBlock = card.querySelector(".summary"),
      summaryContent = card.querySelector(".summary-text-content"),
      titleLink = card.querySelector("h3 a"),
      metaText = card.querySelector(".meta");
    if (type === "title_updated") titleLink.textContent = data.title;
    if (type === "progress") {
      statusContainer.style.display = "flex";
      summaryBlock.style.display = "none";
      spinnerContainer.style.display = "block";
      statusText.textContent = "Summarizing...";
      updateSpinner(card, data.percentage);
    } else if (type === "complete") {
      statusContainer.style.display = "none";
      summaryContent.textContent = data.summary;
      summaryBlock.style.display = "block";
      metaText.textContent = `Saved on: ${new Date().toLocaleString()}`;
    } else if (type === "error") {
      spinnerContainer.style.display = "none";
      statusText.textContent = `Error: ${data.message}`;
      statusText.style.color = "var(--danger-color)";
    }
  }

  function updateSpinner(card, percentage) {
    const spinner = card.querySelector(".spinner"),
      percentText = card.querySelector(".spinner-percent");
    spinner.style.background = `conic-gradient(var(--success-color) ${percentage}%, var(--border-color) 0%)`;
    percentText.textContent = `${percentage}%`;
  }

  function updateLLMStatus(isProcessing) {
    const indicator = document.getElementById("llm-status"),
      text = document.getElementById("llm-status-text");
    if (isProcessing) {
      indicator.classList.add("active");
      text.textContent = "AI Active";
    } else {
      indicator.classList.remove("active");
      text.textContent = "AI Idle";
    }
  }

  // --- Start the App ---
  initializeApp();
});
