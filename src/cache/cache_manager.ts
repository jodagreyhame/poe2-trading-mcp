/**
 * Cache Manager - Unified Multi-tier Cache Interface
 * Coordinates L1, L2 cache layers with intelligent invalidation
 */

import { L1Cache } from './l1_cache.js';
import { L2Cache } from './l2_cache.js';
import { CacheInvalidation } from './invalidation.js';
import { KeyGenerator } from '../utils/key_generation.js';
import {
  CacheConfig,
  CacheResult,
  CacheStats,
  CacheDataType,
  InvalidationPattern,
  CacheWarmupJob,
  CacheMetrics
} from '../types/cache_types.js';

export interface CacheManagerConfig extends CacheConfig {
  enableL1: boolean;
  enableL2: boolean;
  enableL2Cache?: boolean; // Optional alias for enableL2 for backward compatibility
  enableWarmup: boolean;
  fallbackToSource: boolean;
  statsUpdateInterval: number;
}

export class CacheManager {
  private l1Cache?: L1Cache;
  private l2Cache?: L2Cache;
  private invalidation!: CacheInvalidation;
  private config: CacheManagerConfig;
  private metrics: CacheMetrics;
  private warmupJobs: CacheWarmupJob[];
  private statsTimer?: NodeJS.Timeout | undefined;

  constructor(config: CacheManagerConfig) {
    this.config = config;
    this.warmupJobs = [];
    this.metrics = {
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0
    };

    this.initializeCacheLayers();
    this.initializeInvalidation();
    this.startStatsUpdater();
  }

  /**
   * Initialize cache manager (for backward compatibility)
   */
  async initialize(): Promise<void> {
    // Initialization logic already handled in constructor
    // This method exists for API compatibility
    return Promise.resolve();
  }

