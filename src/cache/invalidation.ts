/**
 * Cache Invalidation System
 * Handles TTL-based and manual cache invalidation with cascade support
 */

import { CacheDataType, InvalidationPattern, CachePolicy } from '../types/cache_types.js';
import { KeyGenerator } from '../utils/key_generation.js';

export interface InvalidationConfig {
  defaultTTL: number;
  policies: Record<string, CachePolicy>;
  cleanupInterval: number;
  cascadeDepth: number;
}

export interface InvalidationJob {
  pattern: InvalidationPattern;
  scheduledAt: number;
  reason: string;
}

export class CacheInvalidation {
  private config: InvalidationConfig;
  private scheduledJobs: Map<string, InvalidationJob>;
  private invalidationTimer?: NodeJS.Timeout | undefined;
  private cascadeMap: Map<CacheDataType, CacheDataType[]>;

  constructor(config: InvalidationConfig) {
    this.config = config;
    this.scheduledJobs = new Map();
    this.cascadeMap = new Map();
    this.setupCascadeRelationships();
    this.startInvalidationTimer();
  }

  /**
   * Setup cascade relationships between data types
   */
  private setupCascadeRelationships(): void {
    // When leagues change, invalidate related data
    this.cascadeMap.set('leagues', ['unique_items', 'currency_items', 'search_results']);
    
    // When categories change, invalidate item data
    this.cascadeMap.set('categories', ['unique_items', 'currency_items']);
    
    // When items change, invalidate search results
    this.cascadeMap.set('unique_items', ['search_results']);
    this.cascadeMap.set('currency_items', ['search_results']);
    
    // Landing info affects base items
    this.cascadeMap.set('landing_info', ['base_items']);
  }

  /**
   * Start background invalidation timer
   */
  private startInvalidationTimer(): void {
    if (this.config.cleanupInterval > 0) {
      this.invalidationTimer = setInterval(() => {
        this.processScheduledInvalidations();
      }, this.config.cleanupInterval) as NodeJS.Timeout;
    }
  }

  /**
   * Get TTL for a specific data type
   */
  getTTL(dataType: CacheDataType): number {
    const policy = this.config.policies[dataType];
    return policy?.l1TTL || this.config.defaultTTL;
  }

  /**
   * Get L2 TTL for a specific data type
   */
  getL2TTL(dataType: CacheDataType): number {
    const policy = this.config.policies[dataType];
    return policy?.l2TTL || (this.getTTL(dataType) * 5); // Default L2 is 5x L1
  }

  /**
   * Get refresh threshold for a data type
   */
  getRefreshThreshold(dataType: CacheDataType): number {
    const policy = this.config.policies[dataType];
    return policy?.refreshThreshold || 0.8; // Refresh at 80% of TTL
  }

  /**
   * Check if a cache entry should be refreshed
   */
  shouldRefresh(dataType: CacheDataType, ageMs: number): boolean {
    const ttl = this.getTTL(dataType);
    const threshold = this.getRefreshThreshold(dataType);
    return ageMs >= (ttl * threshold);
  }

  /**
   * Schedule invalidation for a specific pattern
   */
  scheduleInvalidation(
    pattern: InvalidationPattern,
    delayMs: number = 0,
    _reason: string = 'Scheduled invalidation'
  ): void {
    const jobId = this.generateJobId(pattern);
    const scheduledAt = Date.now() + delayMs;

    this.scheduledJobs.set(jobId, {
      pattern,
      scheduledAt,
      reason: _reason
    });
  }

  /**
   * Invalidate cache entries by data type
   */
  invalidateByType(
    dataType: CacheDataType,
    _cascade: boolean = true,
    _reason: string = 'Type invalidation'
  ): InvalidationPattern[] {
    const patterns: InvalidationPattern[] = [];
    
    // Create pattern for the specific type
    const pattern: InvalidationPattern = {
      type: 'prefix',
      pattern: KeyGenerator.getTypePattern(dataType),
      cascade: _cascade
    };
    
    patterns.push(pattern);
    
    // Add cascade invalidations if enabled
    if (_cascade) {
      const cascadeTypes = this.cascadeMap.get(dataType) || [];
      cascadeTypes.forEach(cascadeType => {
        const cascadePattern: InvalidationPattern = {
          type: 'prefix',
          pattern: KeyGenerator.getTypePattern(cascadeType),
          cascade: false // Prevent infinite cascade
        };
        patterns.push(cascadePattern);
      });
    }

    return patterns;
  }

  /**
   * Invalidate cache entries by key pattern
   */
  invalidateByPattern(
    pattern: string,
    type: 'exact' | 'prefix' | 'regex' = 'prefix',
    _cascade: boolean = false
  ): InvalidationPattern {
    return {
      type,
      pattern,
      cascade: _cascade
    };
  }

  /**
   * Invalidate cache entries related to a specific league
   */
  invalidateByLeague(
    league: string,
    _cascade: boolean = true
  ): InvalidationPattern[] {
    const patterns: InvalidationPattern[] = [];
    
    // Invalidate all data types that include league parameter
    const leagueDataTypes: CacheDataType[] = [
      'unique_items',
      'currency_items',
      'item_history',
      'search_results'
    ];

    leagueDataTypes.forEach(dataType => {
      const pattern: InvalidationPattern = {
        type: 'regex',
        pattern: `v1:${dataType}:.*league=${league}.*`,
        cascade: false
      };
      patterns.push(pattern);
    });

    return patterns;
  }

