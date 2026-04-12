import type { Page, Locator } from 'playwright';
import { WorkflowStep, StepResult, EvidenceData } from './types.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('worker:executor');

export interface ExecutionContext {
  page: Page;
  stepResults: StepResult[];
  evidence: EvidenceData;
}

export interface StepProgress {
  onStepComplete?: (step: WorkflowStep, result: StepResult) => void;
  onStepError?: (step: WorkflowStep, error: Error) => void;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    });
  });
}

async function findElement(page: Page, selector: string): Promise<Locator> {
  const trimmed = selector.trim();
  
  if (trimmed.startsWith('text=') || trimmed.startsWith('"')) {
    const text = trimmed.replace(/^text=/, '').replace(/^["']|["']$/g, '');
    return page.locator(`text="${text}"`).first();
  }
  
  if (trimmed.includes(':has-text(') || trimmed.includes(':right-of') || trimmed.includes(':left-of')) {
    return page.locator(trimmed).first();
  }
  
  const validSelectors = ['#', '.', '[', 'input', 'button', 'a', 'select', 'textarea', 'form', 'table', 'div', 'span', 'li'];
  if (validSelectors.some(s => trimmed.startsWith(s))) {
    return page.locator(trimmed).first();
  }
  
  return page.locator(`text="${selector}"`).first();
}

async function executeWithRetry(
  fn: () => Promise<void>,
  maxAttempts: number,
  delayMs: number,
  backoff: 'linear' | 'exponential' = 'exponential',
  signal?: AbortSignal
): Promise<void> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');
    
    try {
      await fn();
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts - 1 && !signal?.aborted) {
        const delay = backoff === 'exponential' 
          ? delayMs * Math.pow(2, attempt) 
          : delayMs * (attempt + 1);
        await sleep(delay, signal);
      }
    }
  }
  
  throw lastError;
}

