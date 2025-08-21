/**
 * L2 Cache - SQLite Persistence Layer
 * Persistent caching with compression and advanced querying
 */

import { SQLiteClient, CacheRow } from '../database/sqlite_client.js';
import { CompressionUtil } from '../utils/compression.js';
import { CacheStats, CacheDataType } from '../types/cache_types.js';

export interface L2CacheConfig {
  dbPath: string;
  maxSize: string;
  compressionThreshold: number;
  cleanupInterval?: number;
  enableWAL?: boolean;
}

export class L2Cache {
  private sqlite: SQLiteClient;
  private compression: CompressionUtil;
  private config: L2CacheConfig;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    compressionSaved: number;
  };
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor(config: L2CacheConfig) {
    this.config = {
      cleanupInterval: 300000, // 5 minutes
      enableWAL: true,
      ...config
    };

    this.sqlite = new SQLiteClient({
      dbPath: this.config.dbPath,
      maxSize: this.config.maxSize,
      enableWAL: this.config.enableWAL ?? true
    });

    this.compression = new CompressionUtil(this.config.compressionThreshold);

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      compressionSaved: 0
    };

    this.startCleanupTimer();
  }

  /**
   * Start background cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.config.cleanupInterval && this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval) as NodeJS.Timeout;
    }
  }

  /**
   * Get value from L2 cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const row = this.sqlite.get(key);
      
      if (!row) {
        this.stats.misses++;
        return undefined;
      }

      // Decompress if needed
      const value = await this.compression.decompress<T>(
        row.value,
        Boolean(row.compressed)
      );

      this.stats.hits++;
      return value;
    } catch (error) {
      console.error('L2Cache get error:', error);
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set value in L2 cache
   */
  async set<T>(
    key: string, 
    value: T, 
    dataType: CacheDataType, 
    ttl: number
  ): Promise<boolean> {
    try {
      const now = Date.now();
      const expiresAt = now + ttl;

      // Compress data if needed
      const { data, compressed } = await this.compression.compress(value);
      
      if (compressed) {
        const originalSize = Buffer.byteLength(JSON.stringify(value));
        const compressedSize = (data as Buffer).length;
        this.stats.compressionSaved += originalSize - compressedSize;
      }

      const entry: Omit<CacheRow, 'access_count'> = {
        key,
        value: data,
        data_type: dataType,
        ttl: expiresAt,
        created_at: now,
        last_accessed: now,
        compressed: compressed ? 1 : 0
      };

      const success = this.sqlite.set(entry);
      if (success) {
        this.stats.sets++;
      }
      return success;
    } catch (error) {
      console.error('L2Cache set error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in L2 cache
   */
  has(key: string): boolean {
    try {
      return this.sqlite.has(key);
    } catch (error) {
      console.error('L2Cache has error:', error);
      return false;
    }
  }

  /**
   * Delete key from L2 cache
   */
  del(key: string): boolean {
    try {
      const success = this.sqlite.del(key);
      if (success) {
        this.stats.deletes++;
      }
      return success;
    } catch (error) {
      console.error('L2Cache del error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  delMany(keys: string[]): number {
    try {
      const deletedCount = this.sqlite.delMany(keys);
      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      console.error('L2Cache delMany error:', error);
      return 0;
    }
  }

  /**
   * Delete keys by pattern
   */
  delByPattern(pattern: string): number {
    try {
      const deletedCount = this.sqlite.delByPattern(pattern);
      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      console.error('L2Cache delByPattern error:', error);
      return 0;
    }
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    try {
      return this.sqlite.keys();
    } catch (error) {
      console.error('L2Cache keys error:', error);
      return [];
    }
  }

  /**
   * Get keys by pattern
   */
  keysByPattern(pattern: string): string[] {
    try {
      return this.sqlite.keysByPattern(pattern);
    } catch (error) {
      console.error('L2Cache keysByPattern error:', error);
      return [];
    }
  }

  /**
   * Get keys by data type
   */
  keysByType(dataType: CacheDataType): string[] {
    try {
      // Use a pattern that matches the data type
      const pattern = `v1:${dataType}:*`;
      return this.keysByPattern(pattern);
    } catch (error) {
      console.error('L2Cache keysByType error:', error);
      return [];
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    try {
      return this.sqlite.cleanup();
    } catch (error) {
      console.error('L2Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Clear all entries
   */
  clear(): number {
    try {
      const keys = this.keys();
      if (keys.length === 0) return 0;
      
      return this.delMany(keys);
    } catch (error) {
      console.error('L2Cache clear error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats['l2'] {
    try {
      const sqliteStats = this.sqlite.getStats();
      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        keys: sqliteStats.totalKeys,
        hitRate: Math.round(hitRate * 10000) / 100, // Percentage with 2 decimal places
        dbSize: this.sqlite.getDbSize()
      };
    } catch (error) {
      console.error('L2Cache getStats error:', error);
      return {
        hits: 0,
        misses: 0,
        keys: 0,
        hitRate: 0,
        dbSize: 0
      };
    }
  }

  /**
   * Get detailed statistics
   */
  getDetailedStats(): {
    basic: CacheStats['l2'];
    compression: {
      savedBytes: number;
      compressionRatio: number;
    };
    database: {
      totalKeys: number;
      expiredKeys: number;
      totalSize: number;
      oldestEntry: number | null;
      newestEntry: number | null;
    };
    topAccessed: Array<{ key: string; access_count: number }>;
    lru: Array<{ key: string; last_accessed: number }>;
  } {
    const basic = this.getStats();
    const dbStats = this.sqlite.getStats();
    const topAccessed = this.sqlite.getMostAccessed(10);
    const lru = this.sqlite.getLRU(10);

    const compressionRatio = dbStats.totalSize > 0 
      ? (dbStats.totalSize - this.stats.compressionSaved) / dbStats.totalSize 
      : 1;

    return {
      basic,
      compression: {
        savedBytes: this.stats.compressionSaved,
        compressionRatio: Math.round(compressionRatio * 10000) / 100
      },
      database: dbStats,
      topAccessed,
      lru
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      compressionSaved: 0
    };
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    try {
      this.sqlite.vacuum();
    } catch (error) {
      console.error('L2Cache vacuum error:', error);
    }
  }

  /**
   * Set cache metadata
   */
  setMetadata(key: string, value: string): void {
    this.sqlite.setMetadata(key, value);
  }

  /**
   * Get cache metadata
   */
  getMetadata(key: string): string | undefined {
    return this.sqlite.getMetadata(key);
  }

  /**
   * Execute batch operations in a transaction
   */
  async batch<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    return this.sqlite.transaction(async () => {
      const results: T[] = [];
      for (const operation of operations) {
        results.push(await operation());
      }
      return results;
    });
  }

  /**
   * Get cache health information
   */
  getHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    metrics: {
      hitRate: number;
      dbSizeMB: number;
      expiredKeysPercent: number;
    };
  } {
    const stats = this.getDetailedStats();
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check hit rate
    if (stats.basic.hitRate < 50) {
      issues.push('Low cache hit rate');
      status = 'warning';
    }

    // Check database size
    const dbSizeMB = stats.basic.dbSize / (1024 * 1024);
    if (dbSizeMB > 500) {
      issues.push('Large database size');
      status = 'warning';
    }

    // Check expired keys
    const expiredPercent = stats.database.totalKeys > 0 
      ? (stats.database.expiredKeys / stats.database.totalKeys) * 100 
      : 0;
    
    if (expiredPercent > 25) {
      issues.push('High percentage of expired keys');
      if (expiredPercent > 50) {
        status = 'critical';
      } else if (status === 'healthy') {
        status = 'warning';
      }
    }

    return {
      status,
      issues,
      metrics: {
        hitRate: stats.basic.hitRate,
        dbSizeMB,
        expiredKeysPercent: expiredPercent
      }
    };
  }

  /**
   * Close cache and cleanup resources
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.sqlite.close();
  }
}