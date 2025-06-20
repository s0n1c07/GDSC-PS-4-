// Background script for tracking and AI processing
import { WebLLM } from './webllm/webllm.js';

class ContentTracker {
  constructor() {
    this.engine = null;
    this.isInitialized = false;
    this.initializeWebLLM();
    this.setupEventListeners();
  }

  async initializeWebLLM() {
    try {
      console.log('Initializing WebLLM...');
      this.engine = new WebLLM.MLCEngine();
      
      await this.engine.reload('phi-2-q4f16_1-MLC', {
        temperature: 0.7,
        max_tokens: 1500
      });
      
      this.isInitialized = true;
      console.log('WebLLM initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebLLM:', error);
    }
  }

  setupEventListeners() {
    // Track navigation events
    chrome.webNavigation.onCompleted.addListener(
      (details) => this.handleNavigation(details),
      { url: [{ schemes: ['http', 'https'] }] }
    );

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener(
      (message, sender, sendResponse) => this.handleMessage(message, sender, sendResponse)
    );

    // Handle tab updates
    chrome.tabs.onUpdated.addListener(
      (tabId, changeInfo, tab) => this.handleTabUpdate(tabId, changeInfo, tab)
    );
  }

  async handleNavigation(details) {
    if (details.frameId !== 0) return; // Only main frame
    
    const url = details.url;
    const tabId = details.tabId;
    
    // Check if this is a content-rich page
    if (this.isContentRichPage(url)) {
      console.log('Content-rich page detected:', url);
      
      // Wait a bit for page to load, then inject content extraction
      setTimeout(() => {
        this.extractContent(tabId, url);
      }, 2000);
    }
  }

  isContentRichPage(url) {
    const contentSites = [
      'medium.com',
      'substack.com',
      'dev.to',
      'hashnode.com',
      'youtube.com',
      'vimeo.com',
      'nytimes.com',
      'washingtonpost.com',
      'theguardian.com',
      'wikipedia.org',
      'stackoverflow.com',
      'github.com',
      'reddit.com'
    ];
    
    // Check for blog patterns
    const blogPatterns = [
      /\/blog\//,
      /\/article\//,
      /\/post\//,
      /\/news\//,
      /\/watch\?v=/,
      /\/video\//
    ];
    
    return contentSites.some(site => url.includes(site)) ||
           blogPatterns.some(pattern => pattern.test(url));
  }

  async extractContent(tabId, url) {
    try {
      // Inject content extraction script
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.extractPageContent
      });
    } catch (error) {
      console.error('Failed to extract content:', error);
    }
  }

  // This function runs in the page context
  extractPageContent() {
    const content = {
      url: window.location.href,
      title: document.title,
      type: 'article',
      timestamp: Date.now(),
      content: ''
    };

    // Detect content type
    if (content.url.includes('youtube.com/watch') || content.url.includes('vimeo.com')) {
      content.type = 'video';
      content.content = this.extractVideoContent();
    } else {
      content.type = 'article';
      content.content = this.extractArticleContent();
    }

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'contentExtracted',
      data: content
    });
  }

  extractVideoContent() {
    let description = '';
    let transcript = '';
    
    // YouTube specific extraction
    if (window.location.hostname.includes('youtube.com')) {
      // Get video description
      const descElement = document.querySelector('#meta-contents #description');
      if (descElement) {
        description = descElement.textContent.trim();
      }
      
      // Try to get transcript if available
      const transcriptButton = document.querySelector('[aria-label*="transcript" i]');
      if (transcriptButton) {
        // Note: Actual transcript extraction would require more complex logic
        transcript = 'Transcript extraction requires additional implementation';
      }
    }
    
    return { description, transcript };
  }

  extractArticleContent() {
    // Try multiple content extraction strategies
    let content = '';
    
    // Strategy 1: Look for common article containers
    const articleSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.entry-content',
      '.article-body',
      '.story-body',
      '.content',
      'main'
    ];
    
    for (const selector of articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        content = this.cleanText(element.textContent);
        if (content.length > 500) break; // Good content found
      }
    }
    
    // Strategy 2: If no good content, try readability-style extraction
    if (content.length < 500) {
      const paragraphs = document.querySelectorAll('p');
      const textBlocks = Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(text => text.length > 50);
      
      content = textBlocks.join('\n\n');
    }
    
    return content;
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'contentExtracted':
        await this.processContent(message.data);
        break;
      
      case 'getSummaries':
        const summaries = await this.getSummaries();
        sendResponse(summaries);
        break;
      
      case 'getStatus':
        sendResponse({ 
          initialized: this.isInitialized,
          model: 'phi-2-q4f16_1-MLC'
        });
        break;
    }
    
    return true; // Keep message channel open
  }

  async processContent(contentData) {
    if (!this.isInitialized) {
      console.log('WebLLM not initialized, queuing content...');
      return;
    }

    try {
      console.log('Processing content:', contentData.title);
      
      // Prepare content for summarization
      const textToSummarize = this.prepareTextForSummarization(contentData);
      
      // Generate summary
      const summary = await this.generateSummary(textToSummarize);
      
      // Generate tags
      const tags = await this.generateTags(textToSummarize);
      
      // Store in IndexedDB
      await this.storeContent({
        ...contentData,
        summary,
        tags,
        processed: true
      });
      
      console.log('Content processed and stored:', contentData.title);
      
    } catch (error) {
      console.error('Error processing content:', error);
    }
  }

  prepareTextForSummarization(contentData) {
    let text = `Title: ${contentData.title}\n\n`;
    
    if (contentData.type === 'video') {
      text += `Description: ${contentData.content.description}\n\n`;
      if (contentData.content.transcript) {
        text += `Transcript: ${contentData.content.transcript}`;
      }
    } else {
      text += contentData.content;
    }
    
    // Truncate to reasonable length (about 3000 chars for context)
    if (text.length > 3000) {
      text = text.substring(0, 3000) + '...';
    }
    
    return text;
  }

  async generateSummary(text) {
    try {
      const prompt = `Please provide a concise summary of the following content in 2-3 paragraphs. Focus on the main points and key insights:

${text}

Summary:`;

      const response = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7
      });
      
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return 'Summary generation failed';
    }
  }

  async generateTags(text) {
    try {
      const prompt = `Based on the following content, generate 3-5 relevant tags/keywords (single words or short phrases, comma-separated):

${text.substring(0, 1000)}

Tags:`;

      const response = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.5
      });
      
      const tagsString = response.choices[0].message.content.trim();
      return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } catch (error) {
      console.error('Error generating tags:', error);
      return [];
    }
  }

  async storeContent(contentData) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ContentSummarizerDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['content'], 'readwrite');
        const store = transaction.objectStore('content');
        
        const storeRequest = store.put(contentData);
        storeRequest.onsuccess = () => resolve();
        storeRequest.onerror = () => reject(storeRequest.error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const store = db.createObjectStore('content', { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('type', 'type');
        store.createIndex('tags', 'tags', { multiEntry: true });
      };
    });
  }

  async getSummaries() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ContentSummarizerDB', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['content'], 'readonly');
        const store = transaction.objectStore('content');
        const index = store.index('timestamp');
        
        const getAllRequest = index.getAll();
        getAllRequest.onsuccess = () => {
          const results = getAllRequest.result
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50); // Last 50 items
          resolve(results);
        };
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    // Handle tab updates if needed
    if (changeInfo.status === 'complete' && tab.url) {
      // Additional processing if needed
    }
  }
}

// Initialize the content tracker
const contentTracker = new ContentTracker();