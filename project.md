# DIY ChatGPT-style Assistant — Project Plan

**Goal:** Build a personal, pay‑as‑you‑go ChatGPT‑like assistant using OpenAI API + open‑source UI/tools. Minimal coding, fast setup, focused on power over aesthetics. Achieve ~75–90% of ChatGPT features (web search, study mode, deep research, shopping, file export).

---

## 1. Project Overview

**Scope (MVP):**
- Chat interface (open-source UI) that connects to OpenAI API (pay‑as‑you‑go).
- Web search integration (SerpAPI / Bing / DuckDuckGo) for browsing and citations.
- Study mode (prompt templates + flashcard generator).
- Deep research (one-agent loop: search → fetch → summarize → iterate).
- File export: PDF, Markdown, CSV.
- Simple memory: short-term conversation history + optional vector DB (Chroma).
- Lightweight deployment: local or small cloud instance (e.g., VPS).

**Out of scope (for MVP):**
- Polished React components (callouts, accordions) beyond Markdown.
- Full shopping aggregator UI (basic price scraping allowed).
- Large-scale parallel agents or multi-user management.

---

## 2. Tech Stack (recommended)

- **Open-source UI:** Open WebUI or LibreChat (pick one)
- **Backend (optional):** Node.js or Python (FastAPI) for glue logic
- **Search APIs:** SerpAPI (paid) or Bing Search API or DuckDuckGo (free)
- **Vector DB (memory):** Chroma or SQLite + FAISS
- **File generation:** Pandoc (for PDF), python-docx, openpyxl, or js libraries
- **Hosting:** Local machine or small VPS (1–2 vCPU, 2–4 GB RAM)
- **Tools:** Git, Docker (optional)

---

## 3. Minimal Requirements & Accounts

1. OpenAI account + API key (pay-as-you-go; start with $5–20 credit).
2. SerpAPI / Bing API key (optional but recommended for reliable web search).
3. GitHub (for cloning repos).
4. Local machine with Node.js (v18+) or Python 3.10+.

---

## 4. Security & Cost Considerations

- Protect API keys (use .env files, never hardcode).
- Monitor token usage — set monthly budget or alerts on OpenAI dashboard.
- For sensitive data, do not send to third‑party search APIs without review.
- Estimate cost: light use (~$5–$20/month). Heavy research may cost more.

---

## 5. MVP Implementation Plan (Step-by-step)

### Step 0 — Prep (15–30 min)
- Create OpenAI API key and fund account.
- Create SerpAPI/Bing key (if using).
- Install Node.js or Python.
- Clone chosen UI repo (Open WebUI or LibreChat).

### Step 1 — Run UI locally (15–30 min)
- Follow repo README to install dependencies and start the app.
- Configure your OpenAI API key in the app (.env or UI settings).
- Verify basic chat works (send a simple prompt).

### Step 2 — Add Web Search plugin (30–60 min)
- Install or enable the search plugin supported by the UI.
- Configure SerpAPI/Bing key.
- Test: ask the assistant to search a query and return top URLs + short summary.

### Step 3 — Add Study Mode (15–30 min)
- Create a prompt template (system + user) for tutoring and spaced practice.
- Add a button/template in the UI for “Study Mode.”
- Test: ask for a lesson breakdown, examples, and practice questions.

### Step 4 — Add Deep Research (30–90 min)
- Implement simple agent loop (Planner → Search → Fetch → Summarize):
  - Planner: ask model to produce search queries.
  - Search: call search API for top N results.
  - Fetch: download page text (readability + boilerpipe or simple HTML extract).
  - Summarize: call model to extract key points and generate citations.
- Add parameters: max depth (2–4), result limit (5–20).
- Test with a research question and iterate.

### Step 5 — Add File Export (15–60 min)
- Provide an export function that converts chat or summary to Markdown.
- Use Pandoc (local) or a Python library to convert to PDF.
- Add CSV/XLSX export for tabular outputs.
- Test downloads.

### Step 6 — Add Memory (optional, 30–60 min)
- Implement short-term memory via conversation history.
- For long-term memory, integrate Chroma: store embeddings of important notes.
- Add a UI toggle to clear/save memory.

