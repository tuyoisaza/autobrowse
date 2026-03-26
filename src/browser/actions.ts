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

export async function doubleClick(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.dblclick(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Double click failed: ${err}` };
  }
}

export async function hover(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.hover(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Hover failed: ${err}` };
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

export async function clear(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.fill(selector, '');
    return { success: true };
  } catch (err) {
    return { success: false, error: `Clear failed: ${err}` };
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

export async function check(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.check(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Check failed: ${err}` };
  }
}

export async function uncheck(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.uncheck(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Uncheck failed: ${err}` };
  }
}

export async function pressKey(page: Page, key: string): Promise<ActionResult> {
  try {
    await page.keyboard.press(key);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Press key failed: ${err}` };
  }
}

export async function scroll(page: Page, direction?: string, amount?: number): Promise<ActionResult> {
  try {
    if (direction === 'bottom') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else if (direction === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (amount) {
      await page.evaluate((y) => window.scrollBy(0, y), amount);
    } else {
      await page.evaluate(() => window.scrollBy(0, 500));
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: `Scroll failed: ${err}` };
  }
}

export async function scrollToElement(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.locator(selector).scrollIntoViewIfNeeded();
    return { success: true };
  } catch (err) {
    return { success: false, error: `Scroll to element failed: ${err}` };
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

export async function waitForSelector(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.waitForSelector(selector, { timeout: 30000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: `Wait for selector failed: ${err}` };
  }
}

export async function extractText(page: Page, selector?: string): Promise<ActionResult> {
  try {
    if (selector) {
      const text = await page.textContent(selector);
      return { success: true, data: text };
    }
    return { success: true, data: await page.content() };
  } catch (err) {
    return { success: false, error: `Extract failed: ${err}` };
  }
}

export async function extractHtml(page: Page, selector?: string): Promise<ActionResult> {
  try {
    if (selector) {
      const html = await page.innerHTML(selector);
      return { success: true, data: html };
    }
    return { success: true, data: await page.content() };
  } catch (err) {
    return { success: false, error: `Extract HTML failed: ${err}` };
  }
}

export async function getTitle(page: Page): Promise<ActionResult> {
  try {
    const title = await page.title();
    return { success: true, data: title };
  } catch (err) {
    return { success: false, error: `Get title failed: ${err}` };
  }
}

export async function extractLinks(page: Page): Promise<ActionResult> {
  try {
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return Array.from(anchors).map(a => ({
        text: a.textContent?.trim(),
        href: a.href
      }));
    });
    return { success: true, data: links };
  } catch (err) {
    return { success: false, error: `Extract links failed: ${err}` };
  }
}

export async function extractImages(page: Page): Promise<ActionResult> {
  try {
    const images = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      return Array.from(imgs).map(img => ({
        src: img.src,
        alt: img.alt
      }));
    });
    return { success: true, data: images };
  } catch (err) {
    return { success: false, error: `Extract images failed: ${err}` };
  }
}

export async function getValue(page: Page, selector: string): Promise<ActionResult> {
  try {
    const value = await page.inputValue(selector);
    return { success: true, data: value };
  } catch (err) {
    return { success: false, error: `Get value failed: ${err}` };
  }
}

export async function getAttribute(page: Page, selector: string, attr: string): Promise<ActionResult> {
  try {
    const value = await page.getAttribute(selector, attr);
    return { success: true, data: value };
  } catch (err) {
    return { success: false, error: `Get attribute failed: ${err}` };
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

export async function goBack(page: Page): Promise<ActionResult> {
  try {
    await page.goBack();
    return { success: true };
  } catch (err) {
    return { success: false, error: `Go back failed: ${err}` };
  }
}

export async function goForward(page: Page): Promise<ActionResult> {
  try {
    await page.goForward();
    return { success: true };
  } catch (err) {
    return { success: false, error: `Go forward failed: ${err}` };
  }
}

export async function refresh(page: Page): Promise<ActionResult> {
  try {
    await page.reload();
    return { success: true };
  } catch (err) {
    return { success: false, error: `Refresh failed: ${err}` };
  }
}

export interface BrowserAction {
  type: 
    | 'open_url' | 'click' | 'dblclick' | 'hover' | 'type' | 'clear' | 'select' 
    | 'check' | 'uncheck' | 'press_key' | 'scroll' | 'scroll_to' | 'wait' | 'wait_for'
    | 'extract_text' | 'extract_html' | 'get_title' | 'extract_links' | 'extract_images'
    | 'get_value' | 'get_attribute' | 'screenshot' | 'confirm_state'
    | 'go_back' | 'go_forward' | 'refresh' | 'download';
  selector?: string;
  value?: string;
  key?: string;
  timeout?: number;
  direction?: string;
  path?: string;
  attribute?: string;
}

export async function executeAction(page: Page, action: BrowserAction): Promise<ActionResult> {
  switch (action.type) {
    case 'open_url':
      return openUrl(page, action.value || '');
    case 'click':
      return click(page, action.selector || '');
    case 'dblclick':
      return doubleClick(page, action.selector || '');
    case 'hover':
      return hover(page, action.selector || '');
    case 'type':
      return type(page, action.selector || '', action.value || '');
    case 'clear':
      return clear(page, action.selector || '');
    case 'select':
      return selectOption(page, action.selector || '', action.value || '');
    case 'check':
      return check(page, action.selector || '');
    case 'uncheck':
      return uncheck(page, action.selector || '');
    case 'press_key':
      return pressKey(page, action.key || 'Enter');
    case 'scroll':
      return scroll(page, action.direction, action.value ? parseInt(action.value) : undefined);
    case 'scroll_to':
      return scrollToElement(page, action.selector || '');
    case 'wait':
      return wait(page, action.timeout || parseInt(action.value || '1000'));
    case 'wait_for':
      return waitForSelector(page, action.selector || '');
    case 'extract_text':
      return extractText(page, action.selector);
    case 'extract_html':
      return extractHtml(page, action.selector);
    case 'get_title':
      return getTitle(page);
    case 'extract_links':
      return extractLinks(page);
    case 'extract_images':
      return extractImages(page);
    case 'get_value':
      return getValue(page, action.selector || '');
    case 'get_attribute':
      return getAttribute(page, action.selector || '', action.value || '');
    case 'screenshot':
      return takeScreenshot(page, action.path || `./screenshots/${Date.now()}.png`);
    case 'confirm_state':
      return confirmState(page, action.selector || '');
    case 'go_back':
      return goBack(page);
    case 'go_forward':
      return goForward(page);
    case 'refresh':
      return refresh(page);
    case 'download':
      return { success: true, data: { message: 'Download action - configure download path separately' } };
    default:
      return { success: false, error: `Unknown action type: ${action.type}` };
  }
}