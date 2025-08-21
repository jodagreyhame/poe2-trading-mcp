/**
 * Token bucket rate limiter for API requests
 * Implements a token bucket algorithm with burst capacity and queue management
 */

import { RateLimitState } from '../types/api.js';

export class RateLimiter {
  private state: RateLimitState;
  private requestsPerSecond: number;
  private burstSize: number;
  private processing = false;

  constructor(requestsPerSecond: number = 2, burstSize: number = 5) {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize;
    this.state = {
      tokens: burstSize,
      lastRefill: Date.now(),
      queue: [],
    };
  }

  /**
   * Acquire a token for making a request
   * Returns a promise that resolves when a token is available
   */
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state.queue.push({
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.processQueue();
    });
  }

  /**
   * Process the queue of pending requests
   */
  private processQueue(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.refillTokens();

    // Process requests while we have tokens
    while (this.state.tokens > 0 && this.state.queue.length > 0) {
      const request = this.state.queue.shift();
      if (request) {
        this.state.tokens--;
        request.resolve();
      }
    }

    // Schedule next processing if queue is not empty
    if (this.state.queue.length > 0) {
      const delay = Math.max(0, 1000 / this.requestsPerSecond);
      setTimeout(() => {
        this.processing = false;
        this.processQueue();
      }, delay);
    } else {
      this.processing = false;
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.state.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timePassed * this.requestsPerSecond);

    if (tokensToAdd > 0) {
      this.state.tokens = Math.min(this.burstSize, this.state.tokens + tokensToAdd);
      this.state.lastRefill = now;
    }
  }

  /**
   * Get current rate limiter status
   */
  getStatus(): {
    tokens: number;
    queueLength: number;
    requestsPerSecond: number;
    burstSize: number;
  } {
    this.refillTokens();
    return {
      tokens: this.state.tokens,
      queueLength: this.state.queue.length,
      requestsPerSecond: this.requestsPerSecond,
      burstSize: this.burstSize,
    };
  }

  /**
   * Clear the queue and reject all pending requests
   */
  clear(): void {
    while (this.state.queue.length > 0) {
      const request = this.state.queue.shift();
      if (request) {
        request.reject(new Error('Rate limiter cleared'));
      }
    }
  }

  /**
   * Update rate limiting parameters
   */
  updateConfig(requestsPerSecond: number, burstSize: number): void {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize;
    this.state.tokens = Math.min(this.state.tokens, burstSize);
  }
}
