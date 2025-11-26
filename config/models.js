/**
 * Model Configuration
 * Dynamic model selection based on task type
 */

module.exports = {
  // Available models (can be swapped based on API provider)
  models: {
    // Planner/Router model - fast, cheap, good at classification
    planner: {
      name: process.env.PLANNER_MODEL || 'gpt-4o-mini',
      maxTokens: 500,
      temperature: 0.3,
      description: 'Fast model for intent detection and task planning'
    },
    
    // Main chat model - balanced
    chat: {
      name: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
      description: 'Primary conversational model'
    },
    
    // Deep reasoning model - for complex tasks
    reasoning: {
      name: process.env.REASONING_MODEL || 'gpt-4o',
      maxTokens: 4000,
      temperature: 0.5,
      description: 'Advanced model for complex reasoning and research'
    },
    
    // Creative model - for writing, brainstorming
    creative: {
      name: process.env.CREATIVE_MODEL || 'gpt-4o-mini',
      maxTokens: 3000,
      temperature: 0.9,
      description: 'Higher temperature for creative tasks'
    },
    
    // Coding model - precise, deterministic
    code: {
      name: process.env.CODE_MODEL || 'gpt-4o-mini',
      maxTokens: 2500,
      temperature: 0.2,
      description: 'Low temperature for code generation'
    }
  },

  // Task to model mapping
  taskMapping: {
    'chat': 'chat',
    'search': 'chat',
    'research': 'reasoning',
    'study': 'chat',
    'code': 'code',
    'creative': 'creative',
    'analysis': 'reasoning',
    'planning': 'planner'
  },

  // Get model config for a task
  getModelForTask(task) {
    const modelKey = this.taskMapping[task] || 'chat';
    return this.models[modelKey];
  },

  // Get planner model
  getPlannerModel() {
    return this.models.planner;
  }
};
