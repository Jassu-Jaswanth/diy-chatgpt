/**
 * Agent Service
 * Detects user intent and routes to appropriate tools
 */

class AgentService {
  constructor(openai, services) {
    this.openai = openai;
    this.searchService = services.search;
    this.contentFetcher = services.fetcher;
    this.studyService = services.study;
    this.researchAgent = services.research;
  }

  // Detect what tool to use based on user message
  async detectIntent(message) {
    const lowerMsg = message.toLowerCase();
    
    // Search patterns
    const searchPatterns = [
      /search\s+(the\s+)?(web|internet|online)/i,
      /look\s+up/i,
      /find\s+(me\s+)?(information|info|news|articles)/i,
      /what('s| is)\s+(the\s+)?(latest|current|recent|new)/i,
      /google/i,
      /browse/i
    ];
    
    // Research patterns (deeper analysis)
    const researchPatterns = [
      /research/i,
      /in-depth|in depth/i,
      /analyze|analysis/i,
      /comprehensive/i,
      /detailed\s+report/i
    ];
    
    // Study patterns
    const studyPatterns = [
      /teach\s+me/i,
      /explain\s+(to\s+me\s+)?how/i,
      /lesson\s+on/i,
      /learn\s+about/i,
      /create\s+flashcards/i,
      /quiz\s+me/i,
      /practice\s+questions/i
    ];

    // Check patterns
    for (const pattern of researchPatterns) {
      if (pattern.test(lowerMsg)) {
        return { tool: 'research', confidence: 0.9 };
      }
    }
    
    for (const pattern of searchPatterns) {
      if (pattern.test(lowerMsg)) {
        return { tool: 'search', confidence: 0.9 };
      }
    }
    
    for (const pattern of studyPatterns) {
      if (pattern.test(lowerMsg)) {
        return { tool: 'study', confidence: 0.8 };
      }
    }
    
    // Use AI to detect intent if no pattern matched but might need tools
    if (this.mightNeedCurrentInfo(lowerMsg)) {
      return { tool: 'search', confidence: 0.7 };
    }
    
    return { tool: 'chat', confidence: 1.0 };
  }

  // Check if the question might need current/real-time info
  mightNeedCurrentInfo(message) {
    const currentInfoKeywords = [
      'current', 'latest', 'recent', 'today', 'now', 'this week',
      'this month', 'this year', '2024', '2025', 'new', 'update',
      'price', 'stock', 'weather', 'news', 'meta', 'patch', 'version'
    ];
    
    return currentInfoKeywords.some(keyword => message.includes(keyword));
  }

  // Extract the search query from user message
  extractQuery(message) {
    // Remove common prefixes
    let query = message
      .replace(/^(please\s+)?/i, '')
      .replace(/^(can you\s+)?/i, '')
      .replace(/^(search\s+(the\s+)?(web|internet|online)\s+(for\s+)?)/i, '')
      .replace(/^(look\s+up\s+)/i, '')
      .replace(/^(find\s+(me\s+)?(information|info)?\s*(about|on|for)?\s*)/i, '')
      .replace(/^(tell\s+me\s+(about\s+)?)/i, '')
      .replace(/^(what('s| is)\s+(the\s+)?)/i, '')
      .trim();
    
    return query || message;
  }

  // Main agent process
  async process(messages) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return this.regularChat(messages);
    }

    const userMessage = lastMessage.content;
    const intent = await this.detectIntent(userMessage);
    
    console.log(`[Agent] Detected intent: ${intent.tool} (confidence: ${intent.confidence})`);

    switch (intent.tool) {
      case 'search':
        return this.handleSearch(userMessage, messages);
      case 'research':
        return this.handleResearch(userMessage);
      case 'study':
        return this.handleStudy(userMessage);
      default:
        return this.regularChat(messages);
    }
  }

  // Handle web search
  async handleSearch(userMessage, messages) {
    const query = this.extractQuery(userMessage);
    console.log(`[Agent] Searching for: "${query}"`);

    try {
      // Perform search
      const searchResults = await this.searchService.search(query, 5);
      
      if (searchResults.length === 0) {
        return this.regularChat(messages);
      }

      // Fetch content from top results
      const urls = searchResults.slice(0, 3).map(r => r.url);
      const contents = await this.contentFetcher.fetchMultiple(urls);
      const successfulContents = contents.filter(c => c.success);

      // Build context for AI
      const searchContext = searchResults
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`)
        .join('\n\n');

      const fetchedContext = successfulContents
        .map((c, i) => `[Source ${i + 1}] ${c.title}\nContent: ${c.content?.substring(0, 800)}`)
        .join('\n\n---\n\n');

      // Generate response with search results
      const systemPrompt = `You are a helpful assistant with web search capabilities. 
You have just searched the web and found the following results. 
Use this information to answer the user's question accurately.
Always cite sources using [1], [2], etc.
If the search results don't fully answer the question, say so and provide what you can.

Search Results:
${searchContext}

Fetched Content:
${fetchedContext}`;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      // Format sources
      const sources = searchResults.map((r, i) => ({
        id: i + 1,
        title: r.title,
        url: r.url
      }));

      return {
        role: 'assistant',
        content: response.choices[0].message.content,
        toolUsed: 'web_search',
        sources,
        usage: response.usage
      };

    } catch (error) {
      console.error('[Agent] Search error:', error);
      // Fallback to regular chat
      return this.regularChat(messages);
    }
  }

  // Handle deep research
  async handleResearch(userMessage) {
    const query = this.extractQuery(userMessage);
    console.log(`[Agent] Researching: "${query}"`);

    try {
      const result = await this.researchAgent.quickResearch(query);
      
      return {
        role: 'assistant',
        content: result.answer,
        toolUsed: 'research',
        sources: result.sources,
        usage: result.usage
      };
    } catch (error) {
      console.error('[Agent] Research error:', error);
      return {
        role: 'assistant',
        content: `I encountered an error while researching: ${error.message}`,
        toolUsed: 'research',
        error: true
      };
    }
  }

  // Handle study mode
  async handleStudy(userMessage) {
    const lowerMsg = userMessage.toLowerCase();
    const topic = this.extractQuery(userMessage);

    try {
      let result;
      
      if (lowerMsg.includes('flashcard')) {
        result = await this.studyService.generateFlashcards(topic);
      } else if (lowerMsg.includes('quiz') || lowerMsg.includes('test')) {
        result = await this.studyService.generateQuiz(topic);
      } else if (lowerMsg.includes('practice') || lowerMsg.includes('question')) {
        result = await this.studyService.generatePractice(topic, 'intermediate');
      } else {
        result = await this.studyService.explain(topic);
      }

      return {
        role: 'assistant',
        content: result.content,
        toolUsed: 'study',
        studyType: result.type,
        usage: result.usage
      };
    } catch (error) {
      console.error('[Agent] Study error:', error);
      return {
        role: 'assistant',
        content: `I encountered an error in study mode: ${error.message}`,
        toolUsed: 'study',
        error: true
      };
    }
  }

  // Regular chat without tools
  async regularChat(messages) {
    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
    });

    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      toolUsed: null,
      usage: response.usage
    };
  }
}

module.exports = AgentService;
