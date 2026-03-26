import { Page } from 'playwright';
import { createLogger } from '../logger/index.js';

const logger = createLogger('browser-actions');

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function openUrl(page: Page, url: string): Promise<ActionResult> {
  try {
    logger.info('Opening URL', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    return { success: true, data: { url: page.url() } };
  } catch (err) {
    logger.error('Failed to open URL', { err, url });
    return { success: false, error: String(err) };
  }
}

export async function click(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.click(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Click failed: ${err}` };
  }
}

export async function type(page: Page, selector: string, text: string): Promise<ActionResult> {
  try {
    await page.fill(selector, text);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Type failed: ${err}` };
  }
}

export async function selectOption(page: Page, selector: string, value: string): Promise<ActionResult> {
  try {
    await page.selectOption(selector, value);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Select failed: ${err}` };
  }
}

export async function scroll(page: Page, x?: number, y?: number): Promise<ActionResult> {
  try {
    await page.evaluate(([x, y]) => {
      window.scrollTo(x || 0, y || 0);
    }, [x, y]);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Scroll failed: ${err}` };
  }
}

export async function wait(page: Page, timeout: number): Promise<ActionResult> {
  try {
    await page.waitForTimeout(timeout);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Wait failed: ${err}` };
  }
}

export async function extractText(page: Page, selector?: string): Promise<ActionResult> {
  try {
    if (selector) {
      const text = await page.textContent(selector);
      return { success: true, data: text };
    }
    const text = await page.content();
    return { success: true, data: text };
  } catch (err) {
    return { success: false, error: `Extract failed: ${err}` };
  }
}

export async function takeScreenshot(page: Page, screenshotPath: string): Promise<ActionResult> {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { success: true, data: { path: screenshotPath } };
  } catch (err) {
    return { success: false, error: `Screenshot failed: ${err}` };
  }
}

export async function confirmState(page: Page, selector: string): Promise<ActionResult> {
  try {
    const element = await page.$(selector);
    const isVisible = element ? await element.isVisible() : false;
    return { success: isVisible, data: { visible: isVisible } };
  } catch (err) {
    return { success: false, error: `Confirm state failed: ${err}` };
  }
}

export interface BrowserAction {
  type: 'open_url' | 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'extract_text' | 'screenshot' | 'confirm_state';
  selector?: string;
  value?: string;
  timeout?: number;
  x?: number;
  y?: number;
  path?: string;
}

export async function executeAction(page: Page, action: BrowserAction): Promise<ActionResult> {
  switch (action.type) {
    case 'open_url':
      return openUrl(page, action.value || '');
    case 'click':
      return click(page, action.selector || '');
    case 'type':
      return type(page, action.selector || '', action.value || '');
    case 'select':
      return selectOption(page, action.selector || '', action.value || '');
    case 'scroll':
      return scroll(page, action.x, action.y);
    case 'wait':
      return wait(page, action.timeout || 1000);
    case 'extract_text':
      return extractText(page, action.selector);
    case 'screenshot':
      return takeScreenshot(page, action.path || './screenshots/screenshot.png');
    case 'confirm_state':
      return confirmState(page, action.selector || '');
    default:
      return { success: false, error: `Unknown action type: ${action.type}` };
  }
}