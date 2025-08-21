/**
 * Cache System Main Export
 * Multi-tier caching system with L1 (in-memory) and L2 (SQLite) layers
 */

export { L1Cache } from './l1_cache.js';
export { L2Cache } from './l2_cache.js';
export { CacheManager } from './cache_manager.js';
export { CacheInvalidation } from './invalidation.js';
// Re-import for use in this file
import { CacheManager } from './cache_manager.js';

export type {
  CacheConfig,
  CacheEntry,
  CacheStats,
  CachePolicy,
  CacheDataType,
  CacheKey,
  CacheResult,
  InvalidationPattern,
  CacheWarmupJob,
  CacheMetrics
} from '../types/cache_types.js';

export { KeyGenerator } from '../utils/key_generation.js';
export { CompressionUtil } from '../utils/compression.js';

// Default cache configuration for POE2Scout
export const DEFAULT_CACHE_CONFIG = {
  enableL1: true,
  enableL2: true,
  enableWarmup: true,
  fallbackToSource: true,
  statsUpdateInterval: 300000, // 5 minutes
  l1: {
    maxKeys: 1000,
    defaultTTL: 300000, // 5 minutes
    checkPeriod: 60000  // 1 minute
  },
  l2: {
    dbPath: './cache/poe2scout.db',
    maxSize: '100MB',
    compressionThreshold: 1024 // 1KB
  },
  policies: {
    leagues: {
      l1TTL: 3600000,    // 1 hour
      l2TTL: 86400000,   // 24 hours
      refreshThreshold: 0.8,
      warmOnStartup: true
    },
    categories: {
      l1TTL: 3600000,    // 1 hour
      l2TTL: 86400000,   // 24 hours
      refreshThreshold: 0.8,
      warmOnStartup: true
    },
    unique_items: {
      l1TTL: 900000,     // 15 minutes
      l2TTL: 3600000,    // 1 hour
      refreshThreshold: 0.7
    },
    currency_items: {
      l1TTL: 600000,     // 10 minutes
      l2TTL: 1800000,    // 30 minutes
      refreshThreshold: 0.6
    },
    item_history: {
      l1TTL: 1800000,    // 30 minutes
      l2TTL: 86400000,   // 24 hours
      refreshThreshold: 0.8
    },
    item_filters: {
      l1TTL: 3600000,    // 1 hour
      l2TTL: 86400000,   // 24 hours
      refreshThreshold: 0.9,
      warmOnStartup: true
    },
    landing_info: {
      l1TTL: 1800000,    // 30 minutes
      l2TTL: 3600000,    // 1 hour
      refreshThreshold: 0.8
    },
    base_items: {
      l1TTL: 3600000,    // 1 hour
      l2TTL: 86400000,   // 24 hours
      refreshThreshold: 0.9,
      warmOnStartup: true
    },
    search_results: {
      l1TTL: 300000,     // 5 minutes
      l2TTL: 900000,     // 15 minutes
      refreshThreshold: 0.5
    }
  }
} as const;

/**
 * Create a configured cache manager instance
 */
export function createCacheManager(config?: Partial<typeof DEFAULT_CACHE_CONFIG>): CacheManager {
  const finalConfig = {
    ...DEFAULT_CACHE_CONFIG,
    ...config,
    l1: { ...DEFAULT_CACHE_CONFIG.l1, ...config?.l1 },
    l2: { ...DEFAULT_CACHE_CONFIG.l2, ...config?.l2 },
    policies: { ...DEFAULT_CACHE_CONFIG.policies, ...config?.policies }
  };

  return new CacheManager(finalConfig);
}

/**
 * Cache warmup jobs for common data
 */
export const DEFAULT_WARMUP_JOBS = [
  {
    type: 'leagues' as const,
    params: {},
    priority: 100
  },
  {
    type: 'categories' as const,
    params: {},
    priority: 95
  },
  {
    type: 'item_filters' as const,
    params: {},
    priority: 90
  },
  {
    type: 'base_items' as const,
    params: {},
    priority: 85
  }
];