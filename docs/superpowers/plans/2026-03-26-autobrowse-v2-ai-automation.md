# AutoBrowse v2: AI-Powered Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered NLP instruction parsing with selectable LLM providers (local Ollama, cloud OpenAI) and fuzzy element matching

**Architecture:** Add AI Gateway layer between Interpreter and actions. Interpreter tries AI first (local → cloud → regex). Fuzzy matcher resolves ambiguous UI references.

**Tech Stack:** Ollama (local), OpenAI SDK (cloud), Playwright for browser control

---

## File Structure

```
src/
├── ai/
│   ├── gateway.ts       # AI provider abstraction + routing
│   ├── matcher.ts       # Fuzzy element matching
│   └── providers/
│       ├── ollama.ts     # Local Ollama client
│       └── openai.ts     # Cloud OpenAI client
├── db/
│   ├── queries.ts        # Add AI config queries
│   └── ai-config.ts     # AI config persistence (optional)
└── index.ts              # Add AI API routes
```

---

## Task 1: AI Config Schema & Persistence

**Files:**
- Modify: `src/db/queries.ts` - Add AI config get/set functions
- Modify: `src/index.ts` - Add AI config initialization

- [ ] **Step 1: Add AI config to DB schema**

Add to `src/db/queries.ts`:

```typescript
export function getAIConfig(): AIConfig {
  const db = getDb();
  const result = db.exec("SELECT key, value FROM config WHERE key LIKE 'ai.%'");
  const config: any = { enabled: true, provider: 'hybrid', fallback: true };
  
  for (const row of result) {
    const key = row.values[0][0] as string;
    const value = row.values[0][1] as string;
    
    if (key === 'ai.enabled') config.enabled = value === 'true';
    if (key === 'ai.provider') config.provider = value;
    if (key === 'ai.local.model') config.local = { url: 'http://localhost:11434', model: value || 'llama3.2' };
    if (key === 'ai.cloud.model') config.cloud = { apiKey: '', model: value || 'gpt-4o-mini' };
    if (key === 'ai.fallback') config.fallback = value === 'true';
  }
  
  return config as AIConfig;
}

export function setAIConfig(key: string, value: string) {
  const db = getDb();
  db.run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [`ai.${key}`, value]);
  saveDb();
}
```

- [ ] **Step 2: Initialize default AI config on startup**

Add to `src/index.ts` in `main()` after DB init:

```typescript
function ensureAIConfig() {
  const defaults = [
    ['ai.enabled', 'true'],
    ['ai.provider', 'hybrid'],
    ['ai.local.model', 'llama3.2'],
    ['ai.cloud.model', 'gpt-4o-mini'],
    ['ai.fallback', 'true'],
  ];
  for (const [key, val] of defaults) {
    const existing = dbGetConfig(key);
    if (!existing) setAIConfig(key.replace('ai.', ''), val);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/db/queries.ts src/index.ts
git commit -m "feat: add AI config schema and persistence"
```

---

## Task 2: Ollama Provider

**Files:**
- Create: `src/ai/providers/ollama.ts`
- Test: Manual test with `curl`

- [ ] **Step 1: Install Ollama SDK**

```bash
npm install ollama
```

- [ ] **Step 2: Create Ollama provider**

Create `src/ai/providers/ollama.ts`:

```typescript
import { createLogger } from '../../logger/index.js';

const logger = createLogger('ai:ollama');

export interface OllamaConfig {
  url: string;
  model: string;
}

export class OllamaProvider {
  private client: any;
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
```

- [ ] **Step 3: Test Ollama availability**

```bash
node -e "
const { OllamaProvider } = await import('./src/ai/providers/ollama.ts');
const ollama = new OllamaProvider({ url: 'http://localhost:11434', model: 'llama3.2' });
ollama.isAvailable().then(available => console.log('Ollama available:', available));
"
```

- [ ] **Step 4: Commit**

```bash
git add src/ai/providers/ollama.ts package.json package-lock.json
git commit -m "feat: add Ollama provider for local LLM"
```

---

## Task 3: OpenAI Provider

**Files:**
- Create: `src/ai/providers/openai.ts`
- Test: Mock test (API key required for real test)

- [ ] **Step 1: Install OpenAI SDK**

```bash
npm install openai
```

- [ ] **Step 2: Create OpenAI provider**

Create `src/ai/providers/openai.ts`:

```typescript
import OpenAI from 'openai';
import { createLogger } from '../../logger/index.js';

const logger = createLogger('ai:openai');

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export class OpenAIProvider {
  private client: any;
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

      return response.choices[0].message.content;
    } catch (err) {
      logger.error('OpenAI request failed', { err });
      throw err;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ai/providers/openai.ts package.json package-lock.json
git commit -m "feat: add OpenAI provider for cloud LLM"
```

---

## Task 4: AI Gateway

