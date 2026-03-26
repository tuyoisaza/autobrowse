import { createLogger } from '../logger/index.js';
import { getAIConfig, setAIConfig } from '../db/queries.js';
import { OllamaProvider, OllamaConfig } from './providers/ollama.js';
import { OpenAIProvider, OpenAIConfig } from './providers/openai.js';
import { BrowserAction } from '../browser/actions.js';

const logger = createLogger('ai:gateway');

export interface AIConfig {
  enabled: boolean;
  provider: 'local' | 'cloud' | 'hybrid';
  local: OllamaConfig;
  cloud: OpenAIConfig;
  fallback: boolean;
}

export class AIGateway {
  private ollama: OllamaProvider | null = null;
  private openai: OpenAIProvider | null = null;
  private config: AIConfig | null = null;

  private ensureInitialized() {
    if (!this.config) {
      this.config = this.loadConfig();
      this.ollama = new OllamaProvider(this.config.local);
      this.openai = new OpenAIProvider(this.config.cloud);
    }
  }

  private loadConfig(): AIConfig {
    const dbConfig = getAIConfig();
    return {
      enabled: dbConfig.enabled ?? true,
      provider: dbConfig.provider ?? 'hybrid',
      local: { url: dbConfig.local?.url || 'http://localhost:11434', model: dbConfig.local?.model || 'llama3.2' },
      cloud: { apiKey: dbConfig.cloud?.apiKey || process.env.OPENAI_API_KEY || '', model: dbConfig.cloud?.model || 'gpt-4o-mini' },
      fallback: dbConfig.fallback ?? true
    };
  }

  getConfig(): AIConfig {
    this.ensureInitialized();
    return { ...this.config!, cloud: { ...this.config!.cloud, apiKey: this.config!.cloud.apiKey ? '***' : '' } };
  }

  async updateConfig(updates: Partial<AIConfig>) {
    this.ensureInitialized();
    if (updates.enabled !== undefined) setAIConfig('enabled', String(updates.enabled));
    if (updates.provider) setAIConfig('provider', updates.provider);
    if (updates.local?.model) setAIConfig('local.model', updates.local.model);
    if (updates.cloud?.model) setAIConfig('cloud.model', updates.cloud.model);
    if (updates.cloud?.apiKey) setAIConfig('cloud.apiKey', updates.cloud.apiKey);
    if (updates.fallback !== undefined) setAIConfig('fallback', String(updates.fallback));
    this.config = this.loadConfig();
    this.ollama = new OllamaProvider(this.config.local);
    this.openai = new OpenAIProvider(this.config.cloud);
  }

  async listModels(provider: 'local' | 'cloud'): Promise<string[]> {
    this.ensureInitialized();
    if (provider === 'local') {
      return this.ollama!.listModels();
    }
    return this.openai!.listModels();
  }

  async testProvider(provider: 'local' | 'cloud', model?: string): Promise<boolean> {
    this.ensureInitialized();
    if (provider === 'local') {
      if (model) this.ollama = new OllamaProvider({ ...this.config!.local, model });
      return this.ollama!.isAvailable();
    }
    if (model) this.openai = new OpenAIProvider({ ...this.config!.cloud, model });
    return this.openai!.isAvailable();
  }

  async parseInstruction(instruction: string, pageContext?: string): Promise<BrowserAction[]> {
    this.ensureInitialized();
    
    if (!this.config!.enabled) {
      throw new Error('AI is disabled');
    }

    const isSimple = /^(https?:\/\/[^\s;,]+|click|type|get|screenshot)/i.test(instruction.trim());
    
    if (isSimple && this.config!.fallback) {
      logger.info('Simple instruction, using regex fallback');
      return this.useRegexFallback(instruction);
    }

    const tryLocal = async (): Promise<BrowserAction[]> => {
      const available = await this.ollama!.isAvailable();
      if (!available) throw new Error('Local not available');
      const result = await this.ollama!.parseInstruction(instruction, pageContext);
      return this.parseJSONResponse(result);
    };

    const tryCloud = async (): Promise<BrowserAction[]> => {
      if (!this.config!.cloud.apiKey) throw new Error('No API key');
      const result = await this.openai!.parseInstruction(instruction, pageContext);
      return this.parseJSONResponse(result);
    };

    try {
      if (this.config!.provider === 'local') {
        return await tryLocal();
      } else if (this.config!.provider === 'cloud') {
        return await tryCloud();
      } else {
        try {
          return await tryLocal();
        } catch {
          logger.info('Local failed, trying cloud');
          return await tryCloud();
        }
      }
    } catch (err) {
      logger.error('AI parsing failed', { err });
      if (this.config!.fallback) {
        logger.info('Falling back to regex');
        return this.useRegexFallback(instruction);
      }
      throw err;
    }
  }

  private parseJSONResponse(response: string): BrowserAction[] {
    try {
      const parsed = JSON.parse(response);
      const actions = Array.isArray(parsed) ? parsed : parsed.actions || [];
      return actions.map((a: any) => ({
        type: a.action as any,
        selector: a.selector,
        value: a.value,
        key: a.key,
        direction: a.direction
      }));
    } catch {
      logger.warn('Failed to parse AI response as JSON', { response });
      return [];
    }
  }

  private useRegexFallback(instruction: string): BrowserAction[] {
    const { parseInstruction } = require('../worker/interpreter.js');
    return parseInstruction(instruction).actions;
  }
}

export const aiGateway = new AIGateway();
