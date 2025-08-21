/**
 * Cached POE2Scout API Client
 * Wraps the base API client with multi-tier caching for performance optimization
 */

import { POE2ScoutClient } from './client.js';
import { CacheManager, DEFAULT_CACHE_CONFIG } from '../cache/index.js';
import { CacheDataType, CacheResult } from '../types/cache_types.js';
import { POE2ScoutConfig } from '../utils/config.js';
import {
  League,
  CategoriesResponse,
  UniqueItem,
  CurrencyItem,
  ItemFilters,
  LandingSplashInfo,
  UniqueBaseItem,
} from '../types/api.js';

export interface CachedClientConfig extends Partial<POE2ScoutConfig> {
  cache?: {
    enabled?: boolean;
    l1Enabled?: boolean;
    l2Enabled?: boolean;
    dbPath?: string;
    maxMemoryKeys?: number;
    compressionThreshold?: number;
  };
}

export class CachedPOE2ScoutClient extends POE2ScoutClient {
  private cacheManager: CacheManager;
  private cacheEnabled: boolean;

  constructor(config: CachedClientConfig = {}) {
    super(config);

    // Initialize cache configuration
    const cacheConfig = {
      ...DEFAULT_CACHE_CONFIG,
      enableL1: config.cache?.l1Enabled ?? true,
      enableL2: config.cache?.l2Enabled ?? true,
      l1: {
        ...DEFAULT_CACHE_CONFIG.l1,
        maxKeys: config.cache?.maxMemoryKeys ?? DEFAULT_CACHE_CONFIG.l1.maxKeys
      },
      l2: {
        ...DEFAULT_CACHE_CONFIG.l2,
        dbPath: config.cache?.dbPath ?? DEFAULT_CACHE_CONFIG.l2.dbPath,
        compressionThreshold: config.cache?.compressionThreshold ?? DEFAULT_CACHE_CONFIG.l2.compressionThreshold
      }
    };

    this.cacheEnabled = config.cache?.enabled ?? true;
    this.cacheManager = new CacheManager(cacheConfig);

    if (this.cacheEnabled) {
      this.initializeWarmup();
    }
  }

  /**
   * Initialize cache warmup for frequently accessed data
   */
  private async initializeWarmup(): Promise<void> {
    try {
      // Warm up with basic data
      this.warmupBasicData();
    } catch (error) {
      console.warn('Cache warmup failed:', error);
    }
  }

  /**
   * Warm up cache with essential data
   */
  private async warmupBasicData(): Promise<void> {
    const warmupJobs = [
      { method: 'getLeagues', params: {}, priority: 100 },
      { method: 'getItemCategories', params: {}, priority: 95 },
      { method: 'getItemFilters', params: {}, priority: 90 }
    ];

    for (const job of warmupJobs) {
      try {
        await this.executeWithCache(job.method, job.params);
      } catch (error) {
        console.warn(`Warmup failed for ${job.method}:`, error);
      }
    }
  }

  /**
   * Execute method with caching logic
   */
  private async executeWithCache<T>(
    methodName: string,
    params: any
  ): Promise<CacheResult<T>> {
    const dataType = this.mapMethodToDataType(methodName);
    const cacheKey = this.generateCacheParams(methodName, params);

    if (!this.cacheEnabled) {
      // Bypass cache and call parent method directly
      const value = await this.callParentMethod<T>(methodName, params);
      return {
        value,
        source: 'api',
        cached: false,
        timestamp: Date.now()
      };
    }

    try {
      // Try to get from cache first
      const cachedResult = await this.cacheManager.get<T>(dataType, cacheKey);
      return cachedResult;
    } catch (error) {
      // Cache miss - fetch from API
      try {
        const apiValue = await this.callParentMethod<T>(methodName, params);
        
        // Cache the result
        await this.cacheManager.set(dataType, cacheKey, apiValue);
        
        return {
          value: apiValue,
          source: 'api',
          cached: false,
          timestamp: Date.now()
        };
      } catch (apiError) {
        console.error(`API call failed for ${methodName}:`, apiError);
        throw apiError;
      }
    }
  }

