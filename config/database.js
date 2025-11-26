/**
 * Database Configuration
 * PostgreSQL connection settings
 */

module.exports = {
  // PostgreSQL connection
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'diy_chatgpt',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    max: 10, // Max pool connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // File storage settings
  storage: {
    basePath: process.env.STORAGE_PATH || './data/sessions',
    // Future: S3 config
    // s3: {
    //   bucket: process.env.S3_BUCKET,
    //   region: process.env.S3_REGION,
    // }
  },

  // Session settings
  session: {
    cacheExpiryMinutes: 5,           // API cache expiry time
    meaningfulMessageThreshold: 5,   // Messages before summarization kicks in
    summaryModel: 'gpt-4o-mini',     // Cheap model for summarization
    titleModel: 'gpt-4o-mini',       // Model for auto-titling
    defaultPageSize: 4,              // Default messages per page (2 user + 2 agent)
  }
};
