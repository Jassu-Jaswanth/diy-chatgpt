/**
 * Summarizer Service
 * 
 * Handles session summarization when cache expires:
 * 1. If last activity > 5 mins ago AND > 5 meaningful messages
 * 2. Generate recency-weighted summary
 * 3. Mark old messages as summarized
 * 4. Continue with summary + new messages
 */

const dbConfig = require('../../config/database');
const database = require('./storage/database');
const fileStorage = require('./storage/fileStorage');

class SummarizerService {
  constructor(openai) {
    this.openai = openai;
    this.config = dbConfig.session;
  }

  /**
   * Check if session needs summarization
   * Returns { needsSummary, reason }
   */
  async checkSummarizationNeeded(sessionId) {
    const session = await database.getSession(sessionId);
    if (!session) {
      return { needsSummary: false, reason: 'session_not_found' };
    }

    const now = Date.now();
    const lastActivity = session.lastActivityAt;
    const minutesSinceActivity = (now - lastActivity) / (1000 * 60);

    // Check if cache expired (> 5 mins)
    if (minutesSinceActivity <= this.config.cacheExpiryMinutes) {
      return { needsSummary: false, reason: 'cache_still_valid' };
    }

    // Check meaningful message count
    const meaningfulCount = await database.countMeaningfulMessages(sessionId);
    if (meaningfulCount < this.config.meaningfulMessageThreshold) {
      return { needsSummary: false, reason: 'not_enough_messages' };
    }

    return { 
      needsSummary: true, 
      reason: 'cache_expired_and_threshold_met',
      minutesSinceActivity,
      meaningfulCount
    };
  }

  /**
   * Generate a recency-weighted summary
   * 
   * Strategy:
   * - If previous summary exists: summary + new messages → new summary
   * - Weight recent messages higher
   * - Extract key instructions and facts
   * - Preserve user preferences and context
   */
  async generateSummary(sessionId) {
    console.log(`[Summarizer] Generating summary for session ${sessionId}`);

    // Get current summary if exists
    const currentSummary = await database.getCurrentSummary(sessionId);
    let previousSummaryText = null;
    
    if (currentSummary) {
      const summaryContent = await fileStorage.getSummary(sessionId, currentSummary.id);
      previousSummaryText = summaryContent?.summary;
      console.log(`[Summarizer] Building on previous summary (${currentSummary.tokens} tokens)`);
    }

    // Get unsummarized messages
    const messages = await database.getUnsummarizedMessages(sessionId);
    if (messages.length === 0) {
      console.log('[Summarizer] No unsummarized messages');
      return null;
    }

    // Load message contents
    const messageContents = await Promise.all(
      messages.map(async (msg) => {
        const content = await fileStorage.getMessage(sessionId, msg.id);
        return {
          id: msg.id,
          role: content.role,
          content: content.content,
          createdAt: msg.createdAt
        };
      })
    );

    // Build the summarization prompt
    const summaryPrompt = this.buildSummaryPrompt(previousSummaryText, messageContents);

    // Generate summary using cheap model
    const response = await this.openai.chat.completions.create({
      model: this.config.summaryModel,
      messages: [
        { role: 'system', content: this.getSummarizerSystemPrompt() },
        { role: 'user', content: summaryPrompt }
      ],
      max_tokens: 1000, // Summaries should be concise
      temperature: 0.3  // Low temperature for consistency
    });

    const summaryText = response.choices[0].message.content;
    const summaryTokens = response.usage?.total_tokens || 0;
    
    console.log(`[Summarizer] Generated summary (${summaryTokens} tokens)`);

    // Save summary to file
    const lastMessageId = messages[messages.length - 1].id;
    const summaryData = {
      summary: summaryText,
      coveredMessageIds: messages.map(m => m.id),
      tokens: summaryTokens,
      createdAt: Date.now()
    };

    const { v4: uuidv4 } = require('uuid');
    const summaryId = uuidv4();
    const filePath = await fileStorage.saveSummary(sessionId, summaryId, summaryData);

    // Save to database
    await database.createSummary(sessionId, {
      filePath: fileStorage.getRelativePath(filePath),
      tokens: summaryTokens,
      coversUntilMessageId: lastMessageId
    });

    // Mark messages as summarized
    await database.markMessagesSummarized(messages.map(m => m.id));

    return {
      summary: summaryText,
      coveredMessages: messages.length,
      tokens: summaryTokens
    };
  }

  /**
   * Build the summarization prompt with recency weighting
   */
  buildSummaryPrompt(previousSummary, messages) {
    let prompt = '';

    if (previousSummary) {
      prompt += `## Previous Conversation Summary\n${previousSummary}\n\n`;
      prompt += `## New Messages to Incorporate\n`;
    } else {
      prompt += `## Conversation to Summarize\n`;
    }

    // Add messages with recency indicators
    const total = messages.length;
    messages.forEach((msg, index) => {
      const recencyWeight = index >= total - 3 ? '[RECENT]' : '';
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      prompt += `${recencyWeight} ${role}: ${msg.content}\n\n`;
    });

    prompt += `\nGenerate a comprehensive summary following the guidelines.`;

    return prompt;
  }

  /**
   * System prompt for summarizer
   */
  getSummarizerSystemPrompt() {
    return `You are a conversation summarizer. Create concise but comprehensive summaries.

## Output Format
Provide a summary with these sections:

### Context
Brief description of what this conversation is about (1-2 sentences)

### Key Discussion Points
- Main topics discussed (bullet points)
- Important conclusions reached

### User Instructions & Preferences
- Any specific instructions the user gave
- Preferences or constraints mentioned
- These should be preserved for context

### Important Facts & Details
- Specific facts, numbers, or technical details mentioned
- Code snippets or examples if relevant (keep brief)

## Guidelines
1. **Recency Weighting**: Give more detail to [RECENT] messages - they represent the current focus
2. **Instruction Preservation**: User instructions should NEVER be lost
3. **Conciseness**: Keep under 500 words while preserving essential context
4. **Actionable**: The summary should allow continuing the conversation seamlessly
5. **No Opinions**: Just summarize, don't add interpretation`;
  }

  /**
   * Get context for new message (summary + unsummarized messages)
   */
  async getSessionContext(sessionId) {
    // Check if summarization needed first
    const { needsSummary, reason } = await this.checkSummarizationNeeded(sessionId);
    
    if (needsSummary) {
      console.log(`[Summarizer] Cache expired, generating summary...`);
      await this.generateSummary(sessionId);
    }

    // Get current summary
    const currentSummary = await database.getCurrentSummary(sessionId);
    let summaryText = null;
    
    if (currentSummary) {
      const summaryContent = await fileStorage.getSummary(sessionId, currentSummary.id);
      summaryText = summaryContent?.summary;
    }

    // Get unsummarized messages (the "active" conversation)
    const unsummarizedMsgs = await database.getUnsummarizedMessages(sessionId);
    const activeMessages = [];
    
    for (const msg of unsummarizedMsgs) {
      const content = await fileStorage.getMessage(sessionId, msg.id);
      if (content) {
        activeMessages.push({
          role: content.role,
          content: content.content
        });
      }
    }

    return {
      summary: summaryText,
      messages: activeMessages,
      hasSummary: !!summaryText,
      activeMessageCount: activeMessages.length
    };
  }
}

module.exports = SummarizerService;
