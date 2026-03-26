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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    this.browser = await chromium.launch(launchOptions);
    
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