/**
 * POE2Official API Client
 * 
 * Minimal client for the official Path of Exile 2 Trade API.
 * Implements strict rate limiting (30 requests per 5 minutes).
 */

import { Logger } from '../utils/logger.js';

/**
 * Rate limiter for POE2Official API
 */
class WindowedRateLimiter {
  private requests: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if we can make a request
    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      if (oldestRequest !== undefined) {
        const waitTime = (oldestRequest + this.windowMs) - now;
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.acquire(); // Retry after waiting
        }
      }
    }
    
    // Record this request
    this.requests.push(now);
  }

  reset(): void {
    this.requests = [];
  }
}

/**
 * POE2Official client configuration
 */
export interface POE2OfficialClientConfig {
  contactEmail?: string;
  userAgent?: string;
  logger?: Logger;
  baseUrl?: string;
  timeout?: number;
}

/**
 * POE2Official API client
 */
export class POE2OfficialClient {
  private readonly config: Required<POE2OfficialClientConfig>;
  private readonly rateLimiter: WindowedRateLimiter;
  private readonly logger: Logger;

  constructor(config: POE2OfficialClientConfig = {}) {
    this.config = {
      contactEmail: config.contactEmail || 'mcp-server@example.com',
      userAgent: config.userAgent || 'poe2-mcp-server/1.0.0',
      logger: config.logger || new Logger({ level: 'info', enableMetrics: false }),
      baseUrl: config.baseUrl || 'https://www.pathofexile.com/api',
      timeout: config.timeout || 30000,
    };
    
    this.logger = this.config.logger;
    
    // Strict rate limiting: 30 requests per 5 minutes
    this.rateLimiter = new WindowedRateLimiter(30, 300000);
  }

  /**
   * Search for items or currency
   */
  async searchTrade(league: string, query: any): Promise<any> {
    await this.rateLimiter.acquire();
    
    const url = `${this.config.baseUrl}/trade2/search/${encodeURIComponent(league)}`;
    
    this.logger.debug('POE2Official search', { league, url });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${this.config.userAgent} (${this.config.contactEmail})`,
        },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error('Trade search failed', { error });
      throw error;
    }
  }

  /**
   * Fetch item details
   */
  async fetchTradeItems(itemIds: string[], searchId: string, exchange = false): Promise<any> {
    await this.rateLimiter.acquire();
    
    const itemIdString = itemIds.join(',');
    const endpoint = exchange ? 'exchange' : 'fetch';
    const url = `${this.config.baseUrl}/trade2/${endpoint}/${itemIdString}?query=${searchId}`;
    
    this.logger.debug('POE2Official fetch', { itemIds, searchId, url });
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': `${this.config.userAgent} (${this.config.contactEmail})`,
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error('Trade fetch failed', { error });
      throw error;
    }
  }

  /**
   * Get API status
   */
  getStatus(): any {
    return {
      healthy: true,
      rateLimit: {
        limit: 30,
        window: '5 minutes',
        type: 'windowed',
      },
      config: {
        baseUrl: this.config.baseUrl,
        userAgent: this.config.userAgent,
      },
    };
  }
}