  /**
   * Call the parent method by name
   */
  private async callParentMethod<T>(methodName: string, params: any): Promise<T> {
    switch (methodName) {
      case 'getLeagues':
        return super.getLeagues() as Promise<T>;
      case 'getItemCategories':
        return super.getItemCategories() as Promise<T>;
      case 'getUniqueItems':
        return super.getUniqueItems(params.category, params) as Promise<T>;
      case 'getCurrencyItems':
        return super.getCurrencyItems(params.category, params) as Promise<T>;
      case 'getAllItems':
        return super.getAllItems(params) as Promise<T>;
      case 'getItemHistory':
        return super.getItemHistory(params.itemId, params) as Promise<T>;
      case 'getItemFilters':
        return super.getItemFilters() as Promise<T>;
      case 'getLandingSplashInfo':
        return super.getLandingSplashInfo() as Promise<T>;
      case 'getUniqueBaseItems':
        return super.getUniqueBaseItems() as Promise<T>;
      case 'getUniquesByBaseName':
        return super.getUniquesByBaseName(params.baseName) as Promise<T>;
      case 'getCurrencyById':
        return super.getCurrencyById(params.apiId) as Promise<T>;
      case 'searchItems':
        return super.searchItems(params.query, params) as Promise<T>;
      default:
        throw new Error(`Unknown method: ${methodName}`);
    }
  }

  /**
   * Map method names to cache data types
   */
  private mapMethodToDataType(methodName: string): CacheDataType {
    const methodMap: { [key: string]: CacheDataType } = {
      'getLeagues': 'leagues',
      'getItemCategories': 'categories',
      'getUniqueItems': 'unique_items',
      'getCurrencyItems': 'currency_items',
      'getAllItems': 'search_results',
      'getItemHistory': 'item_history',
      'getItemFilters': 'item_filters',
      'getLandingSplashInfo': 'landing_info',
      'getUniqueBaseItems': 'base_items',
      'getUniquesByBaseName': 'unique_items',
      'getCurrencyById': 'currency_items',
      'searchItems': 'search_results'
    };

    return methodMap[methodName] || 'search_results';
  }

  /**
   * Generate cache parameters from method arguments
   */
  private generateCacheParams(methodName: string, args: any): Record<string, any> {
    if (!args) return {};

    // Handle different method signatures
    switch (methodName) {
      case 'getUniqueItems':
      case 'getCurrencyItems':
        if (Array.isArray(args)) {
          const [category, options = {}] = args;
          return { category, ...options };
        }
        return args || {};

      case 'getItemHistory':
        if (Array.isArray(args)) {
          const [itemId, historyOptions = {}] = args;
          return { itemId, ...historyOptions };
        }
        return args || {};

      case 'getUniquesByBaseName':
        if (Array.isArray(args)) {
          const [baseName] = args;
          return { baseName };
        }
        return { baseName: args };

      case 'getCurrencyById':
        if (Array.isArray(args)) {
          const [apiId] = args;
          return { apiId };
        }
        return { apiId: args };

      case 'searchItems':
        if (Array.isArray(args)) {
          const [query, searchOptions = {}] = args;
          return { query, ...searchOptions };
        }
        return args || {};

      case 'getAllItems':
        return args || {};

      default:
        return typeof args === 'object' ? args : {};
    }
  }

  // Override API methods with caching

  /**
   * Get all available leagues (cached)
   */
  override async getLeagues(): Promise<League[]> {
    const result = await this.executeWithCache<League[]>('getLeagues', {});
    return result.value;
  }

  /**
   * Get all item categories (cached)
   */
  override async getItemCategories(): Promise<CategoriesResponse> {
    const result = await this.executeWithCache<CategoriesResponse>('getItemCategories', {});
    return result.value;
  }

