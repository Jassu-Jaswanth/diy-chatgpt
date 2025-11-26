/**
 * AI Configuration
 * Centralized settings for OpenAI API calls
 */

module.exports = {
  // Default model
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Temperature settings (0-2, lower = more deterministic)
  temperature: {
    default: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    creative: 0.9,      // For creative writing, brainstorming
    precise: 0.3,       // For factual, analytical tasks
    deterministic: 0.1  // For code, structured output
  },

  // Token limits by feature
  tokens: {
    // Chat
    chat: {
      maxOutput: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
      description: 'General chat responses'
    },

    // Search
    searchSummarize: {
      maxOutput: 1500,
      description: 'Web search summaries with citations'
    },

    // Study Mode
    study: {
      lesson: {
        maxOutput: 2000,
        description: 'Full lesson content'
      },
      practice: {
        maxOutput: 2000,
        description: 'Practice questions with answers'
      },
      flashcards: {
        maxOutput: 1500,
        description: 'Flashcard generation'
      },
      quiz: {
        maxOutput: 2000,
        description: 'Multiple choice quizzes'
      },
      explain: {
        maxOutput: 1000,
        description: 'Concept explanations'
      }
    },

    // Research
    research: {
      planning: {
        maxOutput: 300,
        description: 'Search query generation'
      },
      analysis: {
        maxOutput: 1500,
        description: 'Content analysis and extraction'
      },
      synthesis: {
        maxOutput: 2000,
        description: 'Final research report'
      },
      quick: {
        maxOutput: 1000,
        description: 'Quick research answers'
      }
    }
  },

  // Rate limiting (requests per minute)
  rateLimit: {
    chat: 20,
    search: 10,
    research: 5
  },

  // Cost estimation (per 1K tokens, USD)
  // Based on gpt-4o-mini pricing as of 2024
  costPer1kTokens: {
    input: 0.00015,
    output: 0.0006
  },

  // Helper function to get token config
  getTokenLimit(feature, subFeature = null) {
    if (subFeature && this.tokens[feature]?.[subFeature]) {
      return this.tokens[feature][subFeature].maxOutput;
    }
    if (this.tokens[feature]?.maxOutput) {
      return this.tokens[feature].maxOutput;
    }
    return this.tokens.chat.maxOutput; // fallback
  },

  // Helper to estimate cost
  estimateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000) * this.costPer1kTokens.input;
    const outputCost = (outputTokens / 1000) * this.costPer1kTokens.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost
    };
  }
};
