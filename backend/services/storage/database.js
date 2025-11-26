/**
 * PostgreSQL Database Service
 * Handles session and message metadata (not content)
 * Content is stored in filesystem, only references stored here
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const dbConfig = require('../../../config/database');

class Database {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and schema
   */
  async initialize() {
    if (this.initialized) return;

    this.pool = new Pool(dbConfig.postgres);
    
    // Test connection
    try {
      const client = await this.pool.connect();
      console.log('[Database] Connected to PostgreSQL');
      client.release();
    } catch (err) {
      console.error('[Database] Connection failed:', err.message);
      throw err;
    }

    // Create schema
    await this.createSchema();
    this.initialized = true;
  }

  /**
   * Create database schema
   */
  async createSchema() {
    const schema = `
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        title TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        last_activity_at BIGINT NOT NULL,
        current_summary_id UUID,
        metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Messages table (only references, no content)
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        file_path TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        is_summarized BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL
      );

      -- Summaries table
      CREATE TABLE IF NOT EXISTS summaries (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        covers_until_message_id UUID,
        created_at BIGINT NOT NULL
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_messages_session_created 
        ON messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated 
        ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_activity 
        ON sessions(last_activity_at DESC);
      CREATE INDEX IF NOT EXISTS idx_summaries_session 
        ON summaries(session_id, created_at DESC);
    `;

    try {
      await this.pool.query(schema);
      console.log('[Database] Schema initialized');
    } catch (err) {
      console.error('[Database] Schema creation failed:', err.message);
      throw err;
    }
  }

  // ==================== SESSION OPERATIONS ====================

  /**
   * Create a new session
   */
  async createSession(title = null) {
    const id = uuidv4();
    const now = Date.now();
    
    await this.pool.query(
      `INSERT INTO sessions (id, title, created_at, updated_at, last_activity_at)
       VALUES ($1, $2, $3, $3, $3)`,
      [id, title, now]
    );
    
    return { id, title, createdAt: now, updatedAt: now, lastActivityAt: now };
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    const result = await this.pool.query(
      `SELECT id, title, created_at, updated_at, last_activity_at, 
              current_summary_id, metadata
       FROM sessions WHERE id = $1`,
      [sessionId]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      createdAt: parseInt(row.created_at),
      updatedAt: parseInt(row.updated_at),
      lastActivityAt: parseInt(row.last_activity_at),
      currentSummaryId: row.current_summary_id,
      metadata: row.metadata
    };
  }

  /**
   * List sessions with pagination
   */
  async listSessions(limit = 20, offset = 0) {
    const result = await this.pool.query(
      `SELECT id, title, created_at, updated_at, last_activity_at, metadata
       FROM sessions
       ORDER BY last_activity_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const countResult = await this.pool.query('SELECT COUNT(*) FROM sessions');
    const total = parseInt(countResult.rows[0].count);
    
    return {
      sessions: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        createdAt: parseInt(row.created_at),
        updatedAt: parseInt(row.updated_at),
        lastActivityAt: parseInt(row.last_activity_at),
        metadata: row.metadata
      })),
      total,
      limit,
      offset
    };
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.currentSummaryId !== undefined) {
      fields.push(`current_summary_id = $${paramIndex++}`);
      values.push(updates.currentSummaryId);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    fields.push(`updated_at = $${paramIndex++}`);
    values.push(Date.now());

    if (updates.updateActivity !== false) {
      fields.push(`last_activity_at = $${paramIndex++}`);
      values.push(Date.now());
    }

    values.push(sessionId);

    await this.pool.query(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    await this.pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  // ==================== MESSAGE OPERATIONS ====================

  /**
   * Create message reference
   */
  async createMessage(sessionId, data) {
    const id = data.id || uuidv4();  // Use provided ID or generate new one
    const now = Date.now();
    
    await this.pool.query(
      `INSERT INTO messages (id, session_id, role, file_path, tokens, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, sessionId, data.role, data.filePath, data.tokens || 0, now]
    );

    // Update session activity
    await this.pool.query(
      `UPDATE sessions SET last_activity_at = $1, updated_at = $1 WHERE id = $2`,
      [now, sessionId]
    );
    
    return { id, sessionId, role: data.role, filePath: data.filePath, createdAt: now };
  }

  /**
   * Get messages for session with pagination
   * Returns newest first, for reverse chronological loading
   */
  async getMessages(sessionId, limit = 50, beforeId = null) {
    let query = `
      SELECT id, session_id, role, file_path, tokens, is_summarized, created_at
      FROM messages
      WHERE session_id = $1
    `;
    const params = [sessionId];

    if (beforeId) {
      query += ` AND created_at < (SELECT created_at FROM messages WHERE id = $2)`;
      params.push(beforeId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      filePath: row.file_path,
      tokens: row.tokens,
      isSummarized: row.is_summarized,
      createdAt: parseInt(row.created_at)
    })).reverse(); // Return in chronological order
  }

  /**
   * Get all unsummarized messages for a session
   */
  async getUnsummarizedMessages(sessionId) {
    const result = await this.pool.query(
      `SELECT id, session_id, role, file_path, tokens, created_at
       FROM messages
       WHERE session_id = $1 AND is_summarized = FALSE
       ORDER BY created_at ASC`,
      [sessionId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      filePath: row.file_path,
      tokens: row.tokens,
      createdAt: parseInt(row.created_at)
    }));
  }

  /**
   * Mark messages as summarized
   */
  async markMessagesSummarized(messageIds) {
    if (messageIds.length === 0) return;
    
    await this.pool.query(
      `UPDATE messages SET is_summarized = TRUE WHERE id = ANY($1)`,
      [messageIds]
    );
  }

  /**
   * Count meaningful messages (assistant responses, not system)
   */
  async countMeaningfulMessages(sessionId) {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM messages 
       WHERE session_id = $1 AND role = 'assistant' AND is_summarized = FALSE`,
      [sessionId]
    );
    return parseInt(result.rows[0].count);
  }

  // ==================== SUMMARY OPERATIONS ====================

  /**
   * Create summary reference
   */
  async createSummary(sessionId, data) {
    const id = uuidv4();
    const now = Date.now();
    
    await this.pool.query(
      `INSERT INTO summaries (id, session_id, file_path, tokens, covers_until_message_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, sessionId, data.filePath, data.tokens || 0, data.coversUntilMessageId, now]
    );

    // Update session's current summary
    await this.pool.query(
      `UPDATE sessions SET current_summary_id = $1, updated_at = $2 WHERE id = $3`,
      [id, now, sessionId]
    );
    
    return { id, sessionId, filePath: data.filePath, createdAt: now };
  }

  /**
   * Get current summary for session
   */
  async getCurrentSummary(sessionId) {
    const result = await this.pool.query(
      `SELECT s.id, s.session_id, s.file_path, s.tokens, s.covers_until_message_id, s.created_at
       FROM summaries s
       JOIN sessions sess ON sess.current_summary_id = s.id
       WHERE sess.id = $1`,
      [sessionId]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      filePath: row.file_path,
      tokens: row.tokens,
      coversUntilMessageId: row.covers_until_message_id,
      createdAt: parseInt(row.created_at)
    };
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
    }
  }
}

module.exports = new Database();
