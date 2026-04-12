import { chromium, Browser, BrowserContext, BrowserType, Page } from 'playwright';
import { createLogger } from '../logger/index.js';
import { getConfig as dbGetConfig } from '../db/queries.js';
import * as path from 'path';
import * as fs from 'fs';

const logger = createLogger('browser-manager');

export type BrowserMode = 'launch' | 'cdp';
export type ScreenshotMode = 'none' | 'base64' | 'file' | 'both';
export type ScreenshotQuality = 'low' | 'medium' | 'high';

export interface ScreenshotConfig {
  mode: ScreenshotMode;
  quality?: ScreenshotQuality;
  outputDir?: string;
  compress?: boolean;
  maxSize?: number;
}

export interface BrowserManagerOptions {
  mode?: BrowserMode;
  cdpUrl?: string;
  screenshots?: ScreenshotConfig;
}

function getBrowserConfig() {
  return {
    headless: dbGetConfig('browser.headless') === 'true',
    profilePath: dbGetConfig('browser.profilePath') || './profiles',
    screenshots: {
      mode: (dbGetConfig('screenshots.mode') as ScreenshotMode) || 'base64',
      quality: (dbGetConfig('screenshots.quality') as ScreenshotQuality) || 'medium',
      outputDir: dbGetConfig('screenshots.outputDir') || './screenshots',
      compress: dbGetConfig('screenshots.compress') !== 'false',
      maxSize: parseInt(dbGetConfig('screenshots.maxSize') || '5000000', 10)
    }
  };
}

class SelectorCache {
  private cache = new Map<string, { locator: any; timestamp: number }>();
  private maxSize = 100;
  private ttl = 60000;

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
      if (firstKey) {
        this.cache.delete(firstKey);
      }
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

interface CDPConnection {
  url: string;
  inUse: boolean;
  browser: any;
}

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

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentSessionId: string | null = null;
  private mode: BrowserMode = 'launch';
  private cdpUrl: string | null = null;
  private screenshotConfig: ScreenshotConfig = { mode: 'base64' };
  private selectorCache = new SelectorCache();
  private static connectionPool = new CDPConnectionPool();

  getSelectorCache(): SelectorCache {
    return this.selectorCache;
  }

  static getConnectionPool(): CDPConnectionPool {
    return this.connectionPool;
  }

  async initialize(sessionId?: string, options?: BrowserManagerOptions): Promise<void> {
    const config = getBrowserConfig();
    this.mode = options?.mode || 'launch';
    this.cdpUrl = options?.cdpUrl || null;
    this.screenshotConfig = options?.screenshots || config.screenshots;

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
    
    const launchOptions = {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    
    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (headlessError) {
      logger.warn('Headless launch failed, trying with different args', { error: headlessError });
      this.browser = await chromium.launch({ ...launchOptions, channel: 'chromium' as const });
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

  getScreenshotConfig(): ScreenshotConfig {
    return { ...this.screenshotConfig };
  }

  setScreenshotConfig(config: Partial<ScreenshotConfig>): void {
    this.screenshotConfig = { ...this.screenshotConfig, ...config };
  }

  async captureScreenshot(
    page: Page,
    options: { fullPage?: boolean; element?: string; name?: string } = {}
  ): Promise<{ path?: string; base64?: string }> {
    const config = this.screenshotConfig;
    
    if (config.mode === 'none') {
      return {};
    }

    const result: { path?: string; base64?: string } = {};
    const name = options.name || `screenshot_${Date.now()}`;

    if (config.outputDir && (config.mode === 'file' || config.mode === 'both')) {
      const outputDir = path.resolve(config.outputDir);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    }

    const qualityMap = { low: 30, medium: 50, high: 80 };
    const quality = qualityMap[config.quality || 'medium'];

    if (config.mode === 'file' || config.mode === 'both') {
      const filename = `${name}.png`;
      const filepath = path.join(config.outputDir || './screenshots', filename);
      await page.screenshot({ 
        path: filepath, 
        fullPage: options.fullPage ?? false,
        ...(options.element ? {} : {}) 
      });
      result.path = filepath;
    }

    if (config.mode === 'base64' || config.mode === 'both') {
      const buffer = await page.screenshot({ 
        fullPage: options.fullPage ?? false,
        type: 'png'
      });
      
      if (config.compress && config.mode === 'base64') {
        result.base64 = buffer.toString('base64');
      } else {
        result.base64 = buffer.toString('base64');
      }
    }

    return result;
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
