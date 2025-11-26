const axios = require('axios');
const cheerio = require('cheerio');

class ContentFetcher {
  constructor() {
    this.timeout = 10000;
    this.maxContentLength = 100000; // 100KB max
  }

  async fetch(url) {
    console.log(`[Fetcher] Fetching: ${url}`);
    
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxContentLength: this.maxContentLength,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        validateStatus: (status) => status < 400
      });

      // Parse HTML with cheerio
      const $ = cheerio.load(response.data);
      
      // Remove non-content elements
      $('script, style, nav, header, footer, aside, iframe, noscript, .ad, .advertisement, .social-share').remove();
      
      // Try to get main content
      let content = '';
      const mainSelectors = ['article', 'main', '.content', '.post-content', '.entry-content', '#content', '.article-body'];
      
      for (const selector of mainSelectors) {
        const main = $(selector);
        if (main.length && main.text().trim().length > 200) {
          content = main.text().replace(/\s+/g, ' ').trim();
          break;
        }
      }
      
      // Fallback to body
      if (!content) {
        content = $('body').text().replace(/\s+/g, ' ').trim();
      }
      
      const title = $('title').text().trim() || 
                    $('h1').first().text().trim() || 
                    $('meta[property="og:title"]').attr('content') || 
                    url;
      
      const description = $('meta[name="description"]').attr('content') ||
                         $('meta[property="og:description"]').attr('content') ||
                         content.substring(0, 300);

      return {
        url,
        title,
        content: content.substring(0, 5000),
        excerpt: description.substring(0, 300),
        success: true
      };

    } catch (error) {
      console.error(`[Fetcher] Error fetching ${url}:`, error.message);
      return {
        url,
        error: error.message,
        success: false
      };
    }
  }

  async fetchMultiple(urls) {
    const results = await Promise.allSettled(
      urls.map(url => this.fetch(url))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        url: urls[index],
        error: result.reason?.message || 'Unknown error',
        success: false
      };
    });
  }
}

module.exports = ContentFetcher;
