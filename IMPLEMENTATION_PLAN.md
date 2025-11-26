# DIY ChatGPT - Implementation Plan

## Project Structure
```
diy-chatgpt/
├── .env                 # API keys and config
├── .gitignore          # Git ignore rules
├── package.json        # Node dependencies
├── docker-compose.yml  # Docker setup (optional)
├── README.md           # Project documentation
├── backend/            # Custom backend
│   ├── server.js       # Express server
│   └── services/       # Service modules
├── config/             # Configuration files
│   └── prompts/        # Prompt templates
├── data/              # Local storage/memory
├── exports/           # Generated files
├── scripts/           # Utility scripts
└── open-webui/        # UI framework (cloned)
```

## Phase 0: Environment Setup (2-3 hours)

### 0.1 System Prerequisites
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install core tools
sudo apt install -y git curl wget build-essential

# Install Node.js v18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.10+
sudo apt install -y python3.10 python3-pip python3-venv

# Install Docker (optional)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### 0.2 API Keys Setup
1. **OpenAI**: https://platform.openai.com → Create API key → Set $20 monthly limit
2. **Search API** (choose one):
   - SerpAPI: https://serpapi.com (100 free/month)
   - Bing: Azure account required
   - DuckDuckGo: No API key needed

### 0.3 Project Setup
```bash
mkdir ~/diy-chatgpt && cd ~/diy-chatgpt
mkdir -p {backend,config,data,exports,scripts,logs}

# Create .env file
cat > .env << 'EOF'
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
SEARCH_PROVIDER=duckduckgo
SERPAPI_KEY=optional
PORT=3001
NODE_ENV=development
EOF

chmod 600 .env
```

### Test 0: Environment Check
```bash
cat > scripts/test-env.sh << 'EOF'
#!/bin/bash
echo "=== Environment Check ==="
[ -f .env ] && echo "✓ .env exists" || echo "✗ .env missing"
node -v && echo "✓ Node.js ready" || echo "✗ Node missing"
python3 --version && echo "✓ Python ready" || echo "✗ Python missing"
EOF
chmod +x scripts/test-env.sh && ./scripts/test-env.sh
```

---

## Phase 1: Basic Chat Interface (3-4 hours)

### 1.1 Install Open WebUI
```bash
cd ~/diy-chatgpt
git clone https://github.com/open-webui/open-webui.git
cd open-webui
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
```

### 1.2 Create Backend Server
```bash
cd ~/diy-chatgpt/backend
npm init -y
npm install express cors dotenv openai body-parser helmet morgan

cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/chat', async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: req.body.messages,
      max_tokens: 2000
    });
    res.json(completion.choices[0].message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 3001);
EOF
```

### Test 1: Chat Working
```bash
# Terminal 1: Start backend
cd ~/diy-chatgpt/backend && node server.js

# Terminal 2: Test API
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# Terminal 3: Start UI
cd ~/diy-chatgpt/open-webui && npm run dev
# Visit http://localhost:3000
```

---

## Phase 2: Web Search (4-5 hours)

### 2.1 Install Dependencies
```bash
cd ~/diy-chatgpt/backend
npm install axios cheerio jsdom @mozilla/readability
```

### 2.2 Search Service
```bash
mkdir -p services
cat > services/search.js << 'EOF'
const axios = require('axios');

async function searchDuckDuckGo(query) {
  const response = await axios.get('https://html.duckduckgo.com/html/', {
    params: { q: query },
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  // Parse HTML for results
  return []; // Simplified
}

async function searchSerpAPI(query) {
  const response = await axios.get('https://serpapi.com/search', {
    params: { q: query, api_key: process.env.SERPAPI_KEY }
  });
  return response.data.organic_results;
}

module.exports = { searchDuckDuckGo, searchSerpAPI };
EOF
```

### 2.3 Content Fetcher
```bash
cat > services/fetcher.js << 'EOF'
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

async function fetchContent(url) {
  const { data } = await axios.get(url, { timeout: 10000 });
  const dom = new JSDOM(data, { url });
  const article = new Readability(dom.window.document).parse();
  return { title: article.title, content: article.textContent, url };
}

module.exports = { fetchContent };
EOF
```

### Test 2: Search Working
```bash
# Add search endpoint to server.js, restart server
# Test search
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"OpenAI GPT-4"}'
```

---

## Phase 3: Study Mode (3-4 hours)

### 3.1 Prompt Templates
```bash
mkdir -p ~/diy-chatgpt/config/prompts
cat > config/prompts/study.json << 'EOF'
{
  "system": "You are an expert tutor. Use the Feynman technique.",
  "lesson": "Create a lesson on {topic} for {level} level with examples.",
  "practice": "Generate 5 practice questions on {topic} with answers.",
  "flashcards": "Create 10 flashcards as CSV: Question,Answer,Difficulty"
}
EOF
```

### 3.2 Study Service
```bash
cat > services/study.js << 'EOF'
const OpenAI = require('openai');
const prompts = require('../config/prompts/study.json');

class StudyService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateLesson(topic, level = 'intermediate') {
    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.lesson.replace('{topic}', topic).replace('{level}', level) }
      ]
    });
    return response.choices[0].message.content;
  }
}

module.exports = StudyService;
EOF
```

