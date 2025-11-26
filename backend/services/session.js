/**
 * Session Service
 * 
 * Manages chat sessions with:
 * - File-based content storage
 * - PostgreSQL metadata
 * - Automatic summarization on cache expiry
 * - Auto-generated titles
 */

const database = require('./storage/database');
const fileStorage = require('./storage/fileStorage');
const dbConfig = require('../../config/database');

class SessionService {
  constructor(openai, summarizer) {
    this.openai = openai;
    this.summarizer = summarizer;
    this.config = dbConfig.session;
  }

  /**
   * Create a new session
   */
  async createSession(title = null) {
    const session = await database.createSession(title);
    console.log(`[Session] Created new session: ${session.id}`);
    return session;
  }

  /**
   * Get session by ID with recent messages
   */
  async getSession(sessionId, pageSize = null) {
    const session = await database.getSession(sessionId);
    if (!session) return null;

    const limit = pageSize || this.config.defaultPageSize;
    const messages = await this.getMessages(sessionId, limit);

    return {
      ...session,
      messages
    };
  }

  /**
   * List all sessions
   */
  async listSessions(limit = 20, offset = 0) {
    return database.listSessions(limit, offset);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    // Delete files first
    await fileStorage.deleteSession(sessionId);
    // Delete from database (cascades to messages and summaries)
    await database.deleteSession(sessionId);
    console.log(`[Session] Deleted session: ${sessionId}`);
  }

  /**
   * Add a message to session
   */
  async addMessage(sessionId, role, content, metadata = {}) {
    const { v4: uuidv4 } = require('uuid');
    const messageId = uuidv4();

    // Estimate tokens (rough: ~4 chars per token)
    const tokens = Math.ceil(content.length / 4);

    // Save content to file
    const filePath = await fileStorage.saveMessage(sessionId, messageId, {
      role,
      content,
      toolUsed: metadata.toolUsed,
      sources: metadata.sources,
      metadata: metadata.extra,
      createdAt: Date.now()
    });

    // Save reference to database (use same ID as file)
    await database.createMessage(sessionId, {
      id: messageId,
      role,
      filePath: fileStorage.getRelativePath(filePath),
      tokens
    });

    console.log(`[Session] Added ${role} message to ${sessionId} (${tokens} tokens)`);

    return { id: messageId, role, content, tokens };
  }

  /**
   * Get messages for session with pagination
   */
  async getMessages(sessionId, limit = 50, beforeId = null) {
    const messageRefs = await database.getMessages(sessionId, limit, beforeId);
    
    // Load content from files
    const messages = await Promise.all(
      messageRefs.map(async (ref) => {
        const content = await fileStorage.getMessage(sessionId, ref.id);
        return {
          id: ref.id,
          role: content?.role || ref.role,
          content: content?.content || '',
          toolUsed: content?.tool_used,
          sources: content?.sources,
          createdAt: ref.createdAt,
          isSummarized: ref.isSummarized
        };
      })
    );

    return messages;
  }

  /**
   * Get context for API call
   * Returns summary (if any) + active messages formatted for OpenAI
   */
  async getContextForApiCall(sessionId) {
    const context = await this.summarizer.getSessionContext(sessionId);
    
    const apiMessages = [];

    // Add summary as system context if exists
    if (context.summary) {
      apiMessages.push({
        role: 'system',
        content: `## Previous Conversation Summary\n${context.summary}\n\nContinue the conversation based on this context.`
      });
    }

    // Add active messages
    for (const msg of context.messages) {
      apiMessages.push({
        role: msg.role,
        content: msg.content
      });
    }

    return {
      messages: apiMessages,
      hasSummary: context.hasSummary,
      activeMessageCount: context.activeMessageCount,
      cachedTokens: context.hasSummary ? 'summarized' : context.activeMessageCount * 100 // rough estimate
    };
  }

  /**
   * Generate title for session from first message
   */
  async generateTitle(sessionId) {
    const messages = await this.getMessages(sessionId, 2);
    if (messages.length === 0) return null;

    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return null;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.titleModel,
        messages: [
          {
            role: 'system',
            content: `You are a title generator. Create a concise 3-6 word title that summarizes the user's question or topic. 
Rules:
- Output ONLY the title, no quotes, no punctuation at the end
- Be descriptive but brief
- Focus on the main topic or intent

Example inputs and outputs:
"What is 2+2?" → "Basic Math Question"
"How do I learn Python?" → "Learning Python Programming"
"Tell me about the French Revolution" → "French Revolution Overview"`
          },
          {
            role: 'user',
            content: `Create a title for this message: "${firstUserMessage.content.substring(0, 200)}"`
          }
        ],
        max_tokens: 20,
        temperature: 0.5
      });

      const title = response.choices[0].message.content
        .replace(/["']/g, '')
        .replace(/[.!?]$/, '')
        .trim();
      
      await database.updateSession(sessionId, { title, updateActivity: false });
      
      console.log(`[Session] Generated title: "${title}"`);
      return title;
    } catch (err) {
      console.error('[Session] Title generation failed:', err.message);
      return null;
    }
  }

  /**
   * Update session title manually
   */
  async updateTitle(sessionId, title) {
    await database.updateSession(sessionId, { title, updateActivity: false });
  }
}

module.exports = SessionService;