  /**
   * Get raw value from cache (convenience method)
   */
  async getValue<T>(
    dataType: CacheDataType | string,
    params: Record<string, any> = {}
  ): Promise<T | undefined> {
    try {
      const result = await this.get<T>(dataType as CacheDataType, params);
      return result.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Initialize cache layers based on configuration
   */
  private initializeCacheLayers(): void {
    if (this.config.enableL1) {
      this.l1Cache = new L1Cache(
        this.config.l1.maxKeys,
        this.config.l1.defaultTTL / 1000, // node-cache uses seconds
        this.config.l1.checkPeriod / 1000
      );
    }

    if (this.config.enableL2 || this.config.enableL2Cache) {
      this.l2Cache = new L2Cache({
        dbPath: this.config.l2.dbPath,
        maxSize: this.config.l2.maxSize,
        compressionThreshold: this.config.l2.compressionThreshold
      });
    }
  }

  /**
   * Initialize invalidation system
   */
  private initializeInvalidation(): void {
    this.invalidation = new CacheInvalidation({
      defaultTTL: this.config.l1.defaultTTL,
      policies: this.config.policies,
      cleanupInterval: 60000, // 1 minute
      cascadeDepth: 3
    });
  }

  /**
   * Start statistics updater
   */
  private startStatsUpdater(): void {
    if (this.config.statsUpdateInterval > 0) {
      this.statsTimer = setInterval(() => {
        this.updateMetrics();
      }, this.config.statsUpdateInterval) as NodeJS.Timeout;
    }
  }

  /**
   * Get value from cache with fallthrough logic
   */
  async get<T>(
    dataType: CacheDataType,
    params: Record<string, any> = {}
  ): Promise<CacheResult<T>> {
    const startTime = Date.now();
    const key = KeyGenerator.generateKey(dataType, params);

    try {
      this.metrics.requestCount++;

      // Try L1 cache first
      if (this.l1Cache) {
        const l1Value = this.l1Cache.get<T>(key);
        if (l1Value !== undefined) {
          this.updateResponseTime(startTime);
          return {
            value: l1Value,
            source: 'l1',
            cached: true,
            timestamp: Date.now()
          };
        }
      }

      // Try L2 cache
      if (this.l2Cache) {
        const l2Value = await this.l2Cache.get<T>(key);
        if (l2Value !== undefined) {
          // Populate L1 cache if available
          if (this.l1Cache) {
            const l1TTL = this.invalidation.getTTL(dataType) / 1000;
            this.l1Cache.set(key, l2Value, l1TTL);
          }

          this.updateResponseTime(startTime);
          return {
            value: l2Value,
            source: 'l2',
            cached: true,
            timestamp: Date.now()
          };
        }
      }

      // Cache miss - would need to fetch from source
      this.updateResponseTime(startTime);
      throw new Error('Cache miss - data needs to be fetched from source');

    } catch (error) {
      this.metrics.errorRate++;
      this.updateResponseTime(startTime);
      throw error;
    }
  }

  /**
   * Set value in cache with appropriate TTL
   */
  async set<T>(
    dataType: CacheDataType,
    params: Record<string, any>,
    value: T
  ): Promise<boolean> {
    const startTime = Date.now();
    const key = KeyGenerator.generateKey(dataType, params);

    try {
      let success = true;

      // Set in L1 cache
      if (this.l1Cache) {
        const l1TTL = this.invalidation.getTTL(dataType) / 1000;
        const l1Success = this.l1Cache.set(key, value, l1TTL);
        success = success && l1Success;
      }

      // Set in L2 cache
      if (this.l2Cache) {
        const l2TTL = this.invalidation.getL2TTL(dataType);
        const l2Success = await this.l2Cache.set(key, value, dataType, l2TTL);
        success = success && l2Success;
      }

      this.updateResponseTime(startTime);
      return success;

    } catch (error) {
      this.metrics.errorRate++;
      this.updateResponseTime(startTime);
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in any cache layer
   */
  has(dataType: CacheDataType, params: Record<string, any> = {}): boolean {
    const key = KeyGenerator.generateKey(dataType, params);

    if (this.l1Cache?.has(key)) {
      return true;
    }

    if (this.l2Cache?.has(key)) {
      return true;
    }

    return false;
  }

  /**
   * Delete key from all cache layers
   */
  async del(dataType: CacheDataType, params: Record<string, any> = {}): Promise<boolean> {
    const key = KeyGenerator.generateKey(dataType, params);
    let success = true;

    if (this.l1Cache) {
      const l1Success = this.l1Cache.del(key) > 0;
      success = success && l1Success;
    }

    if (this.l2Cache) {
      const l2Success = this.l2Cache.del(key);
      success = success && l2Success;
    }

    return success;
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidate(patterns: InvalidationPattern[]): Promise<number> {
    let totalInvalidated = 0;

    for (const pattern of patterns) {
      // Invalidate L1 cache
      if (this.l1Cache) {
        if (pattern.type === 'prefix' || pattern.type === 'regex') {
          const l1Count = this.l1Cache.delByPattern(pattern.pattern);
          totalInvalidated += l1Count;
        } else if (pattern.type === 'exact') {
          const l1Count = this.l1Cache.del(pattern.pattern);
          totalInvalidated += l1Count;
        }
      }

      // Invalidate L2 cache
      if (this.l2Cache) {
        if (pattern.type === 'prefix' || pattern.type === 'regex') {
          const l2Count = this.l2Cache.delByPattern(pattern.pattern);
          totalInvalidated += l2Count;
        } else if (pattern.type === 'exact') {
          const l2Count = this.l2Cache.del(pattern.pattern) ? 1 : 0;
          totalInvalidated += l2Count;
        }
      }
    }

    return totalInvalidated;
  }

  /**
   * Invalidate cache by data type
   */
  async invalidateByType(dataType: CacheDataType, cascade: boolean = true): Promise<number> {
    const patterns = this.invalidation.invalidateByType(dataType, cascade);
    return this.invalidate(patterns);
  }

  /**
   * Invalidate cache by league
   */
  async invalidateByLeague(league: string): Promise<number> {
    const patterns = this.invalidation.invalidateByLeague(league);
    return this.invalidate(patterns);
  }

  /**
   * Warm up cache with predefined data
   */
  async warmup(jobs: CacheWarmupJob[] = this.warmupJobs): Promise<void> {
    if (!this.config.enableWarmup) {
      return;
    }

    // Sort by priority (higher priority first)
    const sortedJobs = [...jobs].sort((a, b) => b.priority - a.priority);

    for (const job of sortedJobs) {
      try {
        // Check if data already exists
        if (!this.has(job.type, job.params)) {
          // Would need to fetch from source and cache
          console.log(`Warmup needed for ${job.type} with params:`, job.params);
        }
      } catch (error) {
        console.error(`Warmup failed for ${job.type}:`, error);
      }
    }
  }

  /**
   * Add warmup job
   */
  addWarmupJob(job: CacheWarmupJob): void {
    this.warmupJobs.push(job);
  }

  /**
   * Clear all warmup jobs
   */
  clearWarmupJobs(): void {
    this.warmupJobs = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const l1Stats = this.l1Cache?.getStats() || {
      hits: 0,
      misses: 0,
      keys: 0,
      hitRate: 0,
      memoryUsage: 0
    };

    const l2Stats = this.l2Cache?.getStats() || {
      hits: 0,
      misses: 0,
      keys: 0,
      hitRate: 0,
      dbSize: 0
    };

    const totalHits = l1Stats.hits + l2Stats.hits;
    const totalMisses = l1Stats.misses + l2Stats.misses;
    const totalRequests = totalHits + totalMisses;
    const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      l1: l1Stats,
      l2: l2Stats,
      overall: {
        hits: totalHits,
        misses: totalMisses,
        hitRate: Math.round(overallHitRate * 10000) / 100
      }
    };
  }

  /**
   * Get detailed cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache health status
   */
  getHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    layers: {
      l1: { enabled: boolean; status: string };
      l2: { enabled: boolean; status: string };
    };
  } {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    const l1Status = this.l1Cache ? 'operational' : 'disabled';
    const l2Status = this.l2Cache ? 'operational' : 'disabled';

    // Check error rate
    if (this.metrics.errorRate > 0.1) {
      issues.push('High error rate');
      status = 'warning';
    }

    // Check if both layers are disabled
    if (!this.l1Cache && !this.l2Cache) {
      issues.push('All cache layers disabled');
      status = 'critical';
    }

    // Check L2 health if available
    if (this.l2Cache) {
      const l2Health = this.l2Cache.getHealth();
      if (l2Health.status !== 'healthy') {
        issues.push(...l2Health.issues);
        if (l2Health.status === 'critical' || status !== 'critical') {
          status = l2Health.status;
        }
      }
    }

    return {
      status,
      issues,
      layers: {
        l1: { enabled: !!this.l1Cache, status: l1Status },
        l2: { enabled: !!this.l2Cache, status: l2Status }
      }
    };
  }

  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    if (this.l1Cache) {
      this.l1Cache.clear();
    }

    if (this.l2Cache) {
      this.l2Cache.clear();
    }
  }

  /**
   * Update response time metrics
   */
  private updateResponseTime(startTime: number): void {
    const responseTime = Date.now() - startTime;
    const count = this.metrics.requestCount;
    
    if (count === 1) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      // Running average
      this.metrics.averageResponseTime = 
        ((this.metrics.averageResponseTime * (count - 1)) + responseTime) / count;
    }
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(): void {
    // Reset error rate periodically to prevent permanent degradation
    if (this.metrics.requestCount > 1000) {
      this.metrics.errorRate *= 0.9; // Decay error rate
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(updates: Partial<CacheManagerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update invalidation config if policies changed
    if (updates.policies) {
      this.invalidation.updateConfig({
        policies: this.config.policies
      });
    }

    // Restart stats timer if interval changed
    if (updates.statsUpdateInterval !== undefined) {
      if (this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = undefined;
      }
      this.startStatsUpdater();
    }
  }

  /**
   * Close cache manager and cleanup resources
   */
  async close(): Promise<void> {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }

    if (this.l1Cache) {
      this.l1Cache.close();
    }

    if (this.l2Cache) {
      this.l2Cache.close();
    }

    this.invalidation.close();
  }
}