  /**
   * Get unique items by category (cached)
   */
  override async getUniqueItems(
    category: string,
    options: {
      league?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: UniqueItem[] }> {
    const result = await this.executeWithCache<{ items: UniqueItem[] }>('getUniqueItems', [category, options]);
    return result.value;
  }

  /**
   * Get currency items by category (cached)
   */
  override async getCurrencyItems(
    category: string,
    options: {
      league?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: CurrencyItem[] }> {
    const result = await this.executeWithCache<{ items: CurrencyItem[] }>('getCurrencyItems', [category, options]);
    return result.value;
  }

  /**
   * Get all items (unique and currency) (cached)
   */
  override async getAllItems(
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
    const result = await this.executeWithCache<{
      uniqueItems: UniqueItem[];
      currencyItems: CurrencyItem[];
    }>('getAllItems', options);
    return result.value;
  }

  /**
   * Get item price history (cached)
   */
  override async getItemHistory(
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
    const result = await this.executeWithCache<{
      priceHistory: Array<{
        timestamp: string;
        value: number;
        count: number;
      }>;
    }>('getItemHistory', [itemId, options]);
    return result.value;
  }

  /**
   * Get item filters (cached)
   */
  override async getItemFilters(): Promise<ItemFilters> {
    const result = await this.executeWithCache<ItemFilters>('getItemFilters', {});
    return result.value;
  }

  /**
   * Get landing page splash information (cached)
   */
  override async getLandingSplashInfo(): Promise<LandingSplashInfo> {
    const result = await this.executeWithCache<LandingSplashInfo>('getLandingSplashInfo', {});
    return result.value;
  }

  /**
   * Get unique base items (cached)
   */
  override async getUniqueBaseItems(): Promise<UniqueBaseItem[]> {
    const result = await this.executeWithCache<UniqueBaseItem[]>('getUniqueBaseItems', {});
    return result.value;
  }

  /**
   * Get uniques by base name (cached)
   */
  override async getUniquesByBaseName(baseName: string): Promise<UniqueItem[]> {
    const result = await this.executeWithCache<UniqueItem[]>('getUniquesByBaseName', baseName);
    return result.value;
  }

  /**
   * Get currency item by API ID (cached)
   */
  override async getCurrencyById(apiId: string): Promise<CurrencyItem> {
    const result = await this.executeWithCache<CurrencyItem>('getCurrencyById', apiId);
    return result.value;
  }

  /**
   * Search for items across all categories (cached)
   */
  override async searchItems(
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
    const result = await this.executeWithCache<{
      uniqueItems: UniqueItem[];
      currencyItems: CurrencyItem[];
      total: number;
    }>('searchItems', [query, options]);
    return result.value;
  }

  // Cache management methods

  /**
   * Invalidate cache by data type
   */
  async invalidateCache(dataType: CacheDataType, cascade: boolean = true): Promise<number> {
    return this.cacheManager.invalidateByType(dataType, cascade);
  }

  /**
   * Invalidate cache by league
   */
  async invalidateCacheByLeague(league: string): Promise<number> {
    return this.cacheManager.invalidateByLeague(league);
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    return this.cacheManager.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Get cache health status
   */
  getCacheHealth() {
    return this.cacheManager.getHealth();
  }

  /**
   * Get extended client status including cache information
   */
  getExtendedStatus(): {
    client: ReturnType<POE2ScoutClient['getStatus']>;
    cache: {
      enabled: boolean;
      stats: ReturnType<CacheManager['getStats']>;
      health: ReturnType<CacheManager['getHealth']>;
      metrics: ReturnType<CacheManager['getMetrics']>;
    };
  } {
    return {
      client: super.getStatus(),
      cache: {
        enabled: this.cacheEnabled,
        stats: this.cacheManager.getStats(),
        health: this.cacheManager.getHealth(),
        metrics: this.cacheManager.getMetrics()
      }
    };
  }

  /**
   * Enable or disable caching
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * Close client and cleanup cache resources
   */
  async close(): Promise<void> {
    await this.cacheManager.close();
  }
}