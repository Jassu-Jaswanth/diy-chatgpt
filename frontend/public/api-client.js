/**
 * DIY ChatGPT API Client
 * Follows the OpenAPI contract defined in api/openapi.yaml
 * @version 1.1.0
 */

const API_BASE = '/api';

/**
 * @typedef {Object} ChatRequest
 * @property {string} message
 * @property {string} [sessionId]
 * @property {string[]} [tools]
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} role
 * @property {string} content
 * @property {string} [toolUsed]
 * @property {Array<{title: string, url: string, snippet: string}>} [sources]
 * @property {string} [sessionId]
 */

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string|null} title
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} [lastActivityAt]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} role
 * @property {string} content
 * @property {string} [toolUsed]
 * @property {Array} [sources]
 * @property {number} createdAt
 * @property {boolean} [isSummarized]
 */

class APIClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make HTTP request with error handling
   * @private
   */
  async request(method, path, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============ Health ============

  /**
   * Check server health
   * @returns {Promise<{status: string, timestamp: string, environment: string, openaiConfigured: boolean}>}
   */
  async getHealth() {
    const response = await fetch('/health');
    return response.json();
  }

  // ============ Chat ============

  /**
   * Send a chat message
   * @param {ChatRequest} request
   * @returns {Promise<ChatResponse>}
   */
  async sendMessage(request) {
    return this.request('POST', '/chat', request);
  }

  // ============ Sessions ============

  /**
   * List all sessions
   * @param {number} [limit=50]
   * @returns {Promise<{sessions: Session[]}>}
   */
  async listSessions(limit = 50) {
    return this.request('GET', `/sessions?limit=${limit}`);
  }

  /**
   * Create a new session
   * @param {Object} [data]
   * @param {string} [data.title]
   * @param {Object} [data.metadata]
   * @returns {Promise<Session>}
   */
  async createSession(data = {}) {
    return this.request('POST', '/sessions', data);
  }

  /**
   * Get session by ID
   * @param {string} id - Session UUID
   * @returns {Promise<Session & {messages: Message[]}>}
   */
  async getSession(id) {
    return this.request('GET', `/sessions/${id}`);
  }

  /**
   * Update session
   * @param {string} id - Session UUID
   * @param {Object} data
   * @param {string} [data.title]
   * @returns {Promise<void>}
   */
  async updateSession(id, data) {
    return this.request('PATCH', `/sessions/${id}`, data);
  }

  /**
   * Delete session
   * @param {string} id - Session UUID
   * @returns {Promise<void>}
   */
  async deleteSession(id) {
    return this.request('DELETE', `/sessions/${id}`);
  }

  /**
   * Get session messages with pagination
   * @param {string} id - Session UUID
   * @param {number} [limit=50]
   * @param {string} [beforeId] - Message UUID for pagination
   * @returns {Promise<{messages: Message[]}>}
   */
  async getSessionMessages(id, limit = 50, beforeId = null) {
    let path = `/sessions/${id}/messages?limit=${limit}`;
    if (beforeId) path += `&before=${beforeId}`;
    return this.request('GET', path);
  }

  // ============ Search ============

  /**
   * Web search
   * @param {string} query
   * @param {number} [limit=10]
   * @returns {Promise<{results: Array<{title: string, url: string, snippet: string}>}>}
   */
  async search(query, limit = 10) {
    return this.request('POST', '/search', { query, limit });
  }

  /**
   * Fetch URL content
   * @param {string} url
   * @returns {Promise<{title: string, content: string, url: string}>}
   */
  async fetchUrl(url) {
    return this.request('POST', '/fetch', { url });
  }

  // ============ Study ============

  /**
   * Generate study lesson
   * @param {string} topic
   * @param {string} [level='intermediate']
   * @returns {Promise<{content: string, type: string}>}
   */
  async generateLesson(topic, level = 'intermediate') {
    return this.request('POST', '/study/lesson', { topic, level });
  }

  /**
   * Generate practice questions
   * @param {string} topic
   * @param {string} [level='intermediate']
   * @returns {Promise<{content: string, type: string}>}
   */
  async generatePractice(topic, level = 'intermediate') {
    return this.request('POST', '/study/practice', { topic, level });
  }

  /**
   * Generate flashcards
   * @param {string} topic
   * @param {string} [level='intermediate']
   * @returns {Promise<{content: string, type: string}>}
   */
  async generateFlashcards(topic, level = 'intermediate') {
    return this.request('POST', '/study/flashcards', { topic, level });
  }

  // ============ Research ============

  /**
   * Start deep research
   * @param {string} query
   * @param {string} [depth='standard']
   * @returns {Promise<{summary: string, findings: Array, sources: Array}>}
   */
  async research(query, depth = 'standard') {
    return this.request('POST', '/research', { query, depth });
  }

  /**
   * Quick research
   * @param {string} query
   * @returns {Promise<{summary: string, sources: Array}>}
   */
  async quickResearch(query) {
    return this.request('POST', '/research/quick', { query });
  }

  // ============ Export ============

  /**
   * Export content
   * @param {string} content
   * @param {string} format - pdf, markdown, docx, csv, txt
   * @param {string} [title]
   * @returns {Promise<{filename: string, path: string, format: string, size: number}>}
   */
  async exportContent(content, format, title) {
    return this.request('POST', '/export', { content, format, title });
  }

  /**
   * List exports
   * @returns {Promise<{exports: Array<{filename: string, size: number, createdAt: string}>}>}
   */
  async listExports() {
    return this.request('GET', '/exports');
  }

  /**
   * Delete export
   * @param {string} filename
   * @returns {Promise<void>}
   */
  async deleteExport(filename) {
    return this.request('DELETE', `/exports/${filename}`);
  }
}

// Export singleton instance
const api = new APIClient();
export default api;

// Also expose on window for non-module usage
if (typeof window !== 'undefined') {
  window.api = api;
  window.APIClient = APIClient;
}