### Test 3: Study Mode
```bash
# Add study endpoints to server.js, restart
curl -X POST http://localhost:3001/api/study/lesson \
  -H "Content-Type: application/json" \
  -d '{"topic":"JavaScript Promises","level":"beginner"}'
```

---

## Phase 4: Research Agent (5-6 hours)

### 4.1 Research Service
```bash
cat > services/research.js << 'EOF'
class ResearchAgent {
  async research(question, depth = 2) {
    // 1. Plan: Generate search queries
    const queries = await this.planResearch(question);
    
    // 2. Search: Execute searches
    const results = await this.executeSearches(queries);
    
    // 3. Fetch: Get content from URLs
    const content = await this.fetchContent(results);
    
    // 4. Synthesize: Create summary with citations
    return await this.synthesize(question, content);
  }
}

module.exports = ResearchAgent;
EOF
```

### Test 4: Research
```bash
curl -X POST http://localhost:3001/api/research \
  -H "Content-Type: application/json" \
  -d '{"question":"Latest quantum computing breakthroughs"}'
```

---

## Phase 5: File Export (4-5 hours)

### 5.1 Install Tools
```bash
sudo apt install pandoc texlive-latex-base
npm install marked pdfkit json2csv exceljs docx
```

### 5.2 Export Service
```bash
cat > services/export.js << 'EOF'
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

class ExportService {
  async exportToPDF(content, filename) {
    const mdPath = `../exports/${filename}.md`;
    const pdfPath = `../exports/${filename}.pdf`;
    await fs.writeFile(mdPath, content);
    await promisify(exec)(`pandoc ${mdPath} -o ${pdfPath}`);
    return pdfPath;
  }
}

module.exports = ExportService;
EOF
```

### Test 5: Export
```bash
curl -X POST http://localhost:3001/api/export \
  -H "Content-Type: application/json" \
  -d '{"content":"# Test\nContent","format":"pdf","filename":"test"}'
```

---

## Phase 6: Memory System (4-5 hours)

### 6.1 Install Chroma
```bash
pip3 install chromadb
```

### 6.2 Memory Service
```bash
cat > services/memory.js << 'EOF'
class MemoryService {
  constructor() {
    this.shortTerm = [];
    this.maxShortTerm = 20;
  }

  async addMemory(content) {
    this.shortTerm.push({ timestamp: new Date(), content });
    if (this.shortTerm.length > this.maxShortTerm) {
      this.shortTerm.shift();
    }
  }

  getContext(n = 5) {
    return this.shortTerm.slice(-n);
  }
}

module.exports = MemoryService;
EOF
```

### Test 6: Memory
```bash
# Test memory endpoints
curl -X POST http://localhost:3001/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"content":"User prefers dark mode"}'
```

---

## Phase 7: Production Deployment (3-4 hours)

### 7.1 Docker Setup
```bash
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "backend/server.js"]
EOF

cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3001:3001"
    env_file: .env
    volumes:
      - ./exports:/app/exports
      - ./data:/app/data
  
  webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      - OPENAI_API_BASE=http://backend:3001/api
    volumes:
      - ./open-webui:/app/backend/data
EOF
```

### 7.2 PM2 Setup (Alternative)
```bash
npm install -g pm2
pm2 start backend/server.js --name diy-chatgpt
pm2 startup
pm2 save
```

### 7.3 Nginx Reverse Proxy
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/chatgpt

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
    
    location /api {
        proxy_pass http://localhost:3001;
    }
}

sudo ln -s /etc/nginx/sites-available/chatgpt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

### Test 7: Production
```bash
# Docker deployment
docker-compose up -d

# Check status
docker-compose ps
curl http://localhost:3000
```

---

## Testing Checkpoints

Each phase has specific test points:

1. **Phase 0**: Environment variables set, tools installed
2. **Phase 1**: Basic chat returns OpenAI responses
3. **Phase 2**: Web search returns URLs and summaries
4. **Phase 3**: Study mode generates lessons and flashcards
5. **Phase 4**: Research agent completes full cycle
6. **Phase 5**: Files export to PDF/CSV successfully
7. **Phase 6**: Memory persists across sessions
8. **Phase 7**: Application accessible via domain/IP

## Cost Monitoring

```bash
cat > scripts/monitor-usage.js << 'EOF'
// Add to backend for usage tracking
const usage = {
  tokens: 0,
  requests: 0,
  cost: 0
};

// Log after each OpenAI call
usage.tokens += response.usage.total_tokens;
usage.cost += (response.usage.total_tokens / 1000) * 0.002;
console.log(`Usage: ${usage.tokens} tokens, $${usage.cost.toFixed(4)}`);
EOF
```

## Quick Commands Reference

```bash
# Start development
cd ~/diy-chatgpt
npm run dev

# Start production
docker-compose up -d

# View logs
docker-compose logs -f

# Backup data
tar -czf backup.tar.gz data/ exports/

# Reset everything
docker-compose down -v
rm -rf data/* exports/*
```
