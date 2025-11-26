#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Add parent node_modules to path
module.paths.unshift(path.join(__dirname, '../node_modules'));

const OpenAI = require('openai');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function testOpenAIConnection() {
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}   Testing OpenAI API Connection      ${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}\n`);

  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
    console.log(`${colors.red}❌ OpenAI API key not configured!${colors.reset}`);
    console.log(`${colors.yellow}   Please edit .env file and add your actual OpenAI API key${colors.reset}`);
    console.log(`${colors.yellow}   You can get one at: https://platform.openai.com/api-keys${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.blue}Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}${colors.reset}`);
  console.log(`${colors.blue}Testing connection...${colors.reset}\n`);

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { 
          role: 'user', 
          content: 'Respond with exactly: "Connection successful! DIY ChatGPT is ready."' 
        }
      ],
      max_tokens: 50
    });

    console.log(`${colors.green}✅ ${response.choices[0].message.content}${colors.reset}`);
    console.log(`${colors.green}✅ OpenAI API is working correctly!${colors.reset}\n`);

    // Show token usage
    if (response.usage) {
      const cost = (response.usage.total_tokens / 1000) * 0.002;
      console.log(`${colors.cyan}Token Usage:${colors.reset}`);
      console.log(`  - Prompt tokens: ${response.usage.prompt_tokens}`);
      console.log(`  - Completion tokens: ${response.usage.completion_tokens}`);
      console.log(`  - Total tokens: ${response.usage.total_tokens}`);
      console.log(`  - Estimated cost: ~$${cost.toFixed(6)}\n`);
    }

    console.log(`${colors.green}Ready to proceed with Phase 1!${colors.reset}`);
    process.exit(0);

  } catch (error) {
    console.log(`${colors.red}❌ Connection failed!${colors.reset}`);
    console.log(`${colors.red}Error: ${error.message}${colors.reset}\n`);
    
    if (error.message.includes('401')) {
      console.log(`${colors.yellow}This usually means your API key is invalid.${colors.reset}`);
      console.log(`${colors.yellow}Please check your API key in the .env file.${colors.reset}`);
    } else if (error.message.includes('429')) {
      console.log(`${colors.yellow}Rate limit exceeded or quota issue.${colors.reset}`);
      console.log(`${colors.yellow}Check your OpenAI account billing/usage.${colors.reset}`);
    }
    
    process.exit(1);
  }
}

// Run the test
testOpenAIConnection();
