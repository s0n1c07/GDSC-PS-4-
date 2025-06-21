function extractPageContent() {
  // Check if the script has already run to avoid duplicates
  if (window.hasRunNexusExtractor) {
    return null;
  }
  window.hasRunNexusExtractor = true;

  const title = document.title;
  let mainContentElement = null;

  // Prioritized list of selectors for high-quality content
  const selectors = [
    "article",
    "main",
    ".post-content",
    ".entry-content",
    ".article-body",
    '[role="main"]',
    "#content",
  ];

  for (const selector of selectors) {
    mainContentElement = document.querySelector(selector);
    if (mainContentElement) {
      break;
    }
  }

  // Fallback to body if no specific container is found
  if (!mainContentElement) {
    mainContentElement = document.body;
  }

  // Clean up the text: remove script/style tags, extra whitespace
  const contentClone = mainContentElement.cloneNode(true);
  contentClone
    .querySelectorAll("script, style, nav, footer, header, aside, form")
    .forEach((el) => el.remove());

  const text = contentClone.innerText.replace(/\s{2,}/g, " ").trim();

  // Return null if content is too short to be meaningful
  if (text.length < 250) {
    return null;
  }

  return { title, text: text.substring(0, 8000) };
}

// Listen for a message from the background script, then respond with content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "extractContent") {
    const content = extractPageContent();
    sendResponse(content);
  }
  return true; // Keep the message channel open for the asynchronous response
});
