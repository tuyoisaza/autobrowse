import { chromium, Browser, BrowserContext, BrowserType, Page, ChromiumBrowser } from 'playwright';
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

export type BrowserMode = 'launch' | 'cdp';

export interface BrowserManagerOptions {
  mode?: BrowserMode;
  cdpUrl?: string;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentSessionId: string | null = null;
  private mode: BrowserMode = 'launch';
  private cdpUrl: string | null = null;

  async initialize(sessionId?: string, options?: BrowserManagerOptions): Promise<void> {
    this.mode = options?.mode || 'launch';
    this.cdpUrl = options?.cdpUrl || null;

    if (this.browser) {
      logger.info('Reusing existing browser instance');
      return;
    }

    if (this.mode === 'cdp') {
      await this.initializeViaCDP();
    } else {
      await this.initializeViaLaunch(sessionId);
    }
  }

  private async initializeViaLaunch(sessionId?: string): Promise<void> {
    const config = getBrowserConfig();
    
    logger.info('Launching browser', { headless: config.headless });
    
    const launchOptions: Parameters<BrowserType['launch']>[0] = {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    
    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (headlessError) {
      logger.warn('Headless launch failed, trying with different args', { error: headlessError });
      this.browser = await chromium.launch({ ...launchOptions, channel: 'chromium' });
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
    
    logger.info('Browser initialized via launch', { sessionId: this.currentSessionId });
  }

  private async initializeViaCDP(): Promise<void> {
    if (!this.cdpUrl) {
      throw new Error('CDP URL required when mode is "cdp". Provide cdpUrl in options.');
    }
    
    logger.info('Connecting to browser via CDP', { cdpUrl: this.cdpUrl });
    
    try {
      this.browser = await chromium.connectOverCDP(this.cdpUrl);
      
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
      } else {
        this.context = await this.browser.newContext();
      }
      
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
      
      this.currentSessionId = 'cdp-session';
      logger.info('Browser connected via CDP', { sessionId: this.currentSessionId });
    } catch (err) {
      logger.error('Failed to connect via CDP', { error: err, cdpUrl: this.cdpUrl });
      throw err;
    }
  }

  async connectToElectron(debuggerUrl: string): Promise<void> {
    logger.info('Connecting to Electron Chromium via CDP', { debuggerUrl });
    await this.initialize(undefined, { mode: 'cdp', cdpUrl: debuggerUrl });
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      if (this.mode === 'cdp') {
        await (this.browser as any).disconnect?.().catch(() => {});
      } else {
        await this.browser.close().catch(() => {});
      }
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

  getBrowser(): Browser | null {
    return this.browser;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  getMode(): BrowserMode {
    return this.mode;
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
    return this.browser !== null && this.page !== null;
  }

  isExternalBrowser(): boolean {
    return this.mode === 'cdp';
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
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key) result[key] = ls.getItem(key) || '';
    }
    return result;
  });
  const sessionStorage = await page.evaluate(() => {
    const result: Record<string, string> = {};
    const ss = window.sessionStorage;
    for (let i = 0; i < ss.length; i++) {
      const key = ss.key(i);
      if (key) result[key] = ss.getItem(key) || '';
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