**Files:**
- Create: `src/ai/gateway.ts`
- Modify: `src/worker/interpreter.ts`

- [ ] **Step 1: Create AI Gateway**

Create `src/ai/gateway.ts`:

```typescript
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
  private ollama: OllamaProvider;
  private openai: OpenAIProvider;
  private config: AIConfig;

  constructor() {
    this.config = this.loadConfig();
    this.ollama = new OllamaProvider(this.config.local);
    this.openai = new OpenAIProvider(this.config.cloud);
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
    return { ...this.config, cloud: { ...this.config.cloud, apiKey: this.config.cloud.apiKey ? '***' : '' } };
  }

  async updateConfig(updates: Partial<AIConfig>) {
    if (updates.enabled !== undefined) setAIConfig('enabled', String(updates.enabled));
    if (updates.provider) setAIConfig('provider', updates.provider);
    if (updates.local?.model) setAIConfig('local.model', updates.local.model);
    if (updates.cloud?.model) setAIConfig('cloud.model', updates.cloud.model);
    if (updates.cloud?.apiKey) setAIConfig('cloud.apiKey', updates.cloud.apiKey);
    this.config = this.loadConfig();
    this.ollama = new OllamaProvider(this.config.local);
    this.openai = new OpenAIProvider(this.config.cloud);
  }

  async listModels(provider: 'local' | 'cloud'): Promise<string[]> {
    if (provider === 'local') {
      return this.ollama.listModels();
    }
    return this.openai.listModels();
  }

  async testProvider(provider: 'local' | 'cloud', model?: string): Promise<boolean> {
    if (provider === 'local') {
      if (model) this.ollama = new OllamaProvider({ ...this.config.local, model });
      return this.ollama.isAvailable();
    }
    if (model) this.openai = new OpenAIProvider({ ...this.config.cloud, model });
    return this.openai.isAvailable();
  }

  async parseInstruction(instruction: string, pageContext?: string): Promise<BrowserAction[]> {
    if (!this.config.enabled) {
      throw new Error('AI is disabled');
    }

    const isSimple = /^(https?:\/\/[^\s;,]+|click|type|get|screenshot)/i.test(instruction.trim());
    
    if (isSimple && this.config.fallback) {
      logger.info('Simple instruction, using regex fallback');
      return this.useRegexFallback(instruction);
    }

    const tryLocal = async (): Promise<BrowserAction[]> => {
      const available = await this.ollama.isAvailable();
      if (!available) throw new Error('Local not available');
      const result = await this.ollama.parseInstruction(instruction, pageContext);
      return this.parseJSONResponse(result);
    };

    const tryCloud = async (): Promise<BrowserAction[]> => {
      if (!this.config.cloud.apiKey) throw new Error('No API key');
      const result = await this.openai.parseInstruction(instruction, pageContext);
      return this.parseJSONResponse(result);
    };

    try {
      if (this.config.provider === 'local') {
        return await tryLocal();
      } else if (this.config.provider === 'cloud') {
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
      if (this.config.fallback) {
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
```

- [ ] **Step 2: Add AI routes to server**

Add to `src/index.ts`:

```typescript
import { aiGateway } from './ai/gateway.js';

server.get('/ai/config', async () => ({ config: aiGateway.getConfig() }));

server.put('/ai/config', async (request: any) => {
  const { provider, model, apiKey, enabled, fallback } = request.body || {};
  await aiGateway.updateConfig({ provider, local: { url: 'http://localhost:11434', model }, cloud: { apiKey, model }, enabled, fallback });
  return { success: true, config: aiGateway.getConfig() };
});

server.get('/ai/models', async (request: any) => {
  const { provider } = request.query || {};
  if (provider === 'local' || provider === 'cloud') {
    return { provider, models: await aiGateway.listModels(provider) };
  }
  return {
    local: await aiGateway.listModels('local'),
    cloud: await aiGateway.listModels('cloud')
  };
});

server.post('/ai/test', async (request: any) => {
  const { provider, model, instruction } = request.body || {};
  const available = await aiGateway.testProvider(provider || 'local', model);
  return { available };
});
```

- [ ] **Step 3: Update interpreter to use AI gateway**

Modify `src/worker/interpreter.ts` - add AI gateway integration:

```typescript
import { aiGateway } from '../ai/gateway.js';

export async function parseInstructionAsync(instruction: string, pageContext?: string): Promise<{ actions: BrowserAction[] }> {
  try {
    const actions = await aiGateway.parseInstruction(instruction, pageContext);
    if (actions.length > 0) {
      logger.info('AI parsed instruction', { actionCount: actions.length });
      return { actions };
    }
  } catch (err) {
    logger.warn('AI parsing failed, using regex', { err });
  }
  
  return parseInstruction(instruction);
}

export function parseInstruction(instruction: string): { actions: BrowserAction[] } {
  // ... existing code
}
```

- [ ] **Step 4: Update processor to use async parse**

