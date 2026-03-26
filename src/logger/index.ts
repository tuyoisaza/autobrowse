type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: any;
}

class SimpleLogger {
  private level: LogLevel;
  private module: string;

  constructor(module: string, level: LogLevel = 'info') {
    this.module = module;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: string, message: string, meta?: LogMeta): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${this.module}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message, meta));
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, meta));
    }
  }

  error(message: string, meta?: LogMeta): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, meta));
    }
  }

  fatal(message: string, meta?: LogMeta): void {
    console.error(this.format('fatal', message, meta));
  }

  child(options: { module: string }): SimpleLogger {
    return new SimpleLogger(options.module, this.level);
  }
}

const rootLevel = (typeof process !== 'undefined' && process.env?.LOG_LEVEL as LogLevel) || 'info';
export const logger = new SimpleLogger('root', rootLevel);

export function createLogger(name: string): SimpleLogger {
  return logger.child({ module: name });
}