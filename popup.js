// Popup interface controller
import { LlamaCpp } from "./llama-st/llama.js";
class PopupController {
  constructor() {
    this.engine = null;
    this.summaries = [];
    this.status = { initialized: false, model: "" };
    this.init();
  }

  async init() {
    this.setupEventListeners();

    // 1) Initialize the LLM engine
    try {
      this.engine = await LlamaCpp.create({
        wasmUrl: chrome.runtime.getURL("llama-st/llama.wasm"),
        modelUrl: chrome.runtime.getURL("llama-st/models/model.gguf"),
      });
      this.status = { initialized: true, model: "TinyLlama-GGUF" };

      this.status = { initialized: true, model: "phi-2-q4f16_1-MLC" };
    } catch (e) {
      console.error("LLM init failed", e);
      this.status = { initialized: false, model: "Error" };
    }
    this.updateStatusDisplay();

    // 2) Load any already‐summarized items
    await this.loadSummaries();

    // 3) Render the list and stats
    this.updateDisplay();
  }
  async generateSummary(text) {
    let result = "";
    await this.engine.run({
      prompt: `Summarize:\n\n${text}\n\nSummary:`,
      ctx_size: 2048,
      temp: 0.7,
      n_predict: 200,
      no_display_prompt: true,
      callback: chunk => { result += chunk; }
    });
    return result.trim();
  }
  
  setupEventListeners() {
    document.getElementById("refreshBtn").addEventListener("click", () => {
      this.refresh();
    });

    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.openSettings();
    });

    // Auto-refresh every 10 seconds
    setInterval(() => {
      this.loadSummaries();
    }, 10000);
  }

  async loadStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getStatus",
      });
      this.status = response;
      this.updateStatusDisplay();
    } catch (error) {
      console.error("Failed to load status:", error);
      this.status = { initialized: false, model: "Error" };
      this.updateStatusDisplay();
    }
  }

  async loadSummaries() {
    try {
      const summaries = await chrome.runtime.sendMessage({
        action: "getSummaries",
      });
      this.summaries = summaries || [];
      this.updateSummariesDisplay();
      this.updateStats();
    } catch (error) {
      console.error("Failed to load summaries:", error);
      this.showError("Failed to load summaries");
    }
  }

  updateStatusDisplay() {
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");

    if (this.status.initialized) {
      statusDot.className = "status-dot";
      statusText.textContent = `Ready • ${this.status.model}`;
    } else {
      statusDot.className = "status-dot loading";
      statusText.textContent = "Loading AI Model...";
    }
  }

  updateStats() {
    const totalCount = document.getElementById("totalCount");
    const todayCount = document.getElementById("todayCount");

    totalCount.textContent = this.summaries.length;

    // Count today's items
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayItems = this.summaries.filter(
      (item) => new Date(item.timestamp) >= today
    );
    todayCount.textContent = todayItems.length;
  }

  updateSummariesDisplay() {
    const itemsList = document.getElementById("itemsList");

    if (this.summaries.length === 0) {
      itemsList.innerHTML = this.getEmptyStateHTML();
      return;
    }

    const itemsHTML = this.summaries
      .slice(0, 10) // Show latest 10 items
      .map((item) => this.createItemHTML(item))
      .join("");

    itemsList.innerHTML = itemsHTML;

    // Add click handlers
    itemsList.querySelectorAll(".item").forEach((element, index) => {
      element.addEventListener("click", () => {
        this.openItem(this.summaries[index]);
      });
    });
  }

  createItemHTML(item) {
    const timeAgo = this.getTimeAgo(item.timestamp);
    const domain = this.getDomain(item.url);
    const summary = item.summary || "Processing...";
    const tags = item.tags || [];

    return `
      <div class="item">
        <div class="item-meta">
          <span class="item-type ${item.type}">${item.type}</span>
          <span>${timeAgo} • ${domain}</span>
        </div>
        <div class="item-title">${this.escapeHtml(item.title)}</div>
        <div class="item-summary">${this.escapeHtml(summary)}</div>
        ${
          tags.length > 0
            ? `
          <div class="item-tags">
            ${tags
              .slice(0, 3)
              .map((tag) => `<span class="tag">${this.escapeHtml(tag)}</span>`)
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  getEmptyStateHTML() {
    return `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <div>No content summaries yet</div>
        <div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">
          Browse some articles or videos to get started
        </div>
      </div>
    `;
  }

  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  getDomain(url) {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "Unknown";
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async openItem(item) {
    // Create a new tab with the item details
    await chrome.tabs.create({
      url: item.url,
      active: false,
    });

    // Show item details in a modal or new popup
    this.showItemDetails(item);
  }

  showItemDetails(item) {
    // For now, just copy summary to clipboard
    if (item.summary) {
      navigator.clipboard.writeText(item.summary).then(() => {
        this.showNotification("Summary copied to clipboard!");
      });
    }
  }

  showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #10b981;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation styles
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 3000);
  }

  showError(message) {
    const itemsList = document.getElementById("itemsList");
    itemsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div>Error: ${message}</div>
        <div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">
          Try refreshing or check the console
        </div>
      </div>
    `;
  }

  async refresh() {
    const refreshBtn = document.getElementById("refreshBtn");
    const originalText = refreshBtn.textContent;

    refreshBtn.textContent = "🔄 Refreshing...";
    refreshBtn.disabled = true;

    try {
      await this.loadStatus();
      await this.loadSummaries();
      this.updateDisplay();
      this.showNotification("Refreshed successfully!");
    } catch (error) {
      this.showError("Failed to refresh");
    } finally {
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }
  }

  updateDisplay() {
    this.updateStatusDisplay();
    this.updateSummariesDisplay();
    this.updateStats();
  }

  openSettings() {
    // Open options page or settings
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
