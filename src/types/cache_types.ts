/**
 * Cache Type Definitions
 * Defines types for the multi-tier caching system
 */

export interface CacheConfig {
  l1: {
    maxKeys: number;
    defaultTTL: number;
    checkPeriod: number;
  };
  l2: {
    dbPath: string;
    maxSize: string;
    compressionThreshold: number;
  };
  policies: Record<string, CachePolicy>;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  lastAccessed: number;
  compressed?: boolean;
  dataType?: string;
}

export interface CacheStats {
  l1: {
    hits: number;
    misses: number;
    keys: number;
    hitRate: number;
    memoryUsage: number;
  };
  l2: {
    hits: number;
    misses: number;
    keys: number;
    hitRate: number;
    dbSize: number;
  };
  overall: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

export interface CachePolicy {
  l1TTL: number;
  l2TTL: number;
  refreshThreshold: number;
  warmOnStartup?: boolean;
  maxSize?: number;
}

export type CacheDataType = 
  | 'leagues'
  | 'categories' 
  | 'unique_items'
  | 'currency_items'
  | 'item_history'
  | 'item_filters'
  | 'landing_info'
  | 'base_items'
  | 'search_results'
  | 'arbitrage_opportunities'
  | 'arbitrage_tracking'
  | string; // Allow arbitrary cache keys

export interface CacheKey {
  type: CacheDataType;
  params: Record<string, any>;
}

export interface CacheResult<T> {
  value: T;
  source: 'l1' | 'l2' | 'api';
  cached: boolean;
  timestamp: number;
}

export interface InvalidationPattern {
  type: 'exact' | 'prefix' | 'regex';
  pattern: string;
  cascade?: boolean;
}

export interface CacheWarmupJob {
  type: CacheDataType;
  params: Record<string, any>;
  priority: number;
}

export interface CacheMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  lastError?: string;
  lastErrorTime?: number;
}