/**
 * Retry handler with exponential backoff for failed API requests
 * Implements configurable retry logic with different strategies
 */

import { RetryConfig, APIError } from '../types/api.js';

export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxRetryDelay: config.maxRetryDelay ?? 30000,
      retryCondition: config.retryCondition ?? this.defaultRetryCondition,
    };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.config.retries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Don't retry if we've exhausted our attempts
        if (attempt > this.config.retries) {
          break;
        }

        // Check if this error should be retried
        if (!this.config.retryCondition(error)) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt - 1);

        console.warn(
          `Request failed (attempt ${attempt}/${this.config.retries + 1}), retrying in ${delay}ms:`,
          error
        );

        await this.sleep(delay);
      }
    }

    // Enhance the final error with retry information
    if (!lastError) {
      throw new Error('Request failed but no error was captured');
    }

    const enhancedError = lastError as APIError;
    enhancedError.message = `Request failed after ${this.config.retries + 1} attempts: ${enhancedError.message}`;
    throw enhancedError;
  }

  /**
   * Calculate delay for the next retry attempt using exponential backoff
   */
  private calculateDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt);
    const jitter = Math.random() * 0.1 * baseDelay; // Add 10% jitter
    return Math.min(baseDelay + jitter, this.config.maxRetryDelay);
  }

  /**
   * Default retry condition - retry on network errors and 5xx status codes
   */
  private defaultRetryCondition(error: any): boolean {
    // Network errors (no response)
    if (!error.response) {
      return true;
    }

    const status = error.response?.status;

    // Retry on server errors (5xx)
    if (status >= 500 && status < 600) {
      return true;
    }

    // Retry on rate limiting (429)
    if (status === 429) {
      return true;
    }

    // Retry on specific client errors that might be temporary
    if (status === 408 || status === 409) {
      // Request Timeout, Conflict
      return true;
    }

    // Don't retry on client errors (4xx except specific cases above)
    if (status >= 400 && status < 500) {
      return false;
    }

    return false;
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Create a specialized retry handler for different scenarios
   */
  static createForScenario(scenario: 'aggressive' | 'conservative' | 'fast'): RetryHandler {
    switch (scenario) {
      case 'aggressive':
        return new RetryHandler({
          retries: 5,
          retryDelay: 500,
          backoffMultiplier: 1.5,
          maxRetryDelay: 60000,
        });

      case 'conservative':
        return new RetryHandler({
          retries: 2,
          retryDelay: 2000,
          backoffMultiplier: 3,
          maxRetryDelay: 15000,
        });

      case 'fast':
        return new RetryHandler({
          retries: 1,
          retryDelay: 200,
          backoffMultiplier: 2,
          maxRetryDelay: 1000,
        });

      default:
        return new RetryHandler();
    }
  }
}
