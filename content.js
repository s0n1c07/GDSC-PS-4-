// Content script for page content extraction
class ContentExtractor {
  constructor() {
    this.init();
  }

  init() {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.analyzeContent());
    } else {
      // DOM is already loaded
      setTimeout(() => this.analyzeContent(), 1000);
    }
  }

  analyzeContent() {
    try {
      const url = window.location.href;
      
      // Skip if not a content-rich page
      if (!this.isContentPage(url)) {
        return;
      }

      console.log('Analyzing content for:', url);
      
      const contentData = this.extractContent();
      
      // Only process if we have substantial content
      if (this.hasSubstantialContent(contentData)) {
        this.sendToBackground(contentData);
      }
      
    } catch (error) {
      console.error('Content extraction error:', error);
    }
  }

  isContentPage(url) {
    // Skip common non-content pages
    const skipPatterns = [
      /\.(jpg|jpeg|png|gif|svg|pdf|zip|exe|dmg)$/i,
      /\/search\?/,
      /\/login/,
      /\/signup/,
      /\/settings/,
      /\/profile/,
      /\/admin/,
      /google\.com\/search/,
      /facebook\.com/,
      /twitter\.com/,
      /instagram\.com/
    ];

    return !skipPatterns.some(pattern => pattern.test(url));
  }

  extractContent() {
    const url = window.location.href;
    const title = this.getTitle();
    const type = this.detectContentType(url);

    let content = {};
    
    if (type === 'video') {
      content = this.extractVideoContent();
    } else {
      content = this.extractArticleContent();
    }

    return {
      url,
      title,
      type,
      timestamp: Date.now(),
      content,
      domain: window.location.hostname,
      processed: false
    };
  }

  getTitle() {
    // Try multiple title sources
    let title = document.title;
    
    // Check for better titles in meta tags or headings
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content.length > 5) {
      title = ogTitle.content;
    }
    
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle && twitterTitle.content.length > 5) {
      title = twitterTitle.content;
    }
    
    // Clean title
    title = title.replace(/\s*\|\s*.*$/, ''); // Remove site name after |
    title = title.replace(/\s*-\s*.*$/, '');  // Remove site name after -
    
    return title.trim();
  }

  detectContentType(url) {
    const videoPatterns = [
      /youtube\.com\/watch/,
      /youtu\.be\//,
      /vimeo\.com\/\d+/,
      /twitch\.tv\/videos/,
      /dailymotion\.com\/video/
    ];

    return videoPatterns.some(pattern => pattern.test(url)) ? 'video' : 'article';
  }

  extractVideoContent() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('youtube.com')) {
      return this.extractYouTubeContent();
    } else if (hostname.includes('vimeo.com')) {
      return this.extractVimeoContent();
    } else {
      return this.extractGenericVideoContent();
    }
  }

  extractYouTubeContent() {
    let description = '';
    let channelName = '';
    let duration = '';
    
    // Get description
    const descExpander = document.querySelector('#expand');
    if (descExpander) {
      descExpander.click();
      setTimeout(() => {
        const descElement = document.querySelector('#description-text');
        if (descElement) {
          description = descElement.textContent.trim();
        }
      }, 500);
    } else {
      const descElement = document.querySelector('#description-text, .ytd-expandable-video-description-body-renderer');
      if (descElement) {
        description = descElement.textContent.trim();
      }
    }
    
    // Get channel name
    const channelElement = document.querySelector('.ytd-channel-name a, #channel-name a');
    if (channelElement) {
      channelName = channelElement.textContent.trim();
    }
    
    // Get duration
    const durationElement = document.querySelector('.ytp-time-duration');
    if (durationElement) {
      duration = durationElement.textContent.trim();
    }
    
    return {
      description: description.substring(0, 2000), // Limit description length
      channelName,
      duration,
      platform: 'YouTube'
    };
  }

  extractVimeoContent() {
    let description = '';
    let authorName = '';
    
    // Get description
    const descElement = document.querySelector('.clip_details-description');
    if (descElement) {
      description = descElement.textContent.trim();
    }
    
    // Get author
    const authorElement = document.querySelector('.clip_details-byline a');
    if (authorElement) {
      authorName = authorElement.textContent.trim();
    }
    
    return {
      description: description.substring(0, 2000),
      authorName,
      platform: 'Vimeo'
    };
  }

  extractGenericVideoContent() {
    // Extract basic meta information
    const description = this.getMetaContent('description') || 
                       this.getMetaContent('og:description') || '';
    
    return {
      description: description.substring(0, 2000),
      platform: 'Video'
    };
  }

  extractArticleContent() {
    let content = '';
    let author = '';
    let publishDate = '';
    
    // Extract main content using multiple strategies
    content = this.extractMainContent();
    
    // Extract metadata
    author = this.extractAuthor();
    publishDate = this.extractPublishDate();
    
    return {
      text: content.substring(0, 5000), // Limit content length
      author,
      publishDate,
      wordCount: content.split(/\s+/).length
    };
  }

  extractMainContent() {
    // Strategy 1: Common article selectors
    const articleSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.entry-content',
      '.article-body',
      '.story-body',
      '.post-body',
      '.content-body',
      '.post-text',
      'main .content',
      '.article-content'
    ];
    
    for (const selector of articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.extractTextFromElement(element);
        if (text.length > 300) {
          return text;
        }
      }
    }
    
    // Strategy 2: Largest text block
    const textBlocks = this.findLargestTextBlocks();
    if (textBlocks.length > 0) {
      return textBlocks.join('\n\n');
    }
    
    // Strategy 3: All paragraphs as fallback
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => p.textContent.trim())
      .filter(text => text.length > 30);
    
    return paragraphs.join('\n\n');
  }

  extractTextFromElement(element) {
    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);
    
    // Remove script, style, and other non-content elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer',
      '.advertisement', '.ads', '.social-share',
      '.comments', '.related-posts', '.sidebar'
    ];
    
    unwantedSelectors.forEach(selector => {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
    
    return this.cleanText(clone.textContent);
  }

  findLargestTextBlocks() {
    const allElements = document.querySelectorAll('p, div, section, article');
    const textBlocks = [];
    
    allElements.forEach(element => {
      const text = element.textContent.trim();
      if (text.length > 100 && !this.isNavigationElement(element)) {
        textBlocks.push({
          text,
          length: text.length,
          element
        });
      }
    });
    
    // Sort by length and take top blocks
    return textBlocks
      .sort((a, b) => b.length - a.length)
      .slice(0, 5)
      .map(block => block.text);
  }

  isNavigationElement(element) {
    const navigationClasses = [
      'nav', 'menu', 'header', 'footer', 'sidebar',
      'advertisement', 'ads', 'social', 'share'
    ];
    
    const className = element.className.toLowerCase();
    return navigationClasses.some(navClass => className.includes(navClass));
  }

  extractAuthor() {
    // Try multiple author extraction methods
    const authorSelectors = [
      '[rel="author"]',
      '.author',
      '.byline',
      '.post-author',
      '.article-author',
      'meta[name="author"]'
    ];
    
    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const author = element.textContent || element.getAttribute('content');
        if (author && author.trim().length > 0) {
          return author.trim();
        }
      }
    }
    
    return '';
  }

  extractPublishDate() {
    // Try multiple date extraction methods
    const dateSelectors = [
      'time[datetime]',
      '.date',
      '.publish-date',
      '.post-date',
      'meta[property="article:published_time"]',
      'meta[name="date"]'
    ];
    
    for (const selector of dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const date = element.getAttribute('datetime') || 
                    element.getAttribute('content') || 
                    element.textContent;
        if (date && date.trim().length > 0) {
          return new Date(date.trim()).toISOString();
        }
      }
    }
    
    return '';
  }

  getMetaContent(name) {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return meta ? meta.getAttribute('content') : '';
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
      .trim();
  }

  hasSubstantialContent(contentData) {
    if (contentData.type === 'video') {
      return contentData.content.description && 
             contentData.content.description.length > 50;
    } else {
      return contentData.content.text && 
             contentData.content.text.length > 200;
    }
  }

  sendToBackground(contentData) {
    chrome.runtime.sendMessage({
      action: 'contentExtracted',
      data: contentData
    }).catch(error => {
      console.error('Failed to send content to background:', error);
    });
  }
}

// Initialize content extractor
const contentExtractor = new ContentExtractor();