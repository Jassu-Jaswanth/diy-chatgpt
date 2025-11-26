/**
 * Orchestrator Service
 * 
 * Implements a two-stage model architecture:
 * 1. Planner Model (small, fast) - Classifies intent, decides tools, plans execution
 * 2. Executor Model (appropriate size) - Executes the plan with tool results
 * 
 * Similar to how ChatGPT routes between models internally
 */

const modelConfig = require('../../config/models');
const promptConfig = require('../../config/prompts');

class Orchestrator {
  constructor(openai, services) {
    this.openai = openai;
    this.services = services;
    this.debug = process.env.DEBUG_ORCHESTRATOR === 'true';
  }

  log(stage, data) {
    if (this.debug) {
      console.log(`[Orchestrator:${stage}]`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[Orchestrator:${stage}]`, typeof data === 'string' ? data : data.summary || Object.keys(data));
    }
  }

  /**
   * Main entry point - processes user message through planner → executor
   */
  async process(messages, options = {}) {
    const { customInstructions = '', forceMode = null } = options;
    const userMessage = messages[messages.length - 1]?.content || '';

    // Stage 1: Planner - Classify intent and plan execution
    const plan = forceMode 
      ? { intent: forceMode, confidence: 1.0, needsTools: [forceMode], complexity: 'moderate' }
      : await this.runPlanner(userMessage);
    
    this.log('plan', { intent: plan.intent, confidence: plan.confidence, tools: plan.needsTools });

    // Stage 2: Execute based on plan
    const result = await this.execute(messages, plan, customInstructions);
    
    return result;
  }

  /**
   * Stage 1: Planner Model
   * Uses small, fast model to classify intent and decide execution strategy
   */
  async runPlanner(userMessage) {
    const plannerModel = modelConfig.getPlannerModel();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: plannerModel.name,
        messages: [
          { role: 'system', content: promptConfig.tasks.classify_intent },
          { role: 'user', content: userMessage }
        ],
        max_tokens: plannerModel.maxTokens,
        temperature: plannerModel.temperature,
        response_format: { type: 'json_object' }
      });

      const classification = JSON.parse(response.choices[0].message.content);
      
      return {
        intent: classification.intent || 'chat',
        confidence: classification.confidence || 0.5,
        needsTools: classification.needs_tools || [],
        complexity: classification.complexity || 'simple',
        extractedQuery: classification.extracted_query || userMessage,
        plannerTokens: response.usage?.total_tokens || 0
      };
    } catch (error) {
      this.log('planner_error', error.message);
      // Fallback to pattern-based detection
      return this.fallbackClassification(userMessage);
    }
  }

  /**
   * Fallback classification using patterns (if planner fails)
   */
  fallbackClassification(message) {
    const lower = message.toLowerCase();
    
    if (/search|look up|find|current|latest|news|weather|price/i.test(lower)) {
      return { intent: 'search', confidence: 0.7, needsTools: ['web_search'], complexity: 'simple' };
    }
    if (/research|analyze|in-depth|comprehensive|report/i.test(lower)) {
      return { intent: 'research', confidence: 0.7, needsTools: ['web_search'], complexity: 'complex' };
    }
    if (/teach|explain|learn|lesson|flashcard|quiz/i.test(lower)) {
      return { intent: 'study', confidence: 0.7, needsTools: [], complexity: 'moderate' };
    }
    if (/code|program|function|debug|implement|script/i.test(lower)) {
      return { intent: 'code', confidence: 0.7, needsTools: [], complexity: 'moderate' };
    }
    if (/write|story|creative|brainstorm|ideas/i.test(lower)) {
      return { intent: 'creative', confidence: 0.7, needsTools: [], complexity: 'moderate' };
    }
    
    return { intent: 'chat', confidence: 0.8, needsTools: [], complexity: 'simple' };
  }

  /**
   * Stage 2: Executor
   * Routes to appropriate handler based on plan
   */
  async execute(messages, plan, customInstructions) {
    const { intent, needsTools, complexity, extractedQuery } = plan;
    
    // Select model based on task
    const modelKey = modelConfig.taskMapping[intent] || 'chat';
    const model = modelConfig.models[modelKey];
    
    this.log('executor', { model: model.name, intent, complexity });

    // Build system prompt with appropriate tool patches
    const systemPrompt = promptConfig.buildSystemPrompt({
      tools: needsTools.includes('web_search') ? ['web_search'] : [],
      customInstructions
    });

    // Route to appropriate handler
    switch (intent) {
      case 'search':
        return this.handleSearch(messages, plan, systemPrompt, model);
      
      case 'research':
        return this.handleResearch(messages, plan, systemPrompt, model);
      
      case 'study':
        return this.handleStudy(messages, plan, model);
      
      case 'code':
        return this.handleCode(messages, systemPrompt, model);
      
      case 'creative':
        return this.handleCreative(messages, systemPrompt, model);
      
      default:
        return this.handleChat(messages, systemPrompt, model);
    }
  }

  /**
   * Handler: Web Search
   */
  async handleSearch(messages, plan, systemPrompt, model) {
    const query = plan.extractedQuery || messages[messages.length - 1].content;
    
    // Perform search
    const searchResults = await this.services.search.search(query, 5);
    
    if (searchResults.length === 0) {
      return this.handleChat(messages, systemPrompt, model);
    }

    // Fetch top results
    const urls = searchResults.slice(0, 3).map(r => r.url);
    const contents = await this.services.fetcher.fetchMultiple(urls);
    const successfulContents = contents.filter(c => c.success);

    // Build context
    const searchContext = this.formatSearchContext(searchResults, successfulContents);
    
    // Enhanced system prompt with search results
    const enhancedPrompt = systemPrompt + '\n\n' + promptConfig.tasks.search_synthesis + 
      '\n\nSearch Results:\n' + searchContext;

    // Generate response
    const response = await this.openai.chat.completions.create({
      model: model.name,
      messages: [
        { role: 'system', content: enhancedPrompt },
        ...messages
      ],
      max_tokens: model.maxTokens,
      temperature: model.temperature
    });

    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      toolUsed: 'web_search',
      sources: searchResults.map((r, i) => ({ id: i + 1, title: r.title, url: r.url })),
      metadata: {
        intent: 'search',
        model: model.name,
        plannerTokens: plan.plannerTokens,
        executorTokens: response.usage?.total_tokens
      }
    };
  }

  /**
   * Handler: Deep Research
   */
  async handleResearch(messages, plan, systemPrompt, model) {
    const query = plan.extractedQuery || messages[messages.length - 1].content;
    
    try {
      // Use research agent for deep research
      const result = await this.services.research.research(query, { depth: 2, maxSources: 8 });
      
      return {
        role: 'assistant',
        content: result.synthesis,
        toolUsed: 'research',
        sources: result.sources,
        metadata: {
          intent: 'research',
          model: model.name,
          steps: result.steps
        }
      };
    } catch (error) {
      this.log('research_error', error.message);
      // Fallback to search
      return this.handleSearch(messages, plan, systemPrompt, model);
    }
  }

  /**
   * Handler: Study Mode
   */
  async handleStudy(messages, plan, model) {
    const userMessage = messages[messages.length - 1].content;
    const lower = userMessage.toLowerCase();
    
    // Determine study type
    let result;
    if (lower.includes('flashcard')) {
      result = await this.services.study.generateFlashcards(plan.extractedQuery || userMessage);
    } else if (lower.includes('quiz') || lower.includes('test me')) {
      result = await this.services.study.generateQuiz(plan.extractedQuery || userMessage);
    } else if (lower.includes('practice') || lower.includes('question')) {
      result = await this.services.study.generatePractice(plan.extractedQuery || userMessage);
    } else {
      result = await this.services.study.explain(plan.extractedQuery || userMessage);
    }

    return {
      role: 'assistant',
      content: result.content,
      toolUsed: 'study',
      metadata: {
        intent: 'study',
        studyType: result.type,
        model: model.name
      }
    };
  }

  /**
   * Handler: Code
   */
  async handleCode(messages, systemPrompt, model) {
    const codePrompt = promptConfig.buildSystemPrompt({ tools: ['code'] });
    
    const response = await this.openai.chat.completions.create({
      model: model.name,
      messages: [
        { role: 'system', content: codePrompt },
        ...messages
      ],
      max_tokens: model.maxTokens,
      temperature: model.temperature
    });

    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      toolUsed: 'code',
      metadata: {
        intent: 'code',
        model: model.name,
        tokens: response.usage?.total_tokens
      }
    };
  }

  /**
   * Handler: Creative
   */
  async handleCreative(messages, systemPrompt, model) {
    const creativePrompt = promptConfig.buildSystemPrompt({ tools: ['creative'] });
    
    const response = await this.openai.chat.completions.create({
      model: model.name,
      messages: [
        { role: 'system', content: creativePrompt },
        ...messages
      ],
      max_tokens: model.maxTokens,
      temperature: model.temperature
    });

    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      toolUsed: 'creative',
      metadata: {
        intent: 'creative',
        model: model.name,
        tokens: response.usage?.total_tokens
      }
    };
  }

  /**
   * Handler: General Chat
   */
  async handleChat(messages, systemPrompt, model) {
    const response = await this.openai.chat.completions.create({
      model: model.name,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      max_tokens: model.maxTokens,
      temperature: model.temperature
    });

    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      toolUsed: null,
      metadata: {
        intent: 'chat',
        model: model.name,
        tokens: response.usage?.total_tokens
      }
    };
  }

  /**
   * Format search results for context
   */
  formatSearchContext(searchResults, contents) {
    let context = '';
    
    searchResults.forEach((r, i) => {
      context += `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n`;
      
      const fetchedContent = contents.find(c => c.url === r.url);
      if (fetchedContent?.content) {
        context += `Content: ${fetchedContent.content.substring(0, 500)}...\n`;
      }
      context += '\n';
    });
    
    return context;
  }
}

module.exports = Orchestrator;