  /**
   * Invalidate search results for a specific query
   */
  invalidateSearchResults(query?: string): InvalidationPattern[] {
    const patterns: InvalidationPattern[] = [];

    if (query) {
      // Invalidate specific search query
      const pattern: InvalidationPattern = {
        type: 'regex',
        pattern: `v1:search_results:.*query=${query}.*`,
        cascade: false
      };
      patterns.push(pattern);
    } else {
      // Invalidate all search results
      const pattern: InvalidationPattern = {
        type: 'prefix',
        pattern: KeyGenerator.getTypePattern('search_results'),
        cascade: false
      };
      patterns.push(pattern);
    }

    return patterns;
  }

  /**
   * Process scheduled invalidations
   */
  private processScheduledInvalidations(): void {
    const now = Date.now();
    const expiredJobs: string[] = [];

    this.scheduledJobs.forEach((job, jobId) => {
      if (job.scheduledAt <= now) {
        expiredJobs.push(jobId);
      }
    });

    // Remove expired jobs
    expiredJobs.forEach(jobId => {
      this.scheduledJobs.delete(jobId);
    });
  }

  /**
   * Get scheduled invalidation jobs
   */
  getScheduledJobs(): Array<{ id: string; job: InvalidationJob; timeUntilExecution: number }> {
    const now = Date.now();
    const jobs: Array<{ id: string; job: InvalidationJob; timeUntilExecution: number }> = [];

    this.scheduledJobs.forEach((job, id) => {
      jobs.push({
        id,
        job,
        timeUntilExecution: Math.max(0, job.scheduledAt - now)
      });
    });

    return jobs.sort((a, b) => a.timeUntilExecution - b.timeUntilExecution);
  }

  /**
   * Cancel scheduled invalidation
   */
  cancelInvalidation(jobId: string): boolean {
    return this.scheduledJobs.delete(jobId);
  }

  /**
   * Generate unique job ID for invalidation pattern
   */
  private generateJobId(pattern: InvalidationPattern): string {
    return `${pattern.type}:${pattern.pattern}:${Date.now()}`;
  }

  /**
   * Create invalidation patterns for data refresh
   */
  createRefreshPatterns(
    dataType: CacheDataType,
    params: Record<string, any> = {}
  ): InvalidationPattern[] {
    const patterns: InvalidationPattern[] = [];

    if (Object.keys(params).length === 0) {
      // Refresh all entries of this type
      patterns.push({
        type: 'prefix',
        pattern: KeyGenerator.getTypePattern(dataType),
        cascade: false
      });
    } else {
      // Refresh specific entries
      const partialPattern = KeyGenerator.getPartialPattern(dataType, params);
      patterns.push({
        type: 'prefix',
        pattern: partialPattern,
        cascade: false
      });
    }

    return patterns;
  }

  /**
   * Check if invalidation is needed based on cache age
   */
  checkInvalidationNeeded(
    dataType: CacheDataType,
    lastUpdate: number
  ): { needed: boolean; reason: string; suggestedTTL: number } {
    const now = Date.now();
    const age = now - lastUpdate;
    const ttl = this.getTTL(dataType);
    const refreshThreshold = this.getRefreshThreshold(dataType);

    if (age >= ttl) {
      return {
        needed: true,
        reason: 'TTL expired',
        suggestedTTL: ttl
      };
    }

    if (age >= (ttl * refreshThreshold)) {
      return {
        needed: true,
        reason: 'Refresh threshold reached',
        suggestedTTL: ttl
      };
    }

    return {
      needed: false,
      reason: 'Cache still fresh',
      suggestedTTL: ttl - age
    };
  }

  /**
   * Get invalidation statistics
   */
  getStats(): {
    scheduledJobs: number;
    cascadeRelationships: number;
    nextInvalidationIn: number;
    policies: Record<string, CachePolicy>;
  } {
    const nextJob = this.getScheduledJobs()[0];
    const nextInvalidationIn = nextJob ? nextJob.timeUntilExecution : -1;

    return {
      scheduledJobs: this.scheduledJobs.size,
      cascadeRelationships: this.cascadeMap.size,
      nextInvalidationIn,
      policies: this.config.policies
    };
  }

  /**
   * Update invalidation configuration
   */
  updateConfig(updates: Partial<InvalidationConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart timer if interval changed
    if (updates.cleanupInterval !== undefined) {
      if (this.invalidationTimer) {
        clearInterval(this.invalidationTimer);
        this.invalidationTimer = undefined;
      }
      this.startInvalidationTimer();
    }
  }

  /**
   * Close invalidation system
   */
  close(): void {
    if (this.invalidationTimer) {
      clearInterval(this.invalidationTimer);
      this.invalidationTimer = undefined;
    }
    
    this.scheduledJobs.clear();
    this.cascadeMap.clear();
  }
}