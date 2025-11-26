const prompts = {
  system: `You are an expert tutor using the Feynman technique. 
- Explain concepts simply as if teaching a beginner
- Use analogies and real-world examples
- Identify and address common misconceptions
- Break complex topics into digestible parts
- Always encourage curiosity and deeper understanding`,

  lesson: `Create a comprehensive lesson on "{topic}" for {level} level students.

Include:
1. **Overview** - What this topic is and why it matters (2-3 sentences)
2. **Key Concepts** - 5-7 bullet points covering the fundamentals
3. **Real-World Examples** - 2-3 practical applications
4. **Common Misconceptions** - 2-3 things people often get wrong
5. **Quick Summary** - A one-paragraph recap

Use clear, simple language. Include code examples if relevant.`,

  practice: `Generate 5 practice questions about "{topic}" for {level} level.

Format:
1. **Question 1** (Easy - Recall)
   - Question text
   - Answer
   - Explanation

2. **Question 2** (Medium - Understanding)
   ...

3. **Question 3** (Medium - Application)
   ...

4. **Question 4** (Hard - Analysis)
   ...

5. **Question 5** (Hard - Synthesis)
   ...

Make questions progressively harder. Include both conceptual and practical questions.`,

  flashcards: `Create 10 flashcards for studying "{topic}".

Format each as:
Q: [Question or prompt]
A: [Concise answer]
Difficulty: [1-5]

Cover key terms, concepts, and common exam questions.
Keep answers brief but complete.`,

  quiz: `Create a multiple-choice quiz about "{topic}" with 5 questions.

Format:
1. [Question]
   a) [Option A]
   b) [Option B]
   c) [Option C]
   d) [Option D]
   
   Correct: [letter]
   Explanation: [Why this is correct]

Make questions test real understanding, not just memorization.`
};

class StudyService {
  constructor(openai) {
    this.openai = openai;
  }

  async generateLesson(topic, level = 'intermediate') {
    const prompt = prompts.lesson
      .replace('{topic}', topic)
      .replace('{level}', level);

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    return {
      type: 'lesson',
      topic,
      level,
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  async generatePractice(topic, level = 'intermediate') {
    const prompt = prompts.practice
      .replace('{topic}', topic)
      .replace('{level}', level);

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    return {
      type: 'practice',
      topic,
      level,
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  async generateFlashcards(topic) {
    const prompt = prompts.flashcards.replace('{topic}', topic);

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });

    // Parse flashcards into structured format
    const content = response.choices[0].message.content;
    const cards = this.parseFlashcards(content);

    return {
      type: 'flashcards',
      topic,
      content,
      cards,
      count: cards.length,
      usage: response.usage
    };
  }

  async generateQuiz(topic) {
    const prompt = prompts.quiz.replace('{topic}', topic);

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    return {
      type: 'quiz',
      topic,
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  parseFlashcards(content) {
    const cards = [];
    const lines = content.split('\n');
    let currentCard = {};

    for (const line of lines) {
      if (line.startsWith('Q:') || line.startsWith('**Q:**')) {
        if (currentCard.question) {
          cards.push(currentCard);
        }
        currentCard = { question: line.replace(/^\*?\*?Q:\*?\*?\s*/, '').trim() };
      } else if (line.startsWith('A:') || line.startsWith('**A:**')) {
        currentCard.answer = line.replace(/^\*?\*?A:\*?\*?\s*/, '').trim();
      } else if (line.toLowerCase().includes('difficulty:')) {
        const match = line.match(/(\d)/);
        if (match) {
          currentCard.difficulty = parseInt(match[1]);
        }
      }
    }

    if (currentCard.question) {
      cards.push(currentCard);
    }

    return cards;
  }

  // Explain a concept in simple terms
  async explain(concept, context = '') {
    const prompt = `Explain "${concept}" in simple terms.${context ? `\n\nContext: ${context}` : ''}
    
Use the Feynman technique:
1. Explain it simply (as if to a 12-year-old)
2. Identify gaps in understanding
3. Use analogies
4. Simplify further if needed`;

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    return {
      type: 'explanation',
      concept,
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }
}

module.exports = StudyService;
