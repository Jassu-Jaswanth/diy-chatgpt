const fs = require('fs').promises;
const path = require('path');

class MemoryService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.memoryFile = path.join(this.dataDir, 'memory.json');
    this.conversationsDir = path.join(this.dataDir, 'conversations');
    this.maxShortTermMemory = 50;
    this.shortTermMemory = [];
    this.longTermMemory = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.conversationsDir, { recursive: true });
      
      // Load existing memory
      try {
        const data = await fs.readFile(this.memoryFile, 'utf8');
        const parsed = JSON.parse(data);
        this.shortTermMemory = parsed.shortTerm || [];
        this.longTermMemory = parsed.longTerm || [];
      } catch (e) {
        // No existing memory file
        this.shortTermMemory = [];
        this.longTermMemory = [];
      }
      
      this.initialized = true;
      console.log(`[Memory] Initialized with ${this.shortTermMemory.length} short-term and ${this.longTermMemory.length} long-term memories`);
    } catch (error) {
      console.error('[Memory] Initialization error:', error);
    }
  }

  async persist() {
    try {
      await fs.writeFile(this.memoryFile, JSON.stringify({
        shortTerm: this.shortTermMemory,
        longTerm: this.longTermMemory,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.error('[Memory] Persist error:', error);
    }
  }

  // Add to short-term memory
  async addShortTerm(content, metadata = {}) {
    await this.initialize();
    
    const memory = {
      id: `stm_${Date.now()}`,
      content,
      metadata,
      timestamp: new Date().toISOString(),
      type: 'short_term'
    };
    
    this.shortTermMemory.push(memory);
    
    // Limit size
    if (this.shortTermMemory.length > this.maxShortTermMemory) {
      // Move oldest to long-term if important
      const oldest = this.shortTermMemory.shift();
      if (oldest.metadata?.important) {
        this.longTermMemory.push({ ...oldest, type: 'long_term' });
      }
    }
    
    await this.persist();
    return memory;
  }

  // Add to long-term memory (explicit save)
  async addLongTerm(content, metadata = {}) {
    await this.initialize();
    
    const memory = {
      id: `ltm_${Date.now()}`,
      content,
      metadata,
      timestamp: new Date().toISOString(),
      type: 'long_term'
    };
    
    this.longTermMemory.push(memory);
    await this.persist();
    return memory;
  }

  // Search memories (simple keyword search)
  async search(query, options = {}) {
    await this.initialize();
    
    const { type = 'all', limit = 10 } = options;
    const queryLower = query.toLowerCase();
    
    let memories = [];
    
    if (type === 'all' || type === 'short_term') {
      memories = memories.concat(this.shortTermMemory);
    }
    if (type === 'all' || type === 'long_term') {
      memories = memories.concat(this.longTermMemory);
    }
    
    // Simple relevance scoring
    const scored = memories.map(m => {
      const contentLower = m.content.toLowerCase();
      let score = 0;
      
      // Exact phrase match
      if (contentLower.includes(queryLower)) {
        score += 10;
      }
      
      // Word matches
      const queryWords = queryLower.split(/\s+/);
      for (const word of queryWords) {
        if (word.length > 2 && contentLower.includes(word)) {
          score += 2;
        }
      }
      
      // Recency bonus
      const age = Date.now() - new Date(m.timestamp).getTime();
      const daysSinceCreation = age / (1000 * 60 * 60 * 24);
      score += Math.max(0, 5 - daysSinceCreation);
      
      return { ...m, relevanceScore: score };
    });
    
    return scored
      .filter(m => m.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  // Get recent memories
  async getRecent(count = 10, type = 'all') {
    await this.initialize();
    
    let memories = [];
    
    if (type === 'all' || type === 'short_term') {
      memories = memories.concat(this.shortTermMemory);
    }
    if (type === 'all' || type === 'long_term') {
      memories = memories.concat(this.longTermMemory);
    }
    
    return memories
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, count);
  }

  // Get context for AI (formatted recent + relevant memories)
  async getContext(currentQuery, maxTokens = 1000) {
    await this.initialize();
    
    // Get recent memories
    const recent = await this.getRecent(5, 'short_term');
    
    // Get relevant long-term memories
    const relevant = await this.search(currentQuery, { type: 'long_term', limit: 3 });
    
    // Format for AI context
    let context = '';
    
    if (relevant.length > 0) {
      context += 'Relevant saved information:\n';
      relevant.forEach(m => {
        context += `- ${m.content}\n`;
      });
      context += '\n';
    }
    
    if (recent.length > 0) {
      context += 'Recent conversation context:\n';
      recent.forEach(m => {
        context += `- ${m.content}\n`;
      });
    }
    
    // Truncate if too long (rough estimate)
    if (context.length > maxTokens * 4) {
      context = context.substring(0, maxTokens * 4) + '...';
    }
    
    return context;
  }

  // Save a conversation
  async saveConversation(conversationId, messages, metadata = {}) {
    await this.initialize();
    
    const conversation = {
      id: conversationId,
      messages,
      metadata,
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const filepath = path.join(this.conversationsDir, `${conversationId}.json`);
    await fs.writeFile(filepath, JSON.stringify(conversation, null, 2));
    
    return conversation;
  }

  // Load a conversation
  async loadConversation(conversationId) {
    const filepath = path.join(this.conversationsDir, `${conversationId}.json`);
    
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // List all conversations
  async listConversations() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.conversationsDir);
      const conversations = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(this.conversationsDir, file);
          const data = await fs.readFile(filepath, 'utf8');
          const conv = JSON.parse(data);
          conversations.push({
            id: conv.id,
            messageCount: conv.messages?.length || 0,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            title: conv.metadata?.title || conv.messages?.[0]?.content?.substring(0, 50)
          });
        }
      }
      
      return conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (error) {
      return [];
    }
  }

  // Delete a memory
  async deleteMemory(memoryId) {
    await this.initialize();
    
    this.shortTermMemory = this.shortTermMemory.filter(m => m.id !== memoryId);
    this.longTermMemory = this.longTermMemory.filter(m => m.id !== memoryId);
    
    await this.persist();
    return { success: true, deleted: memoryId };
  }

  // Clear all short-term memory
  async clearShortTerm() {
    await this.initialize();
    this.shortTermMemory = [];
    await this.persist();
    return { success: true, cleared: 'short_term' };
  }

  // Clear all memory
  async clearAll() {
    await this.initialize();
    this.shortTermMemory = [];
    this.longTermMemory = [];
    await this.persist();
    return { success: true, cleared: 'all' };
  }

  // Get memory stats
  async getStats() {
    await this.initialize();
    
    return {
      shortTermCount: this.shortTermMemory.length,
      longTermCount: this.longTermMemory.length,
      maxShortTerm: this.maxShortTermMemory,
      oldestShortTerm: this.shortTermMemory[0]?.timestamp,
      newestMemory: this.shortTermMemory[this.shortTermMemory.length - 1]?.timestamp ||
                    this.longTermMemory[this.longTermMemory.length - 1]?.timestamp
    };
  }
}

module.exports = MemoryService;
