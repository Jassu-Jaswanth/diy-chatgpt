const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // API-only, no CSP needed
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Initialize OpenAI (with graceful handling for missing API key)
let openai = null;
const API_KEY = process.env.OPENAI_API_KEY;
const isApiKeyConfigured = API_KEY && API_KEY !== 'sk-your-openai-api-key-here';

if (isApiKeyConfigured) {
  openai = new OpenAI({
    apiKey: API_KEY
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    openaiConfigured: isApiKeyConfigured
  });
});

// Basic chat endpoint (with agent for tool use)
// Now supports session-based chat with automatic summarization
app.post('/api/chat', async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ 
        error: 'OpenAI API not configured',
        message: 'Please add your OpenAI API key to the .env file'
      });
    }

    const { 
      message,           // New: single message content
      messages,          // Legacy: array of messages (for non-session mode)
      sessionId,         // Session ID for persistent chat
      useAgent = true, 
      enabledTools = [] 
    } = req.body;

    let chatMessages;
    let currentSessionId = sessionId;

    // Session-based chat
    if (sessionId && sessionService) {
      // Save user message to session
      await sessionService.addMessage(sessionId, 'user', message || messages[messages.length - 1].content);

      // Get context with automatic summarization
      const context = await sessionService.getContextForApiCall(sessionId);
      chatMessages = context.messages;
      
      console.log(`[Chat] Session ${sessionId}: ${context.activeMessageCount} active messages, summary: ${context.hasSummary}`);
    } else if (messages && Array.isArray(messages)) {
      // Legacy mode: direct messages array
      chatMessages = messages;
    } else if (message) {
      // Single message without session
      chatMessages = [{ role: 'user', content: message }];
    } else {
      return res.status(400).json({ error: 'Message or messages array is required' });
    }

    let result;
    
    // If tools are manually enabled, force those tools
    const hasManualTools = enabledTools && enabledTools.length > 0;
    
    if (hasManualTools && orchestrator) {
      console.log(`[Server] Manual tools enabled: ${enabledTools.join(', ')}`);
      result = await orchestrator.process(chatMessages, { 
        customInstructions: req.body.customInstructions,
        forcedTools: enabledTools
      });
    } else if (useAgent && orchestrator) {
      result = await orchestrator.process(chatMessages, { customInstructions: req.body.customInstructions });
    } else {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: chatMessages,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
      });
      result = completion.choices[0].message;
    }

    // Save assistant response to session
    if (currentSessionId && sessionService) {
      await sessionService.addMessage(currentSessionId, 'assistant', result.content, {
        toolUsed: result.toolUsed,
        sources: result.sources,
        extra: result.metadata
      });

      // Generate title if first response
      const session = await sessionService.getSession(currentSessionId, 2);
      if (!session.title && session.messages.length >= 2) {
        sessionService.generateTitle(currentSessionId).catch(err => 
          console.error('[Chat] Title generation error:', err.message)
        );
      }
    }

    // Log tool usage
    if (result.toolUsed) {
      console.log(`[Agent] Tool used: ${result.toolUsed}`);
    }

    res.json({
      ...result,
      sessionId: currentSessionId
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: error.message || 'An error occurred processing your request' 
    });
  }
});

// Initialize services
const SearchService = require('./services/search');
const ContentFetcher = require('./services/fetcher');
const StudyService = require('./services/study');
const ResearchAgent = require('./services/research');
const ExportService = require('./services/export');
const MemoryService = require('./services/memory');
const Orchestrator = require('./services/orchestrator');
const SummarizerService = require('./services/summarizer');
const SessionService = require('./services/session');
const database = require('./services/storage/database');

const searchService = new SearchService();
const contentFetcher = new ContentFetcher();
const studyService = isApiKeyConfigured ? new StudyService(openai) : null;
const researchAgent = isApiKeyConfigured ? new ResearchAgent(openai) : null;
const exportService = new ExportService();
const memoryService = new MemoryService();
const summarizerService = isApiKeyConfigured ? new SummarizerService(openai) : null;
const sessionService = isApiKeyConfigured ? new SessionService(openai, summarizerService) : null;

