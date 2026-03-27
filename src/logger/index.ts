type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  correlationId?: string;
  [key: string]: any;
}

let globalCorrelationId = 0;

function generateCorrelationId(): string {
  globalCorrelationId++;
  return `${Date.now().toString(36)}-${globalCorrelationId.toString(36)}`;
}

class SimpleLogger {
  private level: LogLevel;
  private module: string;
  private correlationId?: string;

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
    const corrId = meta?.correlationId || this.correlationId || '-';
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${this.module}] [corr:${corrId}] ${message}${metaStr}`;
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

  child(options: { module: string; correlationId?: string }): SimpleLogger {
    const child = new SimpleLogger(options.module, this.level);
    child.correlationId = options.correlationId || this.correlationId || generateCorrelationId();
    return child;
  }

  withCorrelationId(correlationId: string): SimpleLogger {
    const child = new SimpleLogger(this.module, this.level);
    child.correlationId = correlationId;
    return child;
  }
}

const rootLevel = (typeof process !== 'undefined' && process.env?.LOG_LEVEL as LogLevel) || 'info';
export const logger = new SimpleLogger('root', rootLevel);

export function createLogger(name: string): SimpleLogger {
  return logger.child({ module: name });
}

export function generateId(): string {
  return generateCorrelationId();
}