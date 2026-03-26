import { createLogger } from '../../logger/index.js';

const logger = createLogger('ai:ollama');

export interface OllamaConfig {
  url: string;
  model: string;
}

export class OllamaProvider {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.url}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.url}/api/tags`);
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
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
      const response = await fetch(`${this.config.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: `${systemPrompt}\n\nUser: ${userMessage}`,
          stream: false,
          format: 'json'
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (err) {
      logger.error('Ollama request failed', { err });
      throw err;
    }
  }
}
