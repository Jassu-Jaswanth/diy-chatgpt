const SearchService = require('./search');
const ContentFetcher = require('./fetcher');

class ResearchAgent {
  constructor(openai) {
    this.openai = openai;
    this.searchService = new SearchService();
    this.contentFetcher = new ContentFetcher();
    this.maxDepth = 3;
    this.maxResultsPerQuery = 5;
  }

  async research(question, options = {}) {
    const { depth = 2, maxSources = 10 } = options;
    console.log(`[Research] Starting research: "${question}"`);

    const steps = [];
    
    // Step 1: Create research plan
    steps.push({ step: 'planning', status: 'started' });
    const plan = await this.createResearchPlan(question);
    steps[0].status = 'completed';
    steps[0].queries = plan.queries;

    // Step 2: Execute searches
    steps.push({ step: 'searching', status: 'started' });
    const searchResults = await this.executeSearches(plan.queries);
    steps[1].status = 'completed';
    steps[1].resultsCount = searchResults.flat().length;

    // Step 3: Fetch and extract content
    steps.push({ step: 'fetching', status: 'started' });
    const urls = this.extractUniqueUrls(searchResults, maxSources);
    const fetchedContent = await this.contentFetcher.fetchMultiple(urls);
    const successfulFetches = fetchedContent.filter(c => c.success);
    steps[2].status = 'completed';
    steps[2].fetchedCount = successfulFetches.length;

    // Step 4: Analyze and extract key information
    steps.push({ step: 'analyzing', status: 'started' });
    const analysis = await this.analyzeContent(question, successfulFetches);
    steps[3].status = 'completed';

    // Step 5: Synthesize final report
    steps.push({ step: 'synthesizing', status: 'started' });
    const synthesis = await this.synthesize(question, analysis, successfulFetches);
    steps[4].status = 'completed';

    return {
      question,
      plan,
      steps,
      synthesis: synthesis.content,
      sources: this.formatSources(successfulFetches),
      usage: synthesis.usage
    };
  }

  async createResearchPlan(question) {
    const prompt = `You are a research planner. Given this research question, generate 3-5 focused search queries that would help thoroughly investigate it.

Question: "${question}"

Return ONLY a JSON array of search query strings, nothing else. Example:
["query 1", "query 2", "query 3"]`;

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7
    });

    let queries;
    try {
      const content = response.choices[0].message.content.trim();
      queries = JSON.parse(content);
    } catch (e) {
      // Fallback: extract queries from text
      queries = [question, `${question} explained`, `${question} examples`];
    }

    console.log(`[Research] Generated ${queries.length} search queries`);
    return { question, queries };
  }

  async executeSearches(queries) {
    const results = [];
    for (const query of queries) {
      try {
        const searchResults = await this.searchService.search(query, this.maxResultsPerQuery);
        results.push({ query, results: searchResults });
      } catch (error) {
        console.error(`[Research] Search failed for "${query}":`, error.message);
        results.push({ query, results: [], error: error.message });
      }
    }
    return results;
  }

  extractUniqueUrls(searchResults, maxUrls) {
    const urls = new Set();
    for (const search of searchResults) {
      for (const result of search.results || []) {
        if (result.url && urls.size < maxUrls) {
          urls.add(result.url);
        }
      }
    }
    return Array.from(urls);
  }

  async analyzeContent(question, contents) {
    if (contents.length === 0) {
      return { findings: [], error: 'No content to analyze' };
    }

    const contentSummary = contents
      .map((c, i) => `[Source ${i + 1}] ${c.title}\nURL: ${c.url}\nContent: ${c.excerpt || c.content?.substring(0, 500)}`)
      .join('\n\n---\n\n');

    const prompt = `Analyze these sources to answer: "${question}"

Sources:
${contentSummary}

Extract key findings. For each finding, note:
1. The claim or fact
2. Supporting evidence
3. Source number [1], [2], etc.

Be thorough but concise.`;

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a research analyst. Extract and organize key findings from sources.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.5
    });

    return {
      findings: response.choices[0].message.content,
      sourcesUsed: contents.length
    };
  }

  async synthesize(question, analysis, sources) {
    const prompt = `Create a comprehensive research report answering: "${question}"

Analysis findings:
${analysis.findings}

Instructions:
1. Start with a brief TL;DR (2-3 sentences)
2. Provide detailed findings organized by theme
3. Include specific citations using [1], [2], etc.
4. Note any conflicting information or gaps
5. End with a conclusion and suggested follow-up questions

Format in Markdown.`;

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a research synthesizer. Create clear, well-cited reports.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  formatSources(contents) {
    return contents.map((c, i) => ({
      id: i + 1,
      title: c.title,
      url: c.url,
      excerpt: c.excerpt?.substring(0, 200)
    }));
  }

  // Quick research - less thorough but faster
  async quickResearch(question) {
    console.log(`[Research] Quick research: "${question}"`);

    // Single search
    const searchResults = await this.searchService.search(question, 5);
    
    // Fetch top 3 results
    const urls = searchResults.slice(0, 3).map(r => r.url);
    const contents = await this.contentFetcher.fetchMultiple(urls);
    const successful = contents.filter(c => c.success);

    // Quick synthesis
    const contentForAI = successful
      .map((c, i) => `[${i + 1}] ${c.title}: ${c.excerpt || c.content?.substring(0, 300)}`)
      .join('\n\n');

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Provide a concise answer with citations [1], [2], etc.' },
        { role: 'user', content: `Question: ${question}\n\nSources:\n${contentForAI}` }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    return {
      question,
      answer: response.choices[0].message.content,
      sources: this.formatSources(successful),
      usage: response.usage
    };
  }
}

module.exports = ResearchAgent;
