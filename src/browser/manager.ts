import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createLogger } from '../logger/index.js';
import { getConfig as dbGetConfig } from '../db/queries.js';
import * as path from 'path';
import * as fs from 'fs';

const logger = createLogger('browser-manager');

function getBrowserConfig() {
  return {
    headless: dbGetConfig('browser.headless') === 'true',
    profilePath: dbGetConfig('browser.profilePath') || './profiles'
  };
}

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentSessionId: string | null = null;
  
  async initialize(sessionId?: string): Promise<void> {
    const config = getBrowserConfig();
    
    if (this.browser) {
      logger.info('Reusing existing browser instance');
      return;
    }
    
    logger.info('Launching browser', { headless: config.headless });
    
    const launchOptions: any = {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    
    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (headlessError) {
      logger.warn('Headless launch failed, trying headless shell', { error: headlessError });
      this.browser = await chromium.launchHeadless(launchOptions);
    }
    
    const contextOptions: any = {};
    if (sessionId) {
      const profilePath = path.join(config.profilePath, sessionId);
      if (fs.existsSync(profilePath)) {
        contextOptions.userDataDir = profilePath;
        logger.info('Using existing profile', { profilePath });
      }
    }
    
    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
    this.currentSessionId = sessionId || 'default';
    
    logger.info('Browser initialized', { sessionId: this.currentSessionId });
  }
  
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.currentSessionId = null;
    logger.info('Browser closed');
  }
  
  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }
  
  getSessionId(): string | null {
    return this.currentSessionId;
  }
  
  async saveProfile(sessionId: string): Promise<void> {
    const config = getBrowserConfig();
    const profilePath = path.join(config.profilePath, sessionId);
    
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }
    
    if (this.context) {
      await this.context.storageState({ path: path.join(profilePath, 'storageState.json') });
      logger.info('Profile saved', { profilePath });
    }
  }
  
  isInitialized(): boolean {
    return this.browser !== null;
  }
}

export const browserManager = new BrowserManager();
export async function exportBrowserState(page: Page): Promise<{
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}> {
  const cookies = await page.context().cookies();
  const localStorage = await page.evaluate(() => {
    const result: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) result[key] = localStorage.getItem(key) || '';
    }
    return result;
  });
  const sessionStorage = await page.evaluate(() => {
    const result: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) result[key] = sessionStorage.getItem(key) || '';
    }
    return result;
  });
  return { cookies, localStorage, sessionStorage };
}

export async function importBrowserState(page: Page, state: {
  cookies?: any[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}) {
  if (state.cookies?.length) {
    await page.context().addCookies(state.cookies);
  }
  if (state.localStorage) {
    await page.evaluate((ls) => {
      Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v));
    }, state.localStorage);
  }
  if (state.sessionStorage) {
    await page.evaluate((ss) => {
      Object.entries(ss).forEach(([k, v]) => sessionStorage.setItem(k, v));
    }, state.sessionStorage);
  }
}
