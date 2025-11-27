# DIY ChatGPT - Production Dockerfile
FROM node:22-alpine

# Install dependencies for native modules and Chromium for Puppeteer
RUN apk add --no-cache python3 make g++ chromium

# Skip Puppeteer's bundled Chromium download - use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies (faster without Chromium download)
RUN npm ci --only=production --ignore-scripts && \
    npm rebuild

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data/sessions

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start server
CMD ["node", "backend/server.js"]