export async function executeStep(
  context: ExecutionContext,
  step: WorkflowStep,
  signal?: AbortSignal
): Promise<StepResult> {
  if (signal?.aborted) {
    return {
      stepId: step.id,
      type: step.type,
      description: step.description,
      success: false,
      duration: 0,
      error: 'Aborted'
    };
  }

  const startTime = Date.now();
  const result: StepResult = {
    stepId: step.id,
    type: step.type,
    description: step.description,
    success: false,
    duration: 0
  };

  try {
    logger.info(`Executing step: ${step.type}`, { stepId: step.id, description: step.description });

    switch (step.type) {
      case 'navigate':
        await context.page.goto(step.value!, { 
          waitUntil: 'domcontentloaded', 
          timeout: step.timeout || 30000 
        });
        await context.page.waitForLoadState('networkidle').catch(() => {});
        break;

      case 'click': {
        const locator = await findElement(context.page, step.selector!);
        await executeWithRetry(async () => {
          try {
            await locator.click({ timeout: 5000 });
          } catch (clickErr) {
            await locator.scrollIntoViewIfNeeded().catch(() => {});
            await locator.click({ force: true });
          }
        }, step.retry?.maxAttempts || 3, step.retry?.delayMs || 1000, 'exponential', signal);
        break;
      }

      case 'double_click': {
        const locator = await findElement(context.page, step.selector!);
        await locator.dblclick();
        break;
      }

      case 'type': {
        const locator = await findElement(context.page, step.selector!);
        await executeWithRetry(async () => {
          await locator.click();
          await context.page.keyboard.type(step.value!, { delay: 50 });
        }, step.retry?.maxAttempts || 3, step.retry?.delayMs || 500, 'linear', signal);
        break;
      }

      case 'fill': {
        const locator = await findElement(context.page, step.selector!);
        await locator.fill(step.value || '');
        break;
      }

      case 'clear': {
        const locator = await findElement(context.page, step.selector!);
        await locator.clear();
        break;
      }

      case 'search': {
        const locator = await findElement(context.page, step.selector!);
        try {
          const tagName = await locator.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'input' || tagName === 'textarea') {
            await locator.click();
            await locator.fill('');
            await context.page.keyboard.type(step.value!, { delay: 50 });
          } else {
            await locator.click();
            await context.page.keyboard.type(step.value!, { delay: 50 });
          }
        } catch {
          await context.page.keyboard.type(step.value!, { delay: 50 });
        }
        await context.page.keyboard.press('Enter');
        await context.page.waitForLoadState('networkidle').catch(() => {});
        break;
      }

      case 'submit': {
        const patterns = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Submit")',
          'button:has-text("Sign In")',
          'button:has-text("Log In")',
          'button:has-text("Login")',
          'button:has-text("Continue")',
          'button:has-text("Enviar")',
          'button:has-text("Guardar")',
          '[data-testid="submit"]'
        ];
        
        for (const pattern of patterns) {
          try {
            const locator = context.page.locator(pattern);
            if (await locator.count() > 0) {
              await locator.first().click({ timeout: 5000 });
              break;
            }
          } catch {}
        }
        break;
      }

      case 'select': {
        if (step.value) {
          const locator = await findElement(context.page, step.selector!);
          await locator.selectOption(step.value);
        }
        break;
      }

      case 'check': {
        const locator = await findElement(context.page, step.selector!);
        const isChecked = await locator.isChecked();
        if ((step.value === 'true' && !isChecked) || (step.value === 'false' && isChecked)) {
          await locator.check();
        }
        break;
      }

      case 'wait':
        await sleep(parseInt(step.value || '2000'), signal);
        break;

      case 'wait_for':
        await context.page.waitForSelector(step.selector!, { 
          timeout: step.timeout || 30000,
          state: step.value === 'hidden' ? 'hidden' : 'visible'
        }).catch(() => {});
        break;

      case 'wait_for_navigation':
        await context.page.waitForLoadState(step.value as any || 'networkidle').catch(() => {});
        break;

      case 'screenshot': {
        const screenshot = await context.page.screenshot({ 
          fullPage: step.value !== 'viewport'
        });
        context.evidence.screenshots.push(screenshot);
        result.screenshot = screenshot.toString('base64');
        break;
      }

      case 'screenshot_element': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          const screenshot = await locator.screenshot();
          context.evidence.screenshots.push(screenshot);
          result.screenshot = screenshot.toString('base64');
        }
        break;
      }

      case 'extract': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          const text = await locator.textContent().catch(() => '') || undefined;
          const key = step.value || `extracted_${step.id}`;
          context.evidence.extractedData[key] = text;
          result.extractedValue = text;
        }
        break;
      }

      case 'extract_all': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          const texts = await locator.allTextContents();
          const key = step.value || `extracted_all_${step.id}`;
          context.evidence.extractedData[key] = texts;
          result.extractedValue = JSON.stringify(texts);
        }
        break;
      }

      case 'extract_attribute': {
        if (step.selector && step.key) {
          const locator = await findElement(context.page, step.selector);
          const value = await locator.getAttribute(step.key);
          const key = step.value || `attr_${step.key}`;
          context.evidence.extractedData[key] = value;
          result.extractedValue = value || undefined;
        }
        break;
      }

      case 'scroll':
        if (step.direction === 'bottom') {
          await context.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } else if (step.direction === 'top') {
          await context.page.evaluate(() => window.scrollTo(0, 0));
        } else {
          await context.page.evaluate((px) => window.scrollBy(0, px), parseInt(step.value || '500'));
        }
        break;

      case 'scroll_to_element': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          await locator.scrollIntoViewIfNeeded();
        }
        break;
      }

      case 'press_key':
        await context.page.keyboard.press(step.key || 'Enter');
        break;

      case 'press_keys': {
        const keys = (step.value || '').split('+').map(k => k.trim());
        for (const key of keys) {
          await context.page.keyboard.press(key);
        }
        break;
      }

      case 'hover': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          await locator.hover();
        }
        break;
      }

      case 'go_back':
        await context.page.goBack();
        break;

      case 'go_forward':
        await context.page.goForward();
        break;

      case 'refresh':
        await context.page.reload();
        break;

      case 'verify': {
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          const exists = await locator.count() > 0;
          if (!exists) {
            throw new Error(`Verification failed: selector "${step.selector}" not found`);
          }
          if (step.value === 'visible') {
            const isVisible = await locator.isVisible();
            if (!isVisible) {
              throw new Error(`Verification failed: selector "${step.selector}" not visible`);
            }
          }
        }
        break;
      }

      case 'verify_text': {
        if (step.selector && step.value) {
          const locator = await findElement(context.page, step.selector);
          const text = await locator.textContent();
          if (!text?.includes(step.value)) {
            throw new Error(`Verification failed: expected text "${step.value}" not found in "${text}"`);
          }
        }
        break;
      }

      case 'extract_links': {
        const selector = step.selector || 'a[href]';
        const links = await context.page.$$eval(selector, (els) =>
          els.map((el) => ({
            text: el.textContent?.trim(),
            href: el.getAttribute('href'),
            target: el.getAttribute('target')
          }))
        );
        context.evidence.extractedData['links'] = links;
        result.extractedValue = JSON.stringify(links);
        break;
      }

      case 'extract_table': {
        if (step.selector) {
          const tableData = await context.page.$$eval(step.selector, (tables) => {
            return tables.map(table => {
              const rows = table.querySelectorAll('tr');
              return Array.from(rows).map(row => {
                const cells = row.querySelectorAll('th, td');
                return Array.from(cells).map(cell => cell.textContent?.trim() || '');
              });
            });
          });
          const key = step.value || 'table_data';
          context.evidence.extractedData[key] = tableData;
          result.extractedValue = JSON.stringify(tableData);
        }
        break;
      }

      case 'get_value': {
        if (step.selector) {
          const value = await context.page.inputValue(step.selector);
          const key = step.value || 'inputValue';
          context.evidence.extractedData[key] = value;
          result.extractedValue = value;
        }
        break;
      }

      case 'evaluate': {
        if (step.value) {
          const result = await context.page.evaluate((fn) => {
            return new Function(`return (${fn})()`)();
          }, step.value);
          context.evidence.extractedData['eval_result'] = result;
        }
        break;
      }

      case 'conditional': {
        if (step.condition && step.condition.thenSteps) {
          let shouldExecute = false;
          
          if (step.condition.type === 'if_exists') {
            const locator = context.page.locator(step.condition.selector);
            shouldExecute = await locator.count() > 0;
          } else if (step.condition.type === 'if_not_exists') {
            const locator = context.page.locator(step.condition.selector);
            shouldExecute = await locator.count() === 0;
          } else if (step.condition.type === 'if_visible') {
            const locator = context.page.locator(step.condition.selector);
            shouldExecute = await locator.isVisible().catch(() => false);
          } else if (step.condition.type === 'if_not_visible') {
            const locator = context.page.locator(step.condition.selector);
            shouldExecute = !(await locator.isVisible().catch(() => false));
          }
          
          const stepsToRun = shouldExecute 
            ? step.condition.thenSteps 
            : step.condition.elseSteps;
          
          if (stepsToRun) {
            for (const subStep of stepsToRun) {
              const subResult = await executeStep(context, subStep, signal);
              context.stepResults.push(subResult);
            }
          }
        }
        break;
      }

      case 'unknown':
        logger.warn(`Unknown step type: ${step.action}`, { stepId: step.id });
        break;

      default:
        if (step.selector) {
          const locator = await findElement(context.page, step.selector);
          await locator.click().catch(() => {});
        }
    }

    result.success = true;
    logger.info(`Step completed: ${step.type}`, { stepId: step.id, success: true });

  } catch (err) {
    result.success = false;
    result.error = err instanceof Error ? err.message : String(err);
    
    if (signal?.aborted) {
      result.error = 'Aborted';
    }
    
    if (step.optional) {
      logger.warn(`Optional step failed: ${step.type}`, { stepId: step.id, error: err });
      result.success = true;
    } else {
      logger.error(`Step failed: ${step.type}`, { stepId: step.id, error: err });
    }
  }

  result.duration = Date.now() - startTime;
  context.stepResults.push(result);

  return result;
}