Modify `src/worker/processor.ts`:

```typescript
import { parseInstructionAsync } from './interpreter.js';

async function processTask(taskId: string) {
  // ...
  const parsed = await parseInstructionAsync(task.instruction);
  // ...
}
```

- [ ] **Step 5: Commit**

```bash
git add src/ai/gateway.ts src/worker/interpreter.ts src/worker/processor.ts src/index.ts
git commit -m "feat: add AI gateway with local/cloud provider routing"
```

---

## Task 5: Fuzzy Element Matcher

**Files:**
- Create: `src/ai/matcher.ts`
- Modify: `src/browser/manager.ts`

- [ ] **Step 1: Create element matcher**

Create `src/ai/matcher.ts`:

```typescript
import { Page } from 'playwright';
import { createLogger } from '../logger/index.js';

const logger = createLogger('ai:matcher');

export interface ElementContext {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  selector: string;
}

export class ElementMatcher {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async getPageContext(): Promise<string> {
    const elements = await this.page.evaluate(() => {
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        return el.tagName.toLowerCase();
      };

      const clickable = ['button', 'a', 'input', 'select', 'textarea'];
      const els = Array.from(document.querySelectorAll(clickable.join(',')))
        .slice(0, 50)
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 50) || '',
          attributes: {
            type: (el as HTMLInputElement).type || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
            name: (el as HTMLInputElement).name || '',
            id: el.id || '',
            'data-testid': el.getAttribute('data-testid') || ''
          },
          selector: getSelector(el)
        }));
      return els;
    });

    return elements.map(e => `${e.tag}: "${e.text}" (${e.selector})`).join('\n');
  }

  async findByText(patterns: string[]): Promise<string | null> {
    for (const pattern of patterns) {
      const lower = pattern.toLowerCase();
      
      // Try exact text match
      const exact = await this.page.locator(`button:text("${pattern}"), a:text("${pattern}")`).first();
      if (await exact.count() > 0) {
        const selector = await exact.evaluate(el => {
          if (el.id) return `#${el.id}`;
          if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          return '';
        });
        if (selector) return selector;
        return await exact.locator('xpath=..').evaluate(el => {
          if (el.id) return `#${el.id}`;
          return '';
        });
      }

      // Try partial text match
      const partial = await this.page.locator(`button:has-text("${pattern}"), a:has-text("${pattern}")`).first();
      if (await partial.count() > 0) {
        return await partial.evaluate(el => el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase());
      }
    }
    return null;
  }

  async findByPlaceholder(placeholder: string): Promise<string | null> {
    const input = await this.page.locator(`[placeholder*="${placeholder}"]`).first();
    if (await input.count() > 0) {
      return await input.evaluate(el => el.id || el.getAttribute('name') || el.getAttribute('data-testid') || '');
    }
    return null;
  }

  async findBestMatch(description: string): Promise<string | null> {
    const words = description.toLowerCase().split(/\s+/);
    
    // Try button/link with text
    const selector = await this.findByText(words);
    if (selector) return selector;

    // Try input by placeholder
    for (const word of words) {
      const inputMatch = await this.findByPlaceholder(word);
      if (inputMatch) return `[name="${inputMatch}"], [placeholder*="${word}"]`;
    }

    return null;
  }
}
```

- [ ] **Step 2: Export from manager**

Add to `src/browser/manager.ts`:

```typescript
export { ElementMatcher } from '../ai/matcher.js';
```

- [ ] **Step 3: Commit**

```bash
git add src/ai/matcher.ts src/browser/manager.ts
git commit -m "feat: add fuzzy element matcher for ambiguous UI references"
```

---

## Task 6: Integration Test

**Files:**
- Test with running server

- [ ] **Step 1: Start server**

```bash
npm run dev
```

- [ ] **Step 2: Test AI config endpoint**

```bash
curl http://127.0.0.1:5847/ai/config
```

- [ ] **Step 3: Test AI parse with simple instruction**

```bash
curl -X POST http://127.0.0.1:5847/tasks -H "Content-Type: application/json" -d '{"instruction": "go to https://example.com; get the title"}'
```

- [ ] **Step 4: Check task result**

```bash
curl http://127.0.0.1:5847/tasks?status=completed&limit=1
```

- [ ] **Step 5: Commit**

```bash
git commit -m "test: verify AI integration end-to-end"
```

---

## Task 7: Package v2.0.0

**Files:**
- Rebuild package

- [ ] **Step 1: Rebuild Electron package**

```bash
npm run package
```

- [ ] **Step 2: Tag release**

```bash
git tag v2.0.0
git push origin master --tags
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | AI Config Schema & Persistence |
| 2 | Ollama Provider |
| 3 | OpenAI Provider |
| 4 | AI Gateway with routing |
| 5 | Fuzzy Element Matcher |
| 6 | Integration Test |
| 7 | Package v2.0.0 |
