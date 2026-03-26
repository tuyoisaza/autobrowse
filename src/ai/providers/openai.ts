import OpenAI from 'openai';
import { createLogger } from '../../logger/index.js';

const logger = createLogger('ai:openai');

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export class OpenAIProvider {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  async parseInstruction(instruction: string, pageContext?: string): Promise<string> {
    const systemPrompt = `You are a browser automation assistant. Given a user instruction and page context, output a JSON array of actions to execute.

Available actions:
- open_url(url)
- click(selector)
- dblclick(selector)
- hover(selector)
- type(selector, text)
- clear(selector)
- select(selector, value)
- press_key(key)
- scroll(direction|amount)
- wait(ms)
- screenshot()
- extract_text(selector)
- get_title()
- extract_links()
- go_back(), go_forward(), refresh()

Selectors should be stable CSS selectors or text-based queries like "button:text('Submit')".

Output format: [{"action": "type", "selector": "...", "value": "..."}]`;

    const userMessage = pageContext 
      ? `Instruction: ${instruction}\n\nPage context:\n${pageContext}`
      : instruction;

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }
      return content;
    } catch (err) {
      logger.error('OpenAI request failed', { err });
      throw err;
    }
  }
}