### Step 7 — Polish & Automation (optional)
- Add prompt presets (Study, Research, Shopping, Summarize, Compare).
- Add rate-limiting and usage monitoring.

---

## 6. Prompts & Templates (copy-paste ready)

### System prompts (base)
```
You are a concise, factual research assistant. Always cite the URLs you used in square brackets after facts. When asked to summarize, return a short TL;DR (1-2 lines), a detailed summary (3-6 bullets), and references with short quotes. Use Markdown formatting.
```

### 1) Basic search + summarize
```
Search the web for: "{query}". Return:
1. TL;DR (one line)
2. Top 5 findings with 1-sentence summaries and source URLs
3. Short analysis: 3 bullets
4. Suggested follow-up search queries
Respond in Markdown.
```

### 2) Deep research planner (single loop)
```
Task: "{research_question}"
Step 1: Produce 3 focused search queries to investigate this question.
Step 2: For each query, list the top 5 URLs to fetch.
Step 3: For each fetched page, extract (a) claim, (b) evidence, (c) date, (d) reliability score (1-5).
Step 4: Synthesize findings into a short conclusion with citations.
Limit depth to {depth} iterations.
```

### 3) Study mode (lesson + practice)
```
Student level: {beginner|intermediate|advanced}
Topic: {topic}
Produce:
1. A concise lesson (5-8 bullet points)
2. 5 practice questions (increasing difficulty)
3. Solutions and short explanations
4. 10 flashcard Q/A pairs as CSV
Use simple language if beginner; include math notation if needed.
```

### 4) Shopping compare
```
Compare these products: {list of product names or URLs}
Return a comparison table with: Price, Key specs, Pros, Cons, Best for (use case), Source URL.
If prices not available, return instructions to fetch price with the given API.
```

### 5) Export to PDF/MD
```
Convert the following content to a clean Markdown document with sections: Title, TL;DR, Body (with headings), References. Return only the Markdown so the app can convert to PDF.
```

---

## 7. Example scripts & snippets (minimal)

### Node.js: call OpenAI (pseudo)
```js
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{role:'system', content: 'You are...'}, {role:'user', content: 'Summarize X'}],
  max_tokens: 800
});
console.log(resp.choices[0].message.content);
```

### Python: simple search+summarize flow (pseudo)
```py
# use requests to call SerpAPI -> get top URLs -> fetch text -> call OpenAI
```

---

## 8. Testing checklist

- [ ] Chat connects to OpenAI and returns responses
- [ ] Web search returns URLs and summaries
- [ ] Deep research completes an iteration and cites sources
- [ ] Study mode generates Qs and flashcards
- [ ] Export to PDF works and file downloads
- [ ] Memory stores and recalls key facts
- [ ] API keys are secured

---

## 9. Basic cost estimate

- OpenAI: $5–$50/month depending on use
- SerpAPI/Bing: $0–$50/month (depends on queries)
- Hosting (VPS): $5–$15/month (optional)

---

## 10. Next steps (what I can deliver for you right now)

- Provide a one‑click config for Open WebUI with the required plugins enabled.
- Provide ready-to-copy prompt templates (I included the key ones above).
- Provide exact shell commands for setting up the chosen UI (Open WebUI / LibreChat).
- Provide a minimal Python script for Deep Research loop.

---

## 11. Quick-start commands (Open WebUI example)

```bash
# clone
git clone https://github.com/open-webui/open-webui.git
cd open-webui
# install (check repo README for exact)
npm install
# create .env with OPENAI_API_KEY and SERPAPI_KEY
# run
npm run dev
```

---

## 12. Appendix: Useful open-source projects

- Open WebUI — chat UI
- LibreChat — chat client
- AutoGPT-lite / Agentic — simple agents
- Chroma — vector DB
- Pandoc — file conversions
- SerpAPI / Playwright scrapers — web fetch

---

*Document created as a concise project plan and prompt cookbook to build a personal ChatGPT-style assistant using OpenAI API and open-source tools.*

