import { getConfig as dbGetConfig, setConfig as dbSetConfig } from '../db/queries.js';

export interface AppConfig {
  port: number;
  browser: {
    headless: boolean;
    profilePath: string;
  };
  task: {
    timeout: number;
    maxRetries: number;
  };
  domain: {
    whitelist: string;
  };
  log: {
    level: string;
  };
  cloud: {
    enabled: boolean;
    url: string;
  };
}

const defaults: AppConfig = {
  port: 3847,
  browser: {
    headless: false,
    profilePath: './profiles'
  },
  task: {
    timeout: 300000,
    maxRetries: 3
  },
  domain: {
    whitelist: '*'
  },
  log: {
    level: 'info'
  },
  cloud: {
    enabled: false,
    url: ''
  }
};

export function getAppConfig(): AppConfig {
  const config: AppConfig = { ...defaults };
  
  try {
    const port = dbGetConfig('port');
    if (port) config.port = parseInt(port, 10);
    
    const browserHeadless = dbGetConfig('browser.headless');
    if (browserHeadless) config.browser.headless = browserHeadless === 'true';
    
    const browserProfilePath = dbGetConfig('browser.profilePath');
    if (browserProfilePath) config.browser.profilePath = browserProfilePath;
    
    const taskTimeout = dbGetConfig('task.timeout');
    if (taskTimeout) config.task.timeout = parseInt(taskTimeout, 10);
    
    const taskMaxRetries = dbGetConfig('task.maxRetries');
    if (taskMaxRetries) config.task.maxRetries = parseInt(taskMaxRetries, 10);
    
    const domainWhitelist = dbGetConfig('domain.whitelist');
    if (domainWhitelist) config.domain.whitelist = domainWhitelist;
    
    const logLevel = dbGetConfig('log.level');
    if (logLevel) config.log.level = logLevel;
    
    const cloudEnabled = dbGetConfig('cloud.enabled');
    if (cloudEnabled) config.cloud.enabled = cloudEnabled === 'true';
    
    const cloudUrl = dbGetConfig('cloud.url');
    if (cloudUrl) config.cloud.url = cloudUrl;
  } catch {
    // Config not initialized, use defaults
  }
  
  return config;
}

export function setAppConfig(updates: Partial<AppConfig>) {
  if (updates.port) dbSetConfig('port', String(updates.port));
  if (updates.browser?.headless !== undefined) dbSetConfig('browser.headless', String(updates.browser.headless));
  if (updates.browser?.profilePath) dbSetConfig('browser.profilePath', updates.browser.profilePath);
  if (updates.task?.timeout) dbSetConfig('task.timeout', String(updates.task.timeout));
  if (updates.task?.maxRetries) dbSetConfig('task.maxRetries', String(updates.task.maxRetries));
  if (updates.domain?.whitelist) dbSetConfig('domain.whitelist', updates.domain.whitelist);
  if (updates.log?.level) dbSetConfig('log.level', updates.log.level);
  if (updates.cloud?.enabled !== undefined) dbSetConfig('cloud.enabled', String(updates.cloud.enabled));
  if (updates.cloud?.url) dbSetConfig('cloud.url', updates.cloud.url);
}