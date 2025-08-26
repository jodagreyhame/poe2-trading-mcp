/**
 * Trade Cache System
 * 
 * Implements a time-based cache for trade search and fetch results
 * with automatic cleanup and size management.
 */

import crypto from 'crypto';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

/**
 * Cache configuration
 */
export interface TradeCacheConfig {
  searchTTL?: number;      // TTL for search results (default: 2 minutes)
  fetchTTL?: number;       // TTL for fetch results (default: 1 minute)
  maxSize?: number;        // Maximum cache entries (default: 100)
  cleanupInterval?: number; // Cleanup interval (default: 60 seconds)
}

/**
 * Trade cache implementation
 */
export class TradeCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: Required<TradeCacheConfig>;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
  };

  constructor(config: TradeCacheConfig = {}) {
    this.config = {
      searchTTL: config.searchTTL ?? 120000,        // 2 minutes
      fetchTTL: config.fetchTTL ?? 60000,          // 1 minute
      maxSize: config.maxSize ?? 100,
      cleanupInterval: config.cleanupInterval ?? 60000, // 1 minute
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Generate cache key from parameters
   */
  generateKey(type: 'search' | 'fetch', params: any): string {
    const normalized = this.normalizeParams(params);
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ type, ...normalized }))
      .digest('hex');
    return `${type}:${hash.substring(0, 16)}`;
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update hit count
    entry.hits++;
    this.stats.hits++;
    
    return entry.data as T;
  }

  /**
   * Set cache value
   */
  set<T>(key: string, value: T, customTTL?: number): void {
    // Determine TTL based on key type
    let ttl = customTTL;
    if (!ttl) {
      if (key.startsWith('search:')) {
        ttl = this.config.searchTTL;
      } else if (key.startsWith('fetch:')) {
        ttl = this.config.fetchTTL;
      } else {
        ttl = this.config.searchTTL; // Default
      }
    }

    // Check size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Store entry
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    });
    
    this.stats.sets++;
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted;
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score based on age and hits (lower is worse)
      const age = Date.now() - entry.timestamp;
      const score = entry.hits * 1000 / age;
      
      if (score < lruScore) {
        lruScore = score;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Normalize parameters for consistent cache keys
   */
  private normalizeParams(params: any): any {
    if (!params) return {};

    // Sort object keys for consistent hashing
    const sorted: any = {};
    const keys = Object.keys(params).sort();
    
    for (const key of keys) {
      const value = params[key];
      
      if (value === undefined || value === null) {
        continue;
      }
      
      if (Array.isArray(value)) {
        sorted[key] = [...value].sort();
      } else if (typeof value === 'object') {
        sorted[key] = this.normalizeParams(value);
      } else {
        sorted[key] = value;
      }
    }
    
    return sorted;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = undefined;
    this.clear();
  }
}

/**
 * Create a singleton cache instance
 */
let globalCache: TradeCache | null = null;

export function getGlobalTradeCache(config?: TradeCacheConfig): TradeCache {
  if (!globalCache) {
    globalCache = new TradeCache(config);
  }
  return globalCache;
}

export function clearGlobalTradeCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}