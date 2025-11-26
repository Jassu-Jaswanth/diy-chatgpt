const axios = require('axios');
const cheerio = require('cheerio');

class SearchService {
  constructor() {
    this.provider = process.env.SEARCH_PROVIDER || 'duckduckgo';
  }

  async search(query, limit = 5) {
    console.log(`[Search] Provider: ${this.provider}, Query: "${query}"`);
    
    switch (this.provider) {
      case 'serpapi':
        return this.searchSerpAPI(query, limit);
      case 'bing':
        return this.searchBing(query, limit);
      default:
        return this.searchDuckDuckGo(query, limit);
    }
  }

  // DuckDuckGo search (free, no API key needed)
  async searchDuckDuckGo(query, limit) {
    try {
      // Use DuckDuckGo's HTML interface
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.result').each((i, elem) => {
        if (i >= limit) return false;
        
        const titleElem = $(elem).find('.result__title a');
        const snippetElem = $(elem).find('.result__snippet');
        const urlElem = $(elem).find('.result__url');
        
        const title = titleElem.text().trim();
        const url = titleElem.attr('href');
        const snippet = snippetElem.text().trim();
        const displayUrl = urlElem.text().trim();

        if (title && url) {
          // Extract actual URL from DuckDuckGo redirect
          let cleanUrl = url;
          if (url.includes('uddg=')) {
            const match = url.match(/uddg=([^&]+)/);
            if (match) {
              cleanUrl = decodeURIComponent(match[1]);
            }
          }

          results.push({
            title,
            url: cleanUrl,
            snippet,
            displayUrl,
            source: 'duckduckgo'
          });
        }
      });

      console.log(`[Search] Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[Search] DuckDuckGo error:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  // SerpAPI search (requires API key)
  async searchSerpAPI(query, limit) {
    if (!process.env.SERPAPI_KEY || process.env.SERPAPI_KEY === 'your-serpapi-key-if-using') {
      throw new Error('SerpAPI key not configured');
    }

    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: process.env.SERPAPI_KEY,
          num: limit,
          engine: 'google'
        },
        timeout: 15000
      });

      const results = (response.data.organic_results || []).slice(0, limit).map(r => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        displayUrl: r.displayed_link,
        source: 'serpapi'
      }));

      console.log(`[Search] Found ${results.length} results via SerpAPI`);
      return results;
    } catch (error) {
      console.error('[Search] SerpAPI error:', error.message);
      throw new Error(`SerpAPI search failed: ${error.message}`);
    }
  }

  // Bing search (requires API key)
  async searchBing(query, limit) {
    if (!process.env.BING_API_KEY || process.env.BING_API_KEY === 'your-bing-key-if-using') {
      throw new Error('Bing API key not configured');
    }

    try {
      const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        params: {
          q: query,
          count: limit
        },
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY
        },
        timeout: 10000
      });

      const results = (response.data.webPages?.value || []).map(r => ({
        title: r.name,
        url: r.url,
        snippet: r.snippet,
        displayUrl: r.displayUrl,
        source: 'bing'
      }));

      console.log(`[Search] Found ${results.length} results via Bing`);
      return results;
    } catch (error) {
      console.error('[Search] Bing error:', error.message);
      throw new Error(`Bing search failed: ${error.message}`);
    }
  }
}

module.exports = SearchService;
