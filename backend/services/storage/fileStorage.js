/**
 * File Storage Service
 * Handles reading/writing message and summary content to filesystem
 * 
 * Structure:
 * data/sessions/{session_id}/messages/{message_id}.json
 * data/sessions/{session_id}/summaries/{summary_id}.json
 */

const fs = require('fs').promises;
const path = require('path');
const dbConfig = require('../../../config/database');

class FileStorage {
  constructor() {
    this.basePath = path.resolve(dbConfig.storage.basePath);
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  /**
   * Get session directory path
   */
  getSessionPath(sessionId) {
    return path.join(this.basePath, sessionId);
  }

  /**
   * Get message file path
   */
  getMessagePath(sessionId, messageId) {
    return path.join(this.basePath, sessionId, 'messages', `${messageId}.json`);
  }

  /**
   * Get summary file path
   */
  getSummaryPath(sessionId, summaryId) {
    return path.join(this.basePath, sessionId, 'summaries', `${summaryId}.json`);
  }

  /**
   * Save message content to file
   */
  async saveMessage(sessionId, messageId, data) {
    const filePath = this.getMessagePath(sessionId, messageId);
    await this.ensureDir(path.dirname(filePath));
    
    const content = {
      id: messageId,
      session_id: sessionId,
      role: data.role,
      content: data.content,
      tool_used: data.toolUsed || null,
      sources: data.sources || null,
      metadata: data.metadata || null,
      created_at: data.createdAt || Date.now()
    };
    
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Read message content from file
   */
  async getMessage(sessionId, messageId) {
    const filePath = this.getMessagePath(sessionId, messageId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Save summary content to file
   */
  async saveSummary(sessionId, summaryId, data) {
    const filePath = this.getSummaryPath(sessionId, summaryId);
    await this.ensureDir(path.dirname(filePath));
    
    const content = {
      id: summaryId,
      session_id: sessionId,
      summary: data.summary,
      covered_message_ids: data.coveredMessageIds,
      tokens: data.tokens,
      created_at: data.createdAt || Date.now()
    };
    
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Read summary content from file
   */
  async getSummary(sessionId, summaryId) {
    const filePath = this.getSummaryPath(sessionId, summaryId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Delete session directory and all contents
   */
  async deleteSession(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Get relative path for database storage
   */
  getRelativePath(absolutePath) {
    return path.relative(this.basePath, absolutePath);
  }
}

module.exports = new FileStorage();