export async function executeSteps(
  page: Page,
  steps: WorkflowStep[],
  onProgress?: StepProgress,
  stopOnError: boolean = true,
  signal?: AbortSignal
): Promise<ExecutionContext> {
  const context: ExecutionContext = {
    page,
    stepResults: [],
    evidence: {
      screenshots: [],
      extractedData: {},
      logs: []
    }
  };

  for (const step of steps) {
    if (signal?.aborted) {
      logger.info('Execution aborted, stopping', { lastStepId: step.id });
      break;
    }

    let result: StepResult;
    
    try {
      result = await executeStep(context, step, signal);
    } catch (err) {
      result = {
        stepId: step.id,
        type: step.type,
        description: step.description,
        success: false,
        duration: 0,
        error: err instanceof Error ? err.message : String(err)
      };
      context.stepResults.push(result);
    }
    
    if (onProgress) {
      if (result.success) {
        onProgress.onStepComplete?.(step, result);
      } else {
        onProgress.onStepError?.(step, new Error(result.error || 'Unknown error'));
      }
    }

    if (!result.success && stopOnError && !step.optional) {
      logger.info('Stopping execution due to step failure', { stepId: step.id, error: result.error });
      break;
    }
  }

  try {
    context.evidence.finalUrl = page.url();
    context.evidence.finalTitle = await page.title();
  } catch {
    context.evidence.finalUrl = undefined;
    context.evidence.finalTitle = undefined;
  }

  return context;
}
