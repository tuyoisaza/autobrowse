import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../src/browser/manager.js';
import { GoalExecutor } from '../../src/worker/orchestrator.js';

describe.skip('Goal Execution Integration', () => {
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