# AutoBrowse v2: AI-Powered Automation Design

**Date:** 2026-03-26
**Status:** Approved
**Version:** v2.0.0

---

## 1. Overview

Add AI-powered natural language processing to AutoBrowse, enabling:
- Complex multi-step instruction parsing
- Fuzzy element matching for UI references
- Selectable LLM providers and models
- Local-first with cloud fallback

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AutoBrowse v2                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌──────────────────┐    ┌──────────────┐│
│  │ Client  │───▶│  API Server       │───▶│  Worker      ││
│  └─────────┘    └────────┬─────────┘    └──────┬───────┘│
│                           │                     │         │
│                           ▼                     ▼         │
│                    ┌──────────────┐    ┌──────────────┐   │
│                    │  Interpreter │    │  Browser     │   │
│                    │  (NLP→Acts)  │    │  (Playwright)│   │
│                    └──────┬───────┘    └──────────────┘   │
│                           │                                │
│                           ▼                                │
│                    ┌──────────────────────┐               │
│                    │    AI Gateway         │               │
│                    │  ┌────────┬────────┐  │               │
│                    │  │ Ollama │ OpenAI │  │               │
│                    │  │(Local) │ (Cloud)│  │               │
│                    │  └────────┴────────┘  │               │
│                    └──────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. AI Gateway

### 3.1 Module: `src/ai/gateway.ts`

```typescript
interface AIGateway {
  parseInstruction(instruction: string, pageContext?: PageSnapshot): Promise<BrowserAction[]>;
  getConfig(): AIConfig;
  updateConfig(config: Partial<AIConfig>): void;
  listModels(provider: 'local' | 'cloud'): Promise<string[]>;
  testProvider(provider: 'local' | 'cloud', model: string): Promise<boolean>;
}

interface PageSnapshot {
  url: string;
  title: string;
  html: string;
  clickableElements: Element[];
}

interface Element {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  selector: string;
}
```

### 3.2 Provider Chain

1. **Local (Ollama)** - Try first if available, 0 latency, full privacy
2. **Cloud (OpenAI)** - Fallback if local fails, uses GPT-4o mini
3. **Regex (current)** - Final fallback for simple patterns

### 3.3 System Prompt

```
You are a browser automation assistant. Given a user instruction and page context,
output a JSON array of actions to execute.

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

Selectors should be stable CSS selectors or text-based queries.
Use text-based queries like: "button:text('Submit')" or "link:text('Login')"

Output format: [{"action": "type", "selector": "...", "value": "..."}]
```

---

## 4. Fuzzy Element Matching

### 4.1 Module: `src/ai/matcher.ts`

```typescript
interface ElementMatcher {
  findByText(patterns: string[]): Promise<string | null>;
  findByAttributes(criteria: AttributeCriteria): Promise<string | null>;
  findBestMatch(description: string): Promise<string | null>;
}

interface AttributeCriteria {
  type?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  role?: string;
}
```

### 4.2 Selector Priority

1. `data-testid` attributes (prefer)
2. Unique ID attributes
3. Text + tag combination
4. Position as last resort

---

## 5. Configuration

### 5.1 Config Schema

```typescript
interface AIConfig {
  enabled: boolean;
  provider: 'local' | 'cloud' | 'hybrid';
  local: {
    url: string;
    model: string;
  };
  cloud: {
    apiKey: string;
    model: string;
  };
  fallback: boolean;
}
```

### 5.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/config` | Get current AI config |
| PUT | `/ai/config` | Update AI config |
| GET | `/ai/models` | List available models |
| POST | `/ai/test` | Test AI with sample |

### 5.3 Environment Variables

- `OPENAI_API_KEY` - Cloud API key
- `OLLAMA_URL` - Local Ollama URL (default: http://localhost:11434)
- `AI_ENABLED` - Enable AI features (default: true)

---

## 6. New Files

| File | Description |
|------|-------------|
| `src/ai/gateway.ts` | AI provider abstraction |
| `src/ai/providers/ollama.ts` | Ollama client |
| `src/ai/providers/openai.ts` | OpenAI client |
| `src/ai/matcher.ts` | Fuzzy element matching |
| `src/db/ai-config.ts` | AI config persistence |

---

## 7. Integration

### 7.1 Modified Files

| File | Change |
|------|--------|
| `src/worker/interpreter.ts` | Call AI gateway first |
| `src/browser/manager.ts` | Export page snapshot |
| `src/db/queries.ts` | Add AI config queries |
| `src/index.ts` | Add AI API routes |

### 7.2 Dependencies

- `ollama` - Local LLM client
- `openai` - Cloud API client

---

## 8. Testing

### 8.1 Unit Tests
- AI Gateway provider switching
- Fuzzy matcher edge cases
- Config persistence

### 8.2 Integration Tests
- Local Ollama connection
- OpenAI cloud fallback
- End-to-end instruction parsing

---

## 9. Success Criteria

- [ ] User can select local/cloud/hybrid provider
- [ ] User can select specific model per provider
- [ ] "Click the submit button" resolves to correct selector
- [ ] Complex multi-step instructions parse correctly
- [ ] Falls back to regex for simple patterns
- [ ] Works fully offline with local Ollama
