/**
 * Configuration management for POE2Scout API client
 * Handles environment variables, defaults, and validation
 */

import { RequestConfig } from '../types/api.js';

export interface POE2ScoutConfig extends RequestConfig {
  contactEmail: string;
  clientId: string;
  version: string;
}

export class ConfigManager {
  private config: POE2ScoutConfig;

  constructor(overrides: Partial<POE2ScoutConfig> = {}) {
    this.config = {
      ...this.getDefaults(),
      ...this.loadFromEnvironment(),
      ...overrides,
    };

    this.validate();
  }

  /**
   * Get the current configuration
   */
  getConfig(): POE2ScoutConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<POE2ScoutConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  /**
   * Get default configuration values
   */
  private getDefaults(): POE2ScoutConfig {
    return {
      baseURL: 'https://poe2scout.com/api',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      contactEmail: '',
      clientId: 'poe2scout-mcp',
      version: '1.0.0',
      userAgent: '',
      rateLimit: {
        requestsPerSecond: 2,
        burstSize: 5,
      },
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): Partial<POE2ScoutConfig> {
    const config: Partial<POE2ScoutConfig> = {};

    if (process.env['POE2SCOUT_BASE_URL']) {
      config.baseURL = process.env['POE2SCOUT_BASE_URL'];
    }

    if (process.env['POE2SCOUT_TIMEOUT']) {
      const timeout = parseInt(process.env['POE2SCOUT_TIMEOUT'], 10);
      if (!isNaN(timeout)) {
        config.timeout = timeout;
      }
    }

    if (process.env['POE2SCOUT_RETRIES']) {
      const retries = parseInt(process.env['POE2SCOUT_RETRIES'], 10);
      if (!isNaN(retries)) {
        config.retries = retries;
      }
    }

    if (process.env['POE2SCOUT_RETRY_DELAY']) {
      const retryDelay = parseInt(process.env['POE2SCOUT_RETRY_DELAY'], 10);
      if (!isNaN(retryDelay)) {
        config.retryDelay = retryDelay;
      }
    }

    if (process.env['POE2SCOUT_CONTACT_EMAIL']) {
      config.contactEmail = process.env['POE2SCOUT_CONTACT_EMAIL'];
    }

    if (process.env['POE2SCOUT_CLIENT_ID']) {
      config.clientId = process.env['POE2SCOUT_CLIENT_ID'];
    }

    if (process.env['POE2SCOUT_VERSION']) {
      config.version = process.env['POE2SCOUT_VERSION'];
    }

    if (process.env['POE2SCOUT_RATE_LIMIT_RPS']) {
      const rps = parseFloat(process.env['POE2SCOUT_RATE_LIMIT_RPS']);
      if (!isNaN(rps)) {
        config.rateLimit = {
          requestsPerSecond: rps,
          burstSize: config.rateLimit?.burstSize ?? 5,
        };
      }
    }

    if (process.env['POE2SCOUT_RATE_LIMIT_BURST']) {
      const burst = parseInt(process.env['POE2SCOUT_RATE_LIMIT_BURST'], 10);
      if (!isNaN(burst)) {
        config.rateLimit = {
          requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 2,
          burstSize: burst,
        };
      }
    }

    return config;
  }

  /**
   * Validate the configuration
   */
  private validate(): void {
    if (!this.config.baseURL) {
      throw new Error('Base URL is required');
    }

    if (!this.isValidUrl(this.config.baseURL)) {
      throw new Error('Base URL must be a valid URL');
    }

    if (this.config.timeout && (this.config.timeout < 1000 || this.config.timeout > 300000)) {
      throw new Error('Timeout must be between 1000ms and 300000ms');
    }

    if (this.config.retries && (this.config.retries < 0 || this.config.retries > 10)) {
      throw new Error('Retries must be between 0 and 10');
    }

    if (
      this.config.retryDelay &&
      (this.config.retryDelay < 100 || this.config.retryDelay > 60000)
    ) {
      throw new Error('Retry delay must be between 100ms and 60000ms');
    }

    if (!this.config.clientId) {
      throw new Error('Client ID is required');
    }

    if (!this.config.version) {
      throw new Error('Version is required');
    }

    if (this.config.rateLimit) {
      if (
        this.config.rateLimit.requestsPerSecond <= 0 ||
        this.config.rateLimit.requestsPerSecond > 100
      ) {
        throw new Error('Rate limit requests per second must be between 0 and 100');
      }

      if (this.config.rateLimit.burstSize <= 0 || this.config.rateLimit.burstSize > 1000) {
        throw new Error('Rate limit burst size must be between 0 and 1000');
      }
    }
  }

  /**
   * Check if a string is a valid URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate User-Agent string according to POE2Scout requirements
   */
  getUserAgent(): string {
    if (this.config.userAgent) {
      return this.config.userAgent;
    }

    const contact = this.config.contactEmail
      ? `contact: ${this.config.contactEmail}`
      : 'contact: not-provided';
    return `${this.config.clientId}/${this.config.version} (${contact})`;
  }

  /**
   * Create configuration for different environments
   */
  static createForEnvironment(env: 'development' | 'production' | 'testing'): ConfigManager {
    switch (env) {
      case 'development':
        return new ConfigManager({
          timeout: 60000,
          retries: 1,
          rateLimit: {
            requestsPerSecond: 1,
            burstSize: 2,
          },
        });

      case 'production':
        return new ConfigManager({
          timeout: 30000,
          retries: 3,
          rateLimit: {
            requestsPerSecond: 2,
            burstSize: 5,
          },
        });

      case 'testing':
        return new ConfigManager({
          timeout: 5000,
          retries: 0,
          rateLimit: {
            requestsPerSecond: 10,
            burstSize: 20,
          },
        });

      default:
        return new ConfigManager();
    }
  }
}
