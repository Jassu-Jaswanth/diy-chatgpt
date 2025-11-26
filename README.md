# DIY ChatGPT Assistant 🤖

A personal, pay-as-you-go ChatGPT-style assistant using OpenAI API with web search, study mode, deep research capabilities, and file export features.

## Features

- ✅ **Chat Interface** - Open WebUI or LibreChat integration
- 🔍 **Web Search** - Real-time web search with citations
- 📚 **Study Mode** - Lessons, practice questions, and flashcards
- 🔬 **Deep Research** - Multi-step research agent with source synthesis
- 📁 **File Export** - PDF, Markdown, CSV, DOCX export capabilities
- 🧠 **Memory System** - Short-term and long-term memory with vector DB
- 💰 **Pay-as-you-go** - Direct OpenAI API usage, no subscription

## Quick Start

### Prerequisites
- Linux/Mac/WSL2
- Node.js 18+ or Python 3.10+
- OpenAI API key
- ~$5-20/month for API usage

### Installation

1. **Clone and setup:**
```bash
git clone [your-repo-url]
cd diy-chatgpt
chmod +x setup.sh
./setup.sh
```

2. **Configure API keys:**
```bash
nano .env
# Add your OpenAI API key and optional search API keys
```

3. **Test connection:**
```bash
node scripts/test-openai.js
```

4. **Start the application:**
```bash
./start.sh
# Or manually:
# Terminal 1: cd backend && node server.js
# Terminal 2: cd open-webui && npm run dev
```

5. **Access:**
- Web UI: http://localhost:3000
- Backend API: http://localhost:3001

## Project Structure

```
diy-chatgpt/
├── backend/            # Express server & services
│   ├── server.js      # Main server file
│   └── services/      # Feature modules
├── open-webui/        # UI framework (cloned)
├── config/            # Configuration files
│   └── prompts/       # Prompt templates
├── data/             # Local storage & memory
├── exports/          # Generated files (PDF, CSV, etc.)
├── scripts/          # Utility scripts
└── .env             # API keys and configuration
```

## Implementation Phases

### Phase 0: Environment Setup ✅
- System prerequisites
- API accounts
- Project structure

### Phase 1: Basic Chat ✅
- OpenAI integration
- Web UI setup
- Basic chat functionality

### Phase 2: Web Search 🔍
- Search API integration (DuckDuckGo/SerpAPI/Bing)
- Content extraction
- Citation management

### Phase 3: Study Mode 📚
- Lesson generation
- Practice questions
- Flashcard creation

### Phase 4: Deep Research 🔬
- Research planning
- Multi-source synthesis
- Citation tracking

### Phase 5: File Export 📁
- PDF generation
- Markdown/CSV/DOCX export
- Batch export capabilities

### Phase 6: Memory System 🧠
- Short-term conversation memory
- Long-term vector storage (Chroma)
- Context retrieval

### Phase 7: Production Deployment 🚀
- Docker containerization
- PM2 process management
- Nginx reverse proxy

## API Endpoints

### Chat
- `POST /api/chat` - Send chat messages
- `GET /api/chat/history` - Get chat history

### Search
- `POST /api/search` - Web search
- `POST /api/fetch-content` - Fetch and parse web content

### Study Mode
- `POST /api/study/lesson` - Generate lesson
- `POST /api/study/practice` - Generate practice questions
- `POST /api/study/flashcards` - Create flashcards

### Research
- `POST /api/research` - Deep research on topic

### Export
- `POST /api/export` - Export to various formats
- `GET /api/download/:filename` - Download exported file

### Memory
- `POST /api/memory/add` - Add to memory
- `GET /api/memory/recall` - Retrieve memories
- `DELETE /api/memory/clear` - Clear memory

## Configuration

Edit `.env` file:

```env
# OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000

# Search (choose one)
SEARCH_PROVIDER=duckduckgo
SERPAPI_KEY=your-key
BING_API_KEY=your-key

# Server
PORT=3001
NODE_ENV=development
```

## Testing

Run test scripts:

```bash
# Test environment
./scripts/test-env.sh

# Test OpenAI connection
node scripts/test-openai.js

# Test all endpoints
npm test
```

## Cost Estimation

- **Light use**: ~$5-10/month
- **Regular use**: ~$10-20/month  
- **Heavy research**: ~$20-50/month

Monitor usage:
```bash
# Check logs for token usage
tail -f logs/usage.log
```

## Docker Deployment

```bash
# Build and run with Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Troubleshooting

### OpenAI API Error
- Check API key in `.env`
- Verify billing/credits on OpenAI dashboard
- Check rate limits

### Search Not Working
- Verify search API credentials
- Check network connectivity
- Try different search provider

### Export Failed
- Ensure pandoc is installed: `sudo apt install pandoc`
- Check exports directory permissions
- Verify sufficient disk space

### Memory Issues
- Clear Chrome vector DB: `rm -rf data/chroma`
- Reset short-term memory in UI
- Check Python chromadb installation

## Security

- **Never commit `.env` file**
- Use environment variables for production
- Enable rate limiting for public deployment
- Regularly rotate API keys
- Monitor usage and costs

## Contributing

1. Fork the repository
2. Create feature branch
3. Test thoroughly
4. Submit pull request

## License

MIT License - See LICENSE file

## Support

- Check IMPLEMENTATION_PLAN.md for detailed setup
- Review project.md for original specifications
- Open an issue for bugs/features

---

Built with ❤️ using OpenAI API and open-source tools
