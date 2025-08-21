/**
 * POE2Scout API Client
 * Main HTTP client with rate limiting, retries, and error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { RateLimiter } from '../utils/rateLimiter.js';
import { RetryHandler } from '../utils/retryHandler.js';
import { ConfigManager, POE2ScoutConfig } from '../utils/config.js';
import {
  APIError,
  League,
  CategoriesResponse,
  UniqueItem,
  CurrencyItem,
  ItemFilters,
  LandingSplashInfo,
  UniqueBaseItem,
} from '../types/api.js';

export class POE2ScoutClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter: RateLimiter;
  private retryHandler: RetryHandler;
  private configManager: ConfigManager;

  constructor(config: Partial<POE2ScoutConfig> = {}) {
    this.configManager = new ConfigManager(config);
    const clientConfig = this.configManager.getConfig();

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter(
      clientConfig.rateLimit?.requestsPerSecond ?? 2,
      clientConfig.rateLimit?.burstSize ?? 5
    );

    // Initialize retry handler
    this.retryHandler = new RetryHandler({
      ...(clientConfig.retries !== undefined && { retries: clientConfig.retries }),
      ...(clientConfig.retryDelay !== undefined && { retryDelay: clientConfig.retryDelay }),
    });

    // Create axios instance
    this.axiosInstance = axios.create({
      ...(clientConfig.baseURL && { baseURL: clientConfig.baseURL }),
      ...(clientConfig.timeout && { timeout: clientConfig.timeout }),
      headers: {
        'User-Agent': this.configManager.getUserAgent(),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for rate limiting and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor for rate limiting
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        await this.rateLimiter.acquire();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error enhancement
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        const enhancedError = this.enhanceError(error);
        return Promise.reject(enhancedError);
      }
    );
  }

  /**
   * Enhance error with additional information
   */
  private enhanceError(error: any): APIError {
    const apiError = new Error(error.message) as APIError;
    apiError.name = 'POE2ScoutAPIError';
    apiError.status = error.response?.status;
    apiError.response = error.response?.data;
    apiError.config = error.config;

    // Determine if error is retryable
    apiError.isRetryable = this.isRetryableError(error);

    return apiError;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.response) return true; // Network errors are retryable

    const status = error.response.status;
    return status >= 500 || status === 429 || status === 408;
  }

  /**
   * Make a request with retry logic
   */
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    return this.retryHandler.execute(async () => {
      const response: AxiosResponse<T> = await this.axiosInstance.request(config);
      return response.data;
    });
  }

  /**
   * Get all available leagues
   */
  async getLeagues(): Promise<League[]> {
    return this.request<League[]>({
      method: 'GET',
      url: '/leagues',
    });
  }

  /**
   * Get all item categories
   */
  async getItemCategories(): Promise<CategoriesResponse> {
    return this.request<CategoriesResponse>({
      method: 'GET',
      url: '/items/categories',
    });
  }

  /**
   * Get unique items by category
   */
  async getUniqueItems(
    category: string,
    options: {
      league?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: UniqueItem[] }> {
    const params = new URLSearchParams();

    if (options.league) params.append('league', options.league);
    if (options.search) params.append('search', options.search);
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());

    const url = `/items/unique/${encodeURIComponent(category)}${params.toString() ? `?${params.toString()}` : ''}`;

    return this.request<{ items: UniqueItem[] }>({
      method: 'GET',
      url,
    });
  }

  /**
   * Get currency items by category
   */
  async getCurrencyItems(
    category: string,
    options: {
      league?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: CurrencyItem[] }> {
    const params = new URLSearchParams();

    if (options.league) params.append('league', options.league);
    if (options.search) params.append('search', options.search);
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());

    const url = `/items/currency/${encodeURIComponent(category)}${params.toString() ? `?${params.toString()}` : ''}`;

    return this.request<{ items: CurrencyItem[] }>({
      method: 'GET',
      url,
    });
  }

  /**
   * Get all items (unique and currency) - DEPRECATED: Use searchItems instead
   * This method is disabled as the /items endpoint doesn't exist on POE2Scout API
   */
  async getAllItems(
    options: {
      league?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    uniqueItems: UniqueItem[];
    currencyItems: CurrencyItem[];
  }> {
    // Use searchItems as a fallback since /items endpoint doesn't exist
    if (options.search) {
      return this.searchItems(options.search, {
        ...(options.league && { league: options.league }),
        ...(options.limit && { limit: options.limit }),
      });
    }
    
    // Return empty results if no search query
    return {
      uniqueItems: [],
      currencyItems: [],
    };
  }

  /**
   * Get item price history
   */
  async getItemHistory(
    itemId: string,
    options: {
      league?: string;
      days?: number;
    } = {}
  ): Promise<{
    priceHistory: Array<{
      timestamp: string;
      value: number;
      count: number;
    }>;
  }> {
    const params = new URLSearchParams();

    if (options.league) params.append('league', options.league);
    if (options.days) params.append('days', options.days.toString());

    const url = `/items/${encodeURIComponent(itemId)}/history${params.toString() ? `?${params.toString()}` : ''}`;

    return this.request<{
      priceHistory: Array<{
        timestamp: string;
        value: number;
        count: number;
      }>;
    }>({
      method: 'GET',
      url,
    });
  }

  /**
   * Get item filters (available items for filtering)
   */
  async getItemFilters(): Promise<ItemFilters> {
    return this.request<ItemFilters>({
      method: 'GET',
      url: '/items/filters',
    });
  }

  /**
   * Get landing page splash information
   */
  async getLandingSplashInfo(): Promise<LandingSplashInfo> {
    return this.request<LandingSplashInfo>({
      method: 'GET',
      url: '/items/landingSplashInfo',
    });
  }

  /**
   * Get unique base items
   */
  async getUniqueBaseItems(): Promise<UniqueBaseItem[]> {
    return this.request<UniqueBaseItem[]>({
      method: 'GET',
      url: '/items/uniqueBaseItems',
    });
  }

  /**
   * Get uniques by base name
   */
  async getUniquesByBaseName(baseName: string): Promise<UniqueItem[]> {
    return this.request<UniqueItem[]>({
      method: 'GET',
      url: `/items/uniquesByBaseName/${encodeURIComponent(baseName)}`,
    });
  }

  /**
   * Get currency item by API ID
   */
  async getCurrencyById(apiId: string): Promise<CurrencyItem> {
    return this.request<CurrencyItem>({
      method: 'GET',
      url: `/items/currencyById/${encodeURIComponent(apiId)}`,
    });
  }

  /**
   * Search for items across all categories
   */
  async searchItems(
    query: string,
    options: {
      league?: string;
      category?: string;
      type?: 'unique' | 'currency' | 'all';
      limit?: number;
    } = {}
  ): Promise<{
    uniqueItems: UniqueItem[];
    currencyItems: CurrencyItem[];
    total: number;
  }> {
    let uniqueItems: UniqueItem[] = [];
    let currencyItems: CurrencyItem[] = [];

    // Search currency items if type is 'currency' or 'all'
    if (!options.type || options.type === 'all' || options.type === 'currency') {
      try {
        // Search only the main currency category
        const items = await this.getCurrencyItems('currency', {
          ...(options.league && { league: options.league }),
          limit: 50, // Get more items to filter client-side
        });
        
        if (items && items.items && Array.isArray(items.items)) {
          // Client-side filtering by name
          const filtered = items.items.filter((item: any) => 
            (item.text && item.text.toLowerCase().includes(query.toLowerCase())) ||
            (item.itemMetadata?.name && item.itemMetadata.name.toLowerCase().includes(query.toLowerCase()))
          );
          currencyItems.push(...filtered);
        }
      } catch (error) {
        console.warn('Currency search failed:', error);
      }
    }

    // Search unique items if type is 'unique' or 'all' (only if user specifically requests)
    if (options.type === 'unique' || (options.type === 'all' && currencyItems.length === 0)) {
      try {
        // Search only accessories category to avoid issues
        const items = await this.getUniqueItems('accessory', {
          ...(options.league && { league: options.league }),
          limit: 30, // Smaller limit to avoid issues
        });
        
        if (items && items.items && Array.isArray(items.items)) {
          // Client-side filtering by name
          const filtered = items.items.filter((item: any) => 
            item.name && item.name.toLowerCase().includes(query.toLowerCase())
          );
          uniqueItems.push(...filtered);
        }
      } catch (error) {
        console.warn('Unique items search failed:', error);
      }
    }

    // Apply global limit if specified
    if (options.limit) {
      const totalItems = uniqueItems.length + currencyItems.length;
      if (totalItems > options.limit) {
        const ratio = uniqueItems.length / totalItems;
        const uniqueLimit = Math.floor(options.limit * ratio);
        const currencyLimit = options.limit - uniqueLimit;
        
        uniqueItems = uniqueItems.slice(0, uniqueLimit);
        currencyItems = currencyItems.slice(0, currencyLimit);
      }
    }

    return {
      uniqueItems,
      currencyItems,
      total: uniqueItems.length + currencyItems.length,
    };
  }

  /**
   * Get client status and health information
   */
  getStatus(): {
    rateLimiter: ReturnType<RateLimiter['getStatus']>;
    retryConfig: ReturnType<RetryHandler['getConfig']>;
    config: POE2ScoutConfig;
  } {
    return {
      rateLimiter: this.rateLimiter.getStatus(),
      retryConfig: this.retryHandler.getConfig(),
      config: this.configManager.getConfig(),
    };
  }

  /**
   * Update client configuration
   */
  updateConfig(updates: Partial<POE2ScoutConfig>): void {
    this.configManager.updateConfig(updates);
    const config = this.configManager.getConfig();

    // Update rate limiter if rate limit config changed
    if (updates.rateLimit) {
      this.rateLimiter.updateConfig(
        config.rateLimit?.requestsPerSecond ?? 2,
        config.rateLimit?.burstSize ?? 5
      );
    }

    // Update retry handler if retry config changed
    if (updates.retries || updates.retryDelay) {
      this.retryHandler.updateConfig({
        ...(config.retries !== undefined && { retries: config.retries }),
        ...(config.retryDelay !== undefined && { retryDelay: config.retryDelay }),
      });
    }

    // Update axios instance settings
    if (config.timeout !== undefined) {
      this.axiosInstance.defaults.timeout = config.timeout;
    }
    this.axiosInstance.defaults.headers['User-Agent'] = this.configManager.getUserAgent();
  }

  /**
   * Clear rate limiter queue (useful for testing)
   */
  clearQueue(): void {
    this.rateLimiter.clear();
  }
}
