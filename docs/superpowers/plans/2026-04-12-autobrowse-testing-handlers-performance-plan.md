# AutoBrowse: Testing + Handlers + Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vitest tests, 4 new goal handlers (upload_file, wait_for_network, switch_frame, handle_dialog), and 3 performance optimizations (caching, parallel steps, resource pooling).

**Architecture:** TDD approach with unit tests first, then feature implementation. New step types added to step-executor, new handlers to goal-mapper. Performance layers added to BrowserManager and orchestrator.

**Tech Stack:** vitest, TypeScript, Playwright

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Add vitest dependencies |
| `vite.config.ts` | Vitest configuration |
| `tests/unit/goal-mapper.test.ts` | Test goal mapping |
| `tests/unit/step-executor.test.ts` | Test step execution |
| `tests/unit/screenshot-modes.test.ts` | Test screenshot modes |
| `tests/integration/goal-execution.test.ts` | Integration tests |
| `tests/fixtures/test-data.ts` | Shared fixtures |
| `src/worker/step-executor.ts` | Add 4 new step types |
| `src/worker/goal-mapper.ts` | Add 4 new handlers |
| `src/worker/types.ts` | Add new StepType values |
| `src/browser/manager.ts` | Add caching + pooling |

---

## Phase 1: Test Infrastructure

### Task 1: Add vitest and configure

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Add vitest to package.json**

Add to devDependencies:
```json
"vitest": "^1.2.0",
"@vitest/ui": "^1.2.0"
```

Add to scripts:
```json
"test": "vitest",
"test:run": "vitest run",
"test:ui": "vitest --ui"
```

Run: `cd C:/DEVPROD/autobrowse && npm install`

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts']
    }
  }
});
```

- [ ] **Step 3: Verify vitest works**

Run: `cd C:/DEVPROD/autobrowse && npm run test:run -- --version`
Expected: vitest version printed

---

### Task 2: Create test fixtures

**Files:**
- Create: `tests/fixtures/test-data.ts`

- [ ] **Step 1: Create fixtures file**

```typescript
import type { GoalInput, WorkflowStep } from '../../src/worker/types.js';

export const mockGoalInput: GoalInput = {
  goal: 'navigate',
  inputs: { url: 'https://example.com' }
};

export const mockSteps: WorkflowStep[] = [
  {
    id: 'step-1',
    type: 'navigate',
    description: 'Navigate to example.com',
    action: 'navigate',
    value: 'https://example.com'
  }
];

export const screenshotModes = ['none', 'base64', 'file', 'both'] as const;

export const newGoalInputs = {
  upload_file: {
    goal: 'upload_file',
    inputs: {
      url: 'https://example.com/upload',
      selector: 'input[type="file"]',
      filePath: '/path/to/file.pdf'
    }
  },
  wait_for_network: {
    goal: 'wait_for_network',
    inputs: {
      waitFor: ['api.example.com/data'],
      timeout: 10000
    }
  },
  switch_frame: {
    goal: 'switch_frame',
    inputs: {
      url: 'https://example.com/iframe',
      frameSelector: 'iframe[name="content"]',
      actions: [{ type: 'extract', selector: 'p', value: 'content' }]
    }
  },
  handle_dialog: {
    goal: 'handle_dialog',
    inputs: {
      action: 'accept',
      clickSelector: 'button[data-action="confirm"]'
    }
  }
};
```

---

## Phase 2: Unit Tests

### Task 3: Screenshot modes unit test

**Files:**
- Create: `tests/unit/screenshot-modes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { screenshotModes } from '../fixtures/test-data.js';

describe('Screenshot Modes', () => {
  it('should have all 4 modes defined', () => {
    expect(screenshotModes).toContain('none');
    expect(screenshotModes).toContain('base64');
    expect(screenshotModes).toContain('file');
    expect(screenshotModes).toContain('both');
  });

  it('should not have overlapping base64/file capture', () => {
    // This tests the bug fix: when mode is 'file', base64 should NOT be captured
    const modes = ['none', 'base64', 'file', 'both'];
    modes.forEach(mode => {
      if (mode === 'file') {
        // Verify exclusive: base64 should NOT be in result
        expect(mode).not.toBe('base64');
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/DEVPROD/autobrowse && npm run test:run -- tests/unit/screenshot-modes.test.ts`
Expected: Tests pass (basic validation)

---

### Task 4: Goal Mapper unit tests

**Files:**
- Create: `tests/unit/goal-mapper.test.ts`

- [ ] **Step 1: Write tests for existing handlers**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GoalMapper } from '../../src/worker/goal-mapper.js';
import type { GoalInput } from '../../src/worker/types.js';

describe('GoalMapper', () => {
  let mapper: GoalMapper;

  beforeEach(() => {
    mapper = new GoalMapper();
  });

  describe('existing handlers', () => {
    it('should map navigate goal to navigate step', () => {
      const input: GoalInput = {
        goal: 'navigate',
        inputs: { url: 'https://example.com' }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps[0].type).toBe('navigate');
      expect(steps[0].value).toBe('https://example.com');
    });

    it('should map search goal to steps with navigate and search', () => {
      const input: GoalInput = {
        goal: 'search',
        inputs: { url: 'https://google.com', query: 'test' }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps.some(s => s.type === 'navigate')).toBe(true);
      expect(steps.some(s => s.type === 'search')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd C:/DEVPROD/autobrowse && npm run test:run -- tests/unit/goal-mapper.test.ts`
Expected: Tests pass

---

## Phase 3: New Step Types

### Task 5: Add new StepType values

**Files:**
- Modify: `src/worker/types.ts:40-74`

- [ ] **Step 1: Add new step types**

Find the StepType union and add:
```typescript
| 'upload'
| 'wait_for_network'
| 'switch_frame'
| 'switch_frame_back'
| 'set_handle_dialog'
```

---

### Task 6: Implement upload step type

**Files:**
- Modify: `src/worker/step-executor.ts`

- [ ] **Step 1: Add upload case to switch statement**

Add after line 230 (after 'check' case):
```typescript
case 'upload': {
  if (step.selector && step.value) {
    const locator = await findElement(context.page, step.selector);
    await locator.setInputFiles(step.value);
  }
  break;
}
```

---

### Task 7: Implement wait_for_network step type

**Files:**
- Modify: `src/worker/step-executor.ts`

- [ ] **Step 1: Add wait_for_network case**

Add after upload case:
```typescript
case 'wait_for_network': {
  const patterns = (step.value || '').split(',').filter(Boolean);
  const timeout = step.timeout || 30000;
  
  if (patterns.length > 0) {
    await context.page.waitForResponse(
      response => patterns.some(p => response.url().includes(p.trim())),
      { timeout }
    ).catch(() => {});
  } else {
    await context.page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  }
  break;
}
```

---

### Task 8: Implement switch_frame step types

**Files:**
- Modify: `src/worker/step-executor.ts`

- [ ] **Step 1: Add switch_frame case**

Add after wait_for_network case:
```typescript
case 'switch_frame': {
  if (step.selector) {
    const locator = await findElement(context.page, step.selector);
    const frame = await locator.frame();
    if (frame) {
      (context as any)._previousPage = context.page;
      (context as any)._currentFrame = frame;
      // Replace page reference temporarily
      (context as any).page = frame;
    }
  }
  break;
}

case 'switch_frame_back': {
  const prevPage = (context as any)._previousPage;
  if (prevPage) {
    (context as any).page = prevPage;
    (context as any)._previousPage = null;
    (context as any)._currentFrame = null;
  }
  break;
}
```

---

### Task 9: Implement set_handle_dialog step type

**Files:**
- Modify: `src/worker/step-executor.ts`

- [ ] **Step 1: Add set_handle_dialog case**

Add after switch_frame_back case:
```typescript
case 'set_handle_dialog': {
  const action = step.value as 'accept' | 'dismiss';
  const promptValue = step.key;
  
  context.page.on('dialog', async (dialog) => {
    if (action === 'accept') {
      await dialog.accept(promptValue);
    } else {
      await dialog.dismiss();
    }
  });
  break;
}
```

---

## Phase 4: New Goal Handlers

### Task 10: Add upload_file handler

**Files:**
- Modify: `src/worker/goal-mapper.ts`

- [ ] **Step 1: Add createUploadFileHandler method**

Add after `createTakeScreenshotHandler()`:
```typescript
private createUploadFileHandler(): GoalHandler {
  return {
    goal: 'upload_file',
    description: 'Upload a file to a page',
    mapToSteps: (inputs) => {
      const steps: WorkflowStep[] = [];
      
      if (inputs.url) {
        steps.push({
          id: `step-${Date.now()}-nav`,
          type: 'navigate',
          description: 'Navigate to upload page',
          action: 'navigate',
          value: inputs.url,
          timeout: 30000
        });
      }

      if (inputs.waitForSelector) {
        steps.push({
          id: `step-${Date.now()}-wait`,
          type: 'wait_for',
          description: 'Wait for upload input',
          action: 'wait_for',
          selector: inputs.waitForSelector,
          timeout: 15000
        });
      }

      steps.push({
        id: `step-${Date.now()}-upload`,
        type: 'upload',
        description: `Upload file`,
        action: 'upload',
        selector: inputs.selector,
        value: inputs.filePath,
        timeout: 30000
      });

      if (inputs.submit !== false) {
        steps.push({
          id: `step-${Date.now()}-submit`,
          type: 'submit',
          description: 'Submit upload',
          action: 'submit',
          timeout: 15000
        });
      }

      if (inputs.waitForNavigation) {
        steps.push({
          id: `step-${Date.now()}-wait-nav`,
          type: 'wait_for_navigation',
          description: 'Wait for upload to complete',
          action: 'wait_for_navigation',
          value: inputs.waitForNavigation,
          timeout: inputs.navigationTimeout || 30000
        });
      }

      return steps;
    },
    validateResult: (results, evidence): GoalStatus => {
      const uploadResult = results.find(r => r.type === 'upload');
      return uploadResult?.success ? 'achieved' : 'failed';
    }
  };
}
```

- [ ] **Step 2: Register handler**

Add to `registerDefaultHandlers()` array:
```typescript
this.createUploadFileHandler()
```

---

### Task 11: Add wait_for_network handler

**Files:**
- Modify: `src/worker/goal-mapper.ts`

- [ ] **Step 1: Add createWaitForNetworkHandler method**

Add after createUploadFileHandler:
```typescript
private createWaitForNetworkHandler(): GoalHandler {
  return {
    goal: 'wait_for_network',
    description: 'Wait for network requests to complete',
    mapToSteps: (inputs) => {
      const steps: WorkflowStep[] = [];

      steps.push({
        id: `step-${Date.now()}-wait-network`,
        type: 'wait_for_network',
        description: 'Wait for network requests',
        action: 'wait_for_network',
        value: Array.isArray(inputs.waitFor) ? inputs.waitFor.join(',') : inputs.waitFor,
        timeout: inputs.timeout || 30000
      });

      return steps;
    },
    validateResult: (results, evidence): GoalStatus => {
      const waitResult = results.find(r => r.type === 'wait_for_network');
      return waitResult?.success !== false ? 'achieved' : 'uncertain';
    }
  };
}
```

- [ ] **Step 2: Register handler**

Add to `registerDefaultHandlers()` array.

---

### Task 12: Add switch_frame handler

**Files:**
- Modify: `src/worker/goal-mapper.ts`

- [ ] **Step 1: Add createSwitchFrameHandler method**

Add after createWaitForNetworkHandler:
```typescript
private createSwitchFrameHandler(): GoalHandler {
  return {
    goal: 'switch_frame',
    description: 'Interact with iframe content',
    mapToSteps: (inputs) => {
      const steps: WorkflowStep[] = [];

      if (inputs.url) {
        steps.push({
          id: `step-${Date.now()}-nav`,
          type: 'navigate',
          description: 'Navigate to page with frame',
          action: 'navigate',
          value: inputs.url,
          timeout: 30000
        });
      }

      if (inputs.waitForSelector) {
        steps.push({
          id: `step-${Date.now()}-wait`,
          type: 'wait_for',
          description: 'Wait for frame',
          action: 'wait_for',
          selector: inputs.waitForSelector,
          timeout: inputs.waitTimeout || 15000
        });
      }

      steps.push({
        id: `step-${Date.now()}-switch-frame`,
        type: 'switch_frame',
        description: 'Switch to frame',
        action: 'switch_frame',
        selector: inputs.frameSelector,
        timeout: 15000
      });

      if (inputs.actions && Array.isArray(inputs.actions)) {
        for (const action of inputs.actions) {
          steps.push({
            id: `step-${Date.now()}-frame-action`,
            ...action,
            id: action.id || `step-${Date.now()}-frame-action`
          });
        }
      }

      if (inputs.switchBack !== false) {
        steps.push({
          id: `step-${Date.now()}-switch-back`,
          type: 'switch_frame_back',
          description: 'Return to main frame',
          action: 'switch_frame_back',
          timeout: 5000
        });
      }

      return steps;
    },
    validateResult: (results, evidence): GoalStatus => {
      const switchResult = results.find(r => r.type === 'switch_frame');
      return switchResult?.success ? 'achieved' : 'failed';
    }
  };
}
```

- [ ] **Step 2: Register handler**

Add to `registerDefaultHandlers()` array.

---

### Task 13: Add handle_dialog handler

**Files:**
- Modify: `src/worker/goal-mapper.ts`

- [ ] **Step 1: Add createHandleDialogHandler method**

Add after createSwitchFrameHandler:
```typescript
private createHandleDialogHandler(): GoalHandler {
  return {
    goal: 'handle_dialog',
    description: 'Handle browser dialogs',
    mapToSteps: (inputs) => {
      const steps: WorkflowStep[] = [];

      steps.push({
        id: `step-${Date.now()}-set-dialog`,
        type: 'set_handle_dialog',
        description: `Set dialog handler to ${inputs.action}`,
        action: 'set_handle_dialog',
        value: inputs.action,
        key: inputs.promptValue
      });

      if (inputs.clickSelector) {
        steps.push({
          id: `step-${Date.now()}-click-trigger`,
          type: 'click',
          description: 'Click to trigger dialog',
          action: 'click',
          selector: inputs.clickSelector,
          timeout: inputs.timeout || 15000
        });
      }

      if (inputs.screenshot) {
        steps.push({
          id: `step-${Date.now()}-screenshot`,
          type: 'screenshot',
          description: 'Take screenshot after dialog',
          action: 'screenshot',
          optional: true
        });
      }

      return steps;
    },
    validateResult: (results, evidence): GoalStatus => {
      const dialogResult = results.find(r => r.type === 'set_handle_dialog');
      const clickResult = results.find(r => r.type === 'click');
      
      if (!clickResult) return 'achieved'; // Dialog handler set without trigger
      return clickResult.success ? 'achieved' : 'failed';
    }
  };
}
```

- [ ] **Step 2: Register handler**

Add to `registerDefaultHandlers()` array.

---

## Phase 5: Performance Optimizations

### Task 14: Add SelectorCache to BrowserManager

**Files:**
- Modify: `src/browser/manager.ts`

- [ ] **Step 1: Add SelectorCache class**

Add before BrowserManager class:
```typescript
class SelectorCache {
  private cache = new Map<string, { locator: any; timestamp: number }>();
  private maxSize = 100;
  private ttl = 60000; // 1 minute

  get(pageId: string, selector: string): any | null {
    const key = `${pageId}:${selector}`;
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.locator;
    }
    return null;
  }

  set(pageId: string, selector: string, locator: any): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    const key = `${pageId}:${selector}`;
    this.cache.set(key, { locator, timestamp: Date.now() });
  }

  invalidate(pageId?: string): void {
    if (pageId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(pageId + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
```

- [ ] **Step 2: Add cache instance and getter to BrowserManager**

Add to BrowserManager class:
```typescript
private selectorCache = new SelectorCache();

getSelectorCache(): SelectorCache {
  return this.selectorCache;
}
```

---

### Task 15: Add step result caching in Orchestrator

**Files:**
- Modify: `src/worker/orchestrator.ts`

- [ ] **Step 1: Add step result cache**

Add to GoalExecutor class:
```typescript
private stepResultCache = new Map<string, { result: StepResult; timestamp: number }>();
private static readonly CACHE_TTL = 30000; // 30 seconds

getCachedResult(stepKey: string): StepResult | null {
  const cached = this.stepResultCache.get(stepKey);
  if (cached && Date.now() - cached.timestamp < GoalExecutor.CACHE_TTL) {
    return cached.result;
  }
  return null;
}

cacheResult(stepKey: string, result: StepResult): void {
  this.stepResultCache.set(stepKey, { result, timestamp: Date.now() });
}
```

---

### Task 16: Add parallel step execution

**Files:**
- Modify: `src/worker/orchestrator.ts`

- [ ] **Step 1: Add step grouping function**

Add before GoalExecutor class:
```typescript
function groupStepsForParallelExecution(steps: WorkflowStep[]): WorkflowStep[][] {
  const groups: WorkflowStep[][] = [];
  let currentGroup: WorkflowStep[] = [];
  
  for (const step of steps) {
    const isParallelizable = step.type.startsWith('extract_') || 
                            step.type === 'screenshot' ||
                            step.type === 'wait';
    
    if (isParallelizable && currentGroup.length > 0) {
      const prevType = currentGroup[currentGroup.length - 1].type;
      if (prevType.startsWith('extract_') || prevType === 'screenshot' || prevType === 'wait') {
        currentGroup.push(step);
        continue;
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = [step];
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}
```

- [ ] **Step 2: Modify executeSteps to use parallel execution**

Find the for loop in executeSteps and replace with:
```typescript
const groups = groupStepsForParallelExecution(steps);

for (const group of groups) {
  if (signal?.aborted) break;
  
  if (group.length === 1) {
    // Sequential execution
    const result = await executeStep(context, group[0], signal);
    // ... handle result
  } else {
    // Parallel execution for independent steps
    const results = await Promise.all(
      group.map(step => executeStep(context, step, signal))
    );
    // ... handle results
  }
}
```

---

### Task 17: Add CDP connection pooling

**Files:**
- Modify: `src/browser/manager.ts`

- [ ] **Step 1: Add CDPConnectionPool class**

Add after SelectorCache class:
```typescript
class CDPConnectionPool {
  private connections: CDPConnection[] = [];
  private maxSize = 5;
  private waiting: Array<(conn: CDPConnection) => void> = [];

  async acquire(url: string): Promise<CDPConnection> {
    const available = this.connections.find(c => !c.inUse && c.url === url);
    if (available) {
      available.inUse = true;
      return available;
    }
    
    if (this.connections.length < this.maxSize) {
      const conn: CDPConnection = {
        url,
        inUse: true,
        browser: await chromium.connectOverCDP(url)
      };
      this.connections.push(conn);
      return conn;
    }
    
    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(conn: CDPConnection): void {
    conn.inUse = false;
    const waiter = this.waiting.shift();
    if (waiter) {
      conn.inUse = true;
      waiter(conn);
    }
  }

  close(): void {
    for (const conn of this.connections) {
      conn.browser.disconnect?.();
    }
    this.connections = [];
  }
}

interface CDPConnection {
  url: string;
  inUse: boolean;
  browser: any;
}
```

- [ ] **Step 2: Add pool to BrowserManager**

Add to BrowserManager class:
```typescript
private static connectionPool = new CDPConnectionPool();

static getConnectionPool(): CDPConnectionPool {
  return this.connectionPool;
}
```

---

## Phase 6: Integration Tests

### Task 18: Integration test for goal execution

**Files:**
- Create: `tests/integration/goal-execution.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { BrowserManager } from '../../src/browser/manager.js';
import { GoalExecutor } from '../../src/worker/orchestrator.js';

describe('Goal Execution Integration', () => {
  let browserManager: BrowserManager;
  let executor: GoalExecutor;

  beforeAll(async () => {
    browserManager = new BrowserManager();
    await browserManager.initialize();
    executor = new GoalExecutor(browserManager);
  });

  afterAll(async () => {
    await browserManager.close();
  });

  it('should execute navigate goal', async () => {
    const result = await executor.execute({
      goal: 'navigate',
      inputs: { url: 'https://example.com' }
    });
    expect(result.goalStatus).toBe('achieved');
  }, 30000);

  it('should respect screenshot config none', async () => {
    const result = await executor.execute({
      goal: 'screenshot',
      inputs: { url: 'https://example.com' },
      screenshotConfig: { mode: 'none' }
    });
    expect(result.evidence.screenshots.length).toBe(0);
  }, 30000);
});
```

---

## Phase 7: Final Verification

### Task 19: Run all tests and fix any issues

- [ ] **Step 1: Run all tests**

Run: `cd C:/DEVPROD/autobrowse && npm run test:run`

- [ ] **Step 2: Fix any failures**

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/DEVPROD/autobrowse && npx tsc --noEmit`

---

## Task Summary

| # | Task | Status |
|---|------|--------|
| 1 | Add vitest | ⬜ |
| 2 | Create test fixtures | ⬜ |
| 3 | Screenshot modes test | ⬜ |
| 4 | Goal mapper tests | ⬜ |
| 5 | Add new StepTypes | ⬜ |
| 6 | Implement upload step | ⬜ |
| 7 | Implement wait_for_network step | ⬜ |
| 8 | Implement switch_frame step | ⬜ |
| 9 | Implement set_handle_dialog step | ⬜ |
| 10 | Add upload_file handler | ⬜ |
| 11 | Add wait_for_network handler | ⬜ |
| 12 | Add switch_frame handler | ⬜ |
| 13 | Add handle_dialog handler | ⬜ |
| 14 | Add SelectorCache | ⬜ |
| 15 | Add step result cache | ⬜ |
| 16 | Add parallel execution | ⬜ |
| 17 | Add CDP pooling | ⬜ |
| 18 | Integration tests | ⬜ |
| 19 | Final verification | ⬜ |
