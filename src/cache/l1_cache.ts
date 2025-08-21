/**
 * L1 Cache - In-Memory Cache Layer
 * Fast in-memory caching using node-cache with TTL and LRU eviction
 */

import NodeCache from 'node-cache';
import { CacheStats } from '../types/cache_types.js';

export class L1Cache {
  private cache: NodeCache;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };

  constructor(
    maxKeys: number = 1000,
    defaultTTL: number = 300, // 5 minutes
    checkPeriod: number = 60   // Check expired keys every minute
  ) {
    this.cache = new NodeCache({
      stdTTL: defaultTTL,
      checkperiod: checkPeriod,
      maxKeys: maxKeys,
      useClones: false, // Don't clone objects for better performance
      deleteOnExpire: true,
      enableLegacyCallbacks: false
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers(): void {
    this.cache.on('expired', (_key: string, _value: any) => {
      // Could log expired keys for debugging
    });

    this.cache.on('del', (_key: string, _value: any) => {
      this.stats.deletes++;
    });

    this.cache.on('set', (_key: string, _value: any) => {
      this.stats.sets++;
    });
  }

  /**
   * Get value from L1 cache
   */
  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      return value;
    } else {
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set value in L1 cache
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    try {
      const success = this.cache.set(key, value, ttl ?? 0);
      if (success) {
        this.stats.sets++;
      }
      return success;
    } catch (error) {
      console.error('L1Cache set error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in L1 cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete key from L1 cache
   */
  del(key: string): number {
    const result = this.cache.del(key);
    if (result > 0) {
      this.stats.deletes++;
    }
    return result;
  }

  /**
   * Clear all keys from L1 cache
   */
  clear(): void {
    this.cache.flushAll();
    this.resetStats();
  }

  /**
   * Get TTL for a key
   */
  getTtl(key: string): number | undefined {
    const ttl = this.cache.getTtl(key);
    return typeof ttl === 'number' ? ttl : undefined;
  }

  /**
   * Update TTL for a key
   */
  updateTtl(key: string, ttl: number): boolean {
    return this.cache.ttl(key, ttl) as boolean;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return this.cache.keys();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats['l1'] {
    const keyCount = this.cache.keys().length;
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      keys: keyCount,
      hitRate: Math.round(hitRate * 10000) / 100, // Percentage with 2 decimal places
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * Get approximate memory usage
   */
  private getMemoryUsage(): number {
    // Approximate memory usage calculation
    const keys = this.cache.keys();
    let estimatedSize = 0;
    
    keys.forEach(key => {
      const value = this.cache.get(key);
      estimatedSize += key.length * 2; // String keys (UTF-16)
      estimatedSize += this.estimateObjectSize(value);
    });

    return estimatedSize;
  }

  /**
   * Estimate object size in bytes
   */
  private estimateObjectSize(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    
    switch (typeof obj) {
      case 'string':
        return obj.length * 2; // UTF-16
      case 'number':
        return 8; // 64-bit number
      case 'boolean':
        return 4;
      case 'object':
        if (obj instanceof Array) {
          return obj.reduce((size, item) => size + this.estimateObjectSize(item), 0);
        }
        return Object.keys(obj).reduce((size, key) => {
          return size + key.length * 2 + this.estimateObjectSize(obj[key]);
        }, 0);
      default:
        return 0;
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.keys().length;
  }

  /**
   * Check if cache is at capacity
   */
  isAtCapacity(): boolean {
    const options = this.cache.options;
    return options.maxKeys ? this.getSize() >= options.maxKeys : false;
  }

  /**
   * Get keys matching a pattern
   */
  getKeysByPattern(pattern: string): string[] {
    const regex = new RegExp(pattern);
    return this.cache.keys().filter(key => regex.test(key));
  }

  /**
   * Delete keys matching a pattern
   */
  delByPattern(pattern: string): number {
    const keysToDelete = this.getKeysByPattern(pattern);
    let deletedCount = 0;
    
    keysToDelete.forEach(key => {
      if (this.cache.del(key)) {
        deletedCount++;
      }
    });

    return deletedCount;
  }

  /**
   * Get multiple values at once
   */
  mget<T>(keys: string[]): { [key: string]: T | undefined } {
    const result: { [key: string]: T | undefined } = {};
    
    keys.forEach(key => {
      result[key] = this.get<T>(key);
    });

    return result;
  }

  /**
   * Set multiple values at once
   */
  mset<T>(keyValuePairs: { [key: string]: T }, ttl?: number): boolean {
    try {
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        this.set(key, value, ttl);
      });
      return true;
    } catch (error) {
      console.error('L1Cache mset error:', error);
      return false;
    }
  }

  /**
   * Close cache and cleanup
   */
  close(): void {
    this.cache.close();
  }
}