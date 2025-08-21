/**
 * SQLite Client for L2 Cache
 * Handles SQLite database operations with WAL mode and proper indexing
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface SQLiteConfig {
  dbPath: string;
  maxSize: string;
  enableWAL?: boolean;
  timeout?: number;
  verbose?: boolean;
}

export interface CacheRow {
  key: string;
  value: Buffer | string;
  data_type: string;
  ttl: number;
  created_at: number;
  last_accessed: number;
  compressed: number; // SQLite uses 0/1 for boolean
  access_count: number;
}

export class SQLiteClient {
  private db!: Database.Database;
  private config: SQLiteConfig;

  constructor(config: SQLiteConfig) {
    this.config = {
      enableWAL: true,
      timeout: 30000,
      verbose: false,
      ...config
    };

    this.ensureDbDirectory();
    this.initializeDatabase();
  }

  /**
   * Ensure database directory exists
   */
  private ensureDbDirectory(): void {
    const dbDir = join(this.config.dbPath, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  /**
   * Initialize SQLite database with proper settings
   */
  private initializeDatabase(): void {
    try {
      this.db = new Database(this.config.dbPath, {
        verbose: this.config.verbose ? console.log : undefined,
        timeout: this.config.timeout
      });

      // Configure database settings
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = memory');
      this.db.pragma('mmap_size = 268435456'); // 256MB
      
      // Set timeout for busy database
      this.db.pragma(`busy_timeout = ${this.config.timeout}`);

      this.createTables();
      this.createIndexes();
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  /**
   * Create cache tables
   */
  private createTables(): void {
    const createCacheTable = `
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL,
        data_type TEXT NOT NULL,
        ttl INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        compressed INTEGER NOT NULL DEFAULT 0,
        access_count INTEGER NOT NULL DEFAULT 1
      )
    `;

    const createMetadataTable = `
      CREATE TABLE IF NOT EXISTS cache_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;

    this.db.exec(createCacheTable);
    this.db.exec(createMetadataTable);
  }

  /**
   * Create indexes for better query performance
   */
  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_cache_data_type ON cache_entries(data_type)',
      'CREATE INDEX IF NOT EXISTS idx_cache_ttl ON cache_entries(ttl)',
      'CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache_entries(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_cache_last_accessed ON cache_entries(last_accessed)',
      'CREATE INDEX IF NOT EXISTS idx_cache_access_count ON cache_entries(access_count)'
    ];

    indexes.forEach(index => this.db.exec(index));
  }

  /**
   * Get value from cache
   */
  get(key: string): CacheRow | undefined {
    try {
      const stmt = this.db.prepare(`
        UPDATE cache_entries 
        SET last_accessed = ?, access_count = access_count + 1 
        WHERE key = ? AND ttl > ?
      `);
      
      const now = Date.now();
      const result = stmt.run(now, key, now);
      
      if (result.changes === 0) {
        return undefined;
      }

      const selectStmt = this.db.prepare('SELECT * FROM cache_entries WHERE key = ?');
      return selectStmt.get(key) as CacheRow | undefined;
    } catch (error) {
      console.error('SQLite get error:', error);
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  set(entry: Omit<CacheRow, 'access_count'>): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache_entries 
        (key, value, data_type, ttl, created_at, last_accessed, compressed, access_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 
          COALESCE((SELECT access_count FROM cache_entries WHERE key = ?), 1)
        )
      `);

      const result = stmt.run(
        entry.key,
        entry.value,
        entry.data_type,
        entry.ttl,
        entry.created_at,
        entry.last_accessed,
        entry.compressed ? 1 : 0,
        entry.key // For the COALESCE subquery
      );

      return result.changes > 0;
    } catch (error) {
      console.error('SQLite set error:', error);
      return false;
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM cache_entries WHERE key = ? AND ttl > ?');
      return stmt.get(key, Date.now()) !== undefined;
    } catch (error) {
      console.error('SQLite has error:', error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  del(key: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM cache_entries WHERE key = ?');
      const result = stmt.run(key);
      return result.changes > 0;
    } catch (error) {
      console.error('SQLite del error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  delMany(keys: string[]): number {
    if (keys.length === 0) return 0;

    try {
      const placeholders = keys.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM cache_entries WHERE key IN (${placeholders})`);
      const result = stmt.run(...keys);
      return result.changes;
    } catch (error) {
      console.error('SQLite delMany error:', error);
      return 0;
    }
  }

  /**
   * Delete keys by pattern
   */
  delByPattern(pattern: string): number {
    try {
      // Convert glob pattern to SQL LIKE pattern
      const sqlPattern = pattern.replace(/\*/g, '%');
      const stmt = this.db.prepare('DELETE FROM cache_entries WHERE key LIKE ?');
      const result = stmt.run(sqlPattern);
      return result.changes;
    } catch (error) {
      console.error('SQLite delByPattern error:', error);
      return 0;
    }
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    try {
      const stmt = this.db.prepare('SELECT key FROM cache_entries WHERE ttl > ?');
      const rows = stmt.all(Date.now()) as { key: string }[];
      return rows.map(row => row.key);
    } catch (error) {
      console.error('SQLite keys error:', error);
      return [];
    }
  }

  /**
   * Get keys by pattern
   */
  keysByPattern(pattern: string): string[] {
    try {
      const sqlPattern = pattern.replace(/\*/g, '%');
      const stmt = this.db.prepare('SELECT key FROM cache_entries WHERE key LIKE ? AND ttl > ?');
      const rows = stmt.all(sqlPattern, Date.now()) as { key: string }[];
      return rows.map(row => row.key);
    } catch (error) {
      console.error('SQLite keysByPattern error:', error);
      return [];
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    try {
      const stmt = this.db.prepare('DELETE FROM cache_entries WHERE ttl <= ?');
      const result = stmt.run(Date.now());
      return result.changes;
    } catch (error) {
      console.error('SQLite cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalKeys: number;
    expiredKeys: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    try {
      const now = Date.now();
      
      const totalKeysStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries');
      const totalKeys = (totalKeysStmt.get() as { count: number }).count;

      const expiredKeysStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache_entries WHERE ttl <= ?');
      const expiredKeys = (expiredKeysStmt.get(now) as { count: number }).count;

      const sizeStmt = this.db.prepare('SELECT SUM(LENGTH(value)) as size FROM cache_entries WHERE ttl > ?');
      const totalSize = (sizeStmt.get(now) as { size: number | null }).size || 0;

      const rangeStmt = this.db.prepare(`
        SELECT MIN(created_at) as oldest, MAX(created_at) as newest 
        FROM cache_entries WHERE ttl > ?
      `);
      const range = rangeStmt.get(now) as { oldest: number | null; newest: number | null };

      return {
        totalKeys: totalKeys - expiredKeys,
        expiredKeys,
        totalSize,
        oldestEntry: range.oldest,
        newestEntry: range.newest
      };
    } catch (error) {
      console.error('SQLite getStats error:', error);
      return {
        totalKeys: 0,
        expiredKeys: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }

  /**
   * Get most accessed entries
   */
  getMostAccessed(limit: number = 10): Array<{ key: string; access_count: number }> {
    try {
      const stmt = this.db.prepare(`
        SELECT key, access_count 
        FROM cache_entries 
        WHERE ttl > ? 
        ORDER BY access_count DESC 
        LIMIT ?
      `);
      return stmt.all(Date.now(), limit) as Array<{ key: string; access_count: number }>;
    } catch (error) {
      console.error('SQLite getMostAccessed error:', error);
      return [];
    }
  }

  /**
   * Get least recently used entries
   */
  getLRU(limit: number = 10): Array<{ key: string; last_accessed: number }> {
    try {
      const stmt = this.db.prepare(`
        SELECT key, last_accessed 
        FROM cache_entries 
        WHERE ttl > ? 
        ORDER BY last_accessed ASC 
        LIMIT ?
      `);
      return stmt.all(Date.now(), limit) as Array<{ key: string; last_accessed: number }>;
    } catch (error) {
      console.error('SQLite getLRU error:', error);
      return [];
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    try {
      this.db.exec('VACUUM');
    } catch (error) {
      console.error('SQLite vacuum error:', error);
    }
  }

  /**
   * Get database file size
   */
  getDbSize(): number {
    try {
      const stmt = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
      const result = stmt.get() as { size: number };
      return result.size;
    } catch (error) {
      console.error('SQLite getDbSize error:', error);
      return 0;
    }
  }

  /**
   * Set metadata value
   */
  setMetadata(key: string, value: string): void {
    try {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO cache_metadata (key, value) VALUES (?, ?)');
      stmt.run(key, value);
    } catch (error) {
      console.error('SQLite setMetadata error:', error);
    }
  }

  /**
   * Get metadata value
   */
  getMetadata(key: string): string | undefined {
    try {
      const stmt = this.db.prepare('SELECT value FROM cache_metadata WHERE key = ?');
      const result = stmt.get(key) as { value: string } | undefined;
      return result?.value;
    } catch (error) {
      console.error('SQLite getMetadata error:', error);
      return undefined;
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close();
    } catch (error) {
      console.error('SQLite close error:', error);
    }
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }
}