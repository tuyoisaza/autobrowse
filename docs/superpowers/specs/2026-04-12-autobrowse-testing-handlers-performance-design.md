# AutoBrowse: Testing + Handlers + Performance

**Date:** 2026-04-12
**Status:** Approved

## Overview

Add comprehensive tests, 4 new goal handlers, and performance optimizations to AutoBrowse engine.

---

## 1. Test Infrastructure

### Framework
- **vitest** - Fast, modern test runner with excellent TypeScript support

### Structure
```
tests/
├── unit/
│   ├── goal-mapper.test.ts      # Goal mapping logic
│   ├── step-executor.test.ts    # Step execution
│   └── screenshot-modes.test.ts  # Screenshot mode handling
├── integration/
│   └── goal-execution.test.ts   # End-to-end goal tests
└── fixtures/
    └── test-data.ts            # Shared test fixtures
```

### Test Coverage
- Unit tests for each goal handler mapping
- Screenshot mode behavior (none/base64/file/both)
- Step execution with mocks
- Integration tests with real browser (optional, skipped in CI)

---

## 2. New Goal Handlers

### 2.1 `upload_file`
**Inputs:**
- `url` (string) - Page URL
- `waitForSelector` (string) - Selector to wait for
- `selector` (string) - File input selector
- `filePath` (string) - Path to file to upload
- `submit` (boolean) - Auto-submit after upload (default: true)
- `waitForNavigation` (string) - Wait event after submit

**Steps Generated:**
1. `navigate` to URL
2. `wait_for` selector
3. `upload` (new step type) - setInputFiles on input
4. `submit` if enabled
5. `wait_for_navigation` if enabled

### 2.2 `wait_for_network`
**Inputs:**
- `waitFor` (string[]) - Request URL patterns to wait for
- `timeout` (number) - Max wait time (default: 30000)
- `action` (string) - Optional action to do while waiting

**Steps Generated:**
1. `wait_for_network` (new step type) - Wait for matching requests
2. Optional action step

### 2.3 `switch_frame`
**Inputs:**
- `url` (string) - Page URL
- `frameSelector` (string) - iframe selector or index
- `actions` (WorkflowStep[]) - Steps to execute in frame
- `switchBack` (boolean) - Return to main frame after (default: true)

**Steps Generated:**
1. `navigate` to URL (if url provided)
2. `switch_frame` to target
3. Execute provided `actions`
4. `switch_frame` back to main (if switchBack)

### 2.4 `handle_dialog`
**Inputs:**
- `action` (string) - 'accept' | 'dismiss' | 'prompt'
- `promptValue` (string) - Value for prompt dialogs
- `clickSelector` (string) - Selector to click that triggers dialog

**Steps Generated:**
1. `set_handle_dialog` (new step type) - Configure dialog handler
2. `click` on trigger selector
3. Optional screenshot after

---

## 3. New Step Types

### 3.1 `upload`
```typescript
case 'upload': {
  const locator = await findElement(context.page, step.selector!);
  await locator.setInputFiles(step.value!);
  break;
}
```

### 3.2 `wait_for_network`
```typescript
case 'wait_for_network': {
  const patterns = step.value?.split(',') || [];
  await context.page.waitForResponse(
    response => patterns.some(p => response.url().includes(p)),
    { timeout: step.timeout || 30000 }
  ).catch(() => {});
  break;
}
```

### 3.3 `switch_frame`
```typescript
case 'switch_frame': {
  const locator = await findElement(context.page, step.selector!);
  // Store current frame, switch to target
  await locator.contentFrame();
  break;
}
```

### 3.4 `set_handle_dialog`
```typescript
case 'set_handle_dialog': {
  const action = step.value; // 'accept' | 'dismiss' | 'prompt'
  context.page.on('dialog', async dialog => {
    if (action === 'accept') await dialog.accept(step.key);
    else if (action === 'dismiss') await dialog.dismiss();
  });
  break;
}
```

---

## 4. Performance Optimizations

### 4.1 Execution Caching

**Selector Cache (LRU):**
```typescript
class SelectorCache {
  private cache = new Map<string, Locator>();
  private maxSize = 100;
  
  get(page: Page, selector: string): Locator | null;
  set(page: Page, selector: string, locator: Locator): void;
  invalidate(): void;
}
```

**Page State Cache:**
- Cache cookies/storage between executions
- Reuse authenticated sessions

### 4.2 Parallel Steps

**Independent Step Detection:**
- Extract operations are independent
- Screenshot operations are independent
- Batch execute: `[extract_1, extract_2, extract_3]` → parallel

```typescript
function groupIndependentSteps(steps: WorkflowStep[]): WorkflowStep[][] {
  // Group: navigates/waits (sequential) + extracts (parallel) + clicks (sequential)
}
```

### 4.3 Resource Pooling

**CDP Connection Pool:**
```typescript
class CDPConnectionPool {
  private pool: CDPConnection[] = [];
  private maxSize = 5;
  
  async acquire(url: string): Promise<CDPConnection>;
  release(connection: CDPConnection): void;
}
```

**Pre-warmed Contexts:**
- Keep 1-2 warm browser contexts ready
- Reduces cold start latency

---

## 5. Implementation Order

1. Add vitest and test structure
2. Write screenshot mode tests (verify bug fix)
3. Add new step types to step-executor
4. Add new goal handlers to goal-mapper
5. Add caching layer
6. Add parallel execution
7. Add resource pooling (CDP mode)
8. Integration tests

---

## 6. Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add vitest, @vitest/ui |
| `vite.config.ts` | Create vitest config |
| `tests/unit/*.test.ts` | New test files |
| `tests/fixtures/test-data.ts` | Test fixtures |
| `src/worker/step-executor.ts` | Add 4 new step types |
| `src/worker/goal-mapper.ts` | Add 4 new handlers |
| `src/browser/manager.ts` | Add SelectorCache, ConnectionPool |
| `src/worker/orchestrator.ts` | Add parallel step execution |

---

## 7. Success Criteria

- [ ] All 4 new goal handlers work correctly
- [ ] Screenshot modes (none/base64/file/both) behave correctly
- [ ] Tests pass: `npm test`
- [ ] No regression in existing functionality
- [ ] Performance improvement measurable in benchmarks