// Orchestrator with planner → executor architecture
const orchestrator = isApiKeyConfigured ? new Orchestrator(openai, {
  search: searchService,
  fetcher: contentFetcher,
  study: studyService,
  research: researchAgent
}) : null;

// Initialize database on startup
(async () => {
  try {
    await database.initialize();
  } catch (err) {
    console.error('[Server] Database initialization failed:', err.message);
    console.log('[Server] Continuing without database - sessions will not be persisted');
  }
})();

// Search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await searchService.search(query, limit);
    res.json({ results, query, count: results.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch content from URL
app.post('/api/fetch', async (req, res) => {
  try {
    const { url, urls } = req.body;
    
    if (urls && Array.isArray(urls)) {
      const results = await contentFetcher.fetchMultiple(urls);
      return res.json({ results });
    }
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const content = await contentFetcher.fetch(url);
    res.json(content);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search and summarize endpoint (combines search + AI summary)
app.post('/api/search-summarize', async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }

    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Step 1: Search
    const searchResults = await searchService.search(query, limit);
    
    // Step 2: Fetch content from top results
    const urls = searchResults.slice(0, 3).map(r => r.url);
    const fetchedContent = await contentFetcher.fetchMultiple(urls);
    
    // Step 3: Summarize with AI
    const contentForAI = fetchedContent
      .filter(c => c.success)
      .map((c, i) => `[${i + 1}] ${c.title}\nURL: ${c.url}\nContent: ${c.excerpt}`)
      .join('\n\n');

    const systemPrompt = `You are a research assistant. Summarize the search results and provide a helpful answer with citations. Use [1], [2], etc. to cite sources.`;
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Query: "${query}"\n\nSearch Results:\n${contentForAI}\n\nProvide a summary with citations.` }
      ],
      max_tokens: 1500
    });

    res.json({
      query,
      summary: completion.choices[0].message.content,
      sources: searchResults.map((r, i) => ({
        id: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.snippet
      })),
      usage: completion.usage
    });
  } catch (error) {
    console.error('Search-summarize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Study Mode endpoints
app.post('/api/study/lesson', async (req, res) => {
  try {
    if (!studyService) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { topic, level = 'intermediate' } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    const result = await studyService.generateLesson(topic, level);
    res.json(result);
  } catch (error) {
    console.error('Study lesson error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/study/practice', async (req, res) => {
  try {
    if (!studyService) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { topic, level = 'intermediate' } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    const result = await studyService.generatePractice(topic, level);
    res.json(result);
  } catch (error) {
    console.error('Study practice error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/study/flashcards', async (req, res) => {
  try {
    if (!studyService) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    const result = await studyService.generateFlashcards(topic);
    res.json(result);
  } catch (error) {
    console.error('Study flashcards error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/study/quiz', async (req, res) => {
  try {
    if (!studyService) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    const result = await studyService.generateQuiz(topic);
    res.json(result);
  } catch (error) {
    console.error('Study quiz error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/study/explain', async (req, res) => {
  try {
    if (!studyService) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { concept, context } = req.body;
    if (!concept) {
      return res.status(400).json({ error: 'Concept is required' });
    }
    const result = await studyService.explain(concept, context);
    res.json(result);
  } catch (error) {
    console.error('Study explain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deep Research endpoints
app.post('/api/research', async (req, res) => {
  try {
    if (!researchAgent) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { question, depth = 2, maxSources = 10 } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    console.log(`[API] Starting deep research: "${question}"`);
    const result = await researchAgent.research(question, { depth, maxSources });
    res.json(result);
  } catch (error) {
    console.error('Research error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/research/quick', async (req, res) => {
  try {
    if (!researchAgent) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    const result = await researchAgent.quickResearch(question);
    res.json(result);
  } catch (error) {
    console.error('Quick research error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export endpoints
app.post('/api/export', async (req, res) => {
  try {
    const { content, format = 'markdown', title = 'export', data } = req.body;
    
    let result;
    switch (format) {
      case 'pdf':
        result = await exportService.exportToPDF(content, title);
        break;
      case 'csv':
        result = await exportService.exportToCSV(data || content, title);
        break;
      case 'json':
        result = await exportService.exportToJSON(data || { content }, title);
        break;
      case 'text':
        result = await exportService.exportToText(content, title);
        break;
      default:
        result = await exportService.exportToMarkdown(content, title);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/chat', async (req, res) => {
  try {
    const { messages, title = 'chat_history' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    const result = await exportService.exportChatHistory(messages, title);
    res.json(result);
  } catch (error) {
    console.error('Export chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/research', async (req, res) => {
  try {
    const { research, format = 'markdown' } = req.body;
    if (!research) {
      return res.status(400).json({ error: 'Research data required' });
    }
    const result = await exportService.exportResearchReport(research, format);
    res.json(result);
  } catch (error) {
    console.error('Export research error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exports', async (req, res) => {
  try {
    const exports = await exportService.listExports();
    res.json({ exports });
  } catch (error) {
    console.error('List exports error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exports/:filename', (req, res) => {
  try {
    const filepath = exportService.getFilePath(req.params.filename);
    res.download(filepath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

app.delete('/api/exports/:filename', async (req, res) => {
  try {
    const result = await exportService.deleteExport(req.params.filename);
    res.json(result);
  } catch (error) {
    console.error('Delete export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Memory endpoints
app.post('/api/memory', async (req, res) => {
  try {
    const { content, type = 'short_term', metadata = {} } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    let result;
    if (type === 'long_term') {
      result = await memoryService.addLongTerm(content, metadata);
    } else {
      result = await memoryService.addShortTerm(content, metadata);
    }
    res.json(result);
  } catch (error) {
    console.error('Memory add error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memory/search', async (req, res) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query (q) is required' });
    }
    const results = await memoryService.search(q, { type, limit: parseInt(limit) });
    res.json({ results, query: q });
  } catch (error) {
    console.error('Memory search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memory/recent', async (req, res) => {
  try {
    const { count = 10, type = 'all' } = req.query;
    const memories = await memoryService.getRecent(parseInt(count), type);
    res.json({ memories });
  } catch (error) {
    console.error('Memory recent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memory/context', async (req, res) => {
  try {
    const { query = '' } = req.query;
    const context = await memoryService.getContext(query);
    res.json({ context });
  } catch (error) {
    console.error('Memory context error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memory/stats', async (req, res) => {
  try {
    const stats = await memoryService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Memory stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/memory/:id', async (req, res) => {
  try {
    const result = await memoryService.deleteMemory(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Memory delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/memory', async (req, res) => {
  try {
    const { type = 'short_term' } = req.query;
    let result;
    if (type === 'all') {
      result = await memoryService.clearAll();
    } else {
      result = await memoryService.clearShortTerm();
    }
    res.json(result);
  } catch (error) {
    console.error('Memory clear error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Conversation endpoints
app.post('/api/conversations', async (req, res) => {
  try {
    const { id, messages, metadata } = req.body;
    const convId = id || `conv_${Date.now()}`;
    const result = await memoryService.saveConversation(convId, messages, metadata);
    res.json(result);
  } catch (error) {
    console.error('Save conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await memoryService.listConversations();
    res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await memoryService.loadConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    console.error('Load conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SESSION ENDPOINTS ====================

// List all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await sessionService.listSessions(limit, offset);
    res.json(result);
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new session
app.post('/api/sessions', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    const { title } = req.body;
    const session = await sessionService.createSession(title);
    res.json(session);
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session with messages
app.get('/api/sessions/:id', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    const pageSize = parseInt(req.query.pageSize) || undefined;
    const session = await sessionService.getSession(req.params.id, pageSize);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get more messages (pagination)
app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const beforeId = req.query.beforeId || null;
    
    const messages = await sessionService.getMessages(req.params.id, limit, beforeId);
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update session title
app.patch('/api/sessions/:id', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    const { title } = req.body;
    await sessionService.updateTitle(req.params.id, title);
    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete session
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }
    
    await sessionService.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   DIY ChatGPT Backend Server         ║
╠══════════════════════════════════════╣
║   Status: Running                    ║
║   Port: ${PORT}                        ║
║   Environment: ${process.env.NODE_ENV || 'development'}      ║
║   Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}          ║
╚══════════════════════════════════════╝
  `);
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
    console.log('⚠️  WARNING: OpenAI API key not configured!');
    console.log('   Please edit .env and add your actual API key');
  }
});
