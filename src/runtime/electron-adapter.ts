import { BrowserManager } from '../browser/manager.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('runtime:electron-adapter');

export interface ElectronSession {
  defaultSession: {
    debuggerWebSocketUrl: string;
  };
}

export interface ElectronAdapterOptions {
  session?: ElectronSession;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class ElectronAdapter {
  private browserManager: BrowserManager;
  private session: ElectronSession | null = null;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;

  constructor(options?: Partial<ElectronAdapterOptions>) {
    this.browserManager = new BrowserManager();
    this.autoReconnect = options?.autoReconnect ?? true;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 3;
  }

  async connect(session: ElectronSession): Promise<void> {
    this.session = session;
    await this.attemptConnect();
  }

  private async attemptConnect(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not set. Call connect() first.');
    }

    const debuggerUrl = this.session.defaultSession.debuggerWebSocketUrl;
    
    if (!debuggerUrl) {
      throw new Error('Electron debugger not enabled. Enable with webContent.openDevTools() or session.setDevToolsWebContents()');
    }

    try {
      await this.browserManager.connectToElectron(debuggerUrl);
      this.reconnectAttempts = 0;
      logger.info('Connected to Electron Chromium via CDP');
    } catch (err) {
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.warn(`CDP connection failed, retrying (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, { error: err });
        await new Promise(resolve => setTimeout(resolve, 1000 * this.reconnectAttempts));
        await this.attemptConnect();
      } else {
        throw err;
      }
    }
  }

  getBrowserManager(): BrowserManager {
    return this.browserManager;
  }

  getPage() {
    return this.browserManager.getPage();
  }

  isConnected(): boolean {
    return this.browserManager.isInitialized();
  }

  async disconnect(): Promise<void> {
    await this.browserManager.close();
    logger.info('Disconnected from Electron Chromium');
  }
}

export function createElectronAdapter(options?: ElectronAdapterOptions): ElectronAdapter {
  return new ElectronAdapter(options);
}

export function getCDPUrlFromElectronSession(session: ElectronSession): string | null {
  return session.defaultSession?.debuggerWebSocketUrl || null;
}
