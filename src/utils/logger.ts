/**
 * Structured Logger with JSON output and configurable levels
 * Optimized for MCP server debugging and monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  pid: number;
  hostname?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableMetrics: boolean;
  includeHostname?: boolean;
  format?: 'json' | 'text';
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private config: LoggerConfig;
  private metricsEnabled: boolean;
  private logCounts: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  };

  constructor(config: LoggerConfig) {
    this.config = {
      format: 'json',
      includeHostname: false,
      ...config,
    };
    this.metricsEnabled = config.enableMetrics;
  }

  /**
   * Check if a log level should be logged based on current configuration
   */
  shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    if (this.metricsEnabled) {
      this.logCounts[level]++;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      pid: process.pid,
    };

    if (context && Object.keys(context).length > 0) {
      logEntry.context = context;
    }

    if (this.config.includeHostname) {
      try {
        logEntry.hostname = require('os').hostname();
      } catch {
        // Ignore hostname errors
      }
    }

    const output = this.formatOutput(logEntry);

    // Use stderr for all logs to avoid interfering with MCP stdio communication
    console.error(output);
  }

  /**
   * Format log output based on configuration
   */
  private formatOutput(entry: LogEntry): string {
    if (this.config.format === 'text') {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      return `[${entry.timestamp}] ${entry.level.toUpperCase()} (${entry.pid}): ${entry.message}${contextStr}`;
    }

    return JSON.stringify(entry);
  }

  /**
   * Get current log metrics
   */
  getMetrics(): {
    enabled: boolean;
    counts: Record<LogLevel, number>;
    totalLogs: number;
    config: LoggerConfig;
  } {
    const totalLogs = Object.values(this.logCounts).reduce((sum, count) => sum + count, 0);

    return {
      enabled: this.metricsEnabled,
      counts: { ...this.logCounts },
      totalLogs,
      config: this.config,
    };
  }

  /**
   * Reset log metrics
   */
  resetMetrics(): void {
    this.logCounts = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
  }

  /**
   * Update logger configuration
   */
  updateConfig(updates: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.enableMetrics !== undefined) {
      this.metricsEnabled = updates.enableMetrics;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.config);

    // Override the log method to include parent context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, childContext?: Record<string, any>) => {
      const mergedContext = { ...context, ...childContext };
      originalLog(level, message, mergedContext);
    };

    return childLogger;
  }

  /**
   * Log performance timing
   */
  timing(name: string, duration: number, context?: Record<string, any>): void {
    this.info(`Performance timing: ${name}`, {
      timing: {
        name,
        duration,
        unit: 'ms',
      },
      ...context,
    });
  }

  /**
   * Log with custom structured data
   */
  structured(level: LogLevel, message: string, data: Record<string, any>): void {
    this.log(level, message, data);
  }

  /**
   * Create a timer function for measuring operation duration
   */
  timer(name: string): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.timing(name, duration);
    };
  }
}
