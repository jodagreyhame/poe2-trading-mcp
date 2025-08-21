/**
 * Cache Key Generation Utilities
 * Provides consistent and collision-free cache key generation
 */

import { CacheDataType } from '../types/cache_types.js';
import { createHash } from 'crypto';

export class KeyGenerator {
  private static readonly SEPARATOR = ':';
  private static readonly VERSION = 'v1';

  /**
   * Generate a cache key from type and parameters
   */
  static generateKey(type: CacheDataType, params: Record<string, any> = {}): string {
    // Sort parameters for consistent key generation
    const sortedParams = this.sortAndNormalizeParams(params);
    const paramString = this.serializeParams(sortedParams);
    
    // Create base key
    const baseKey = [this.VERSION, type, paramString].join(this.SEPARATOR);
    
    // Hash long keys to prevent issues with key length limits
    if (baseKey.length > 200) {
      const hash = this.hashString(baseKey);
      return [this.VERSION, type, hash].join(this.SEPARATOR);
    }
    
    return baseKey;
  }

  /**
   * Parse a cache key back to its components
   */
  static parseKey(key: string): { type: CacheDataType; params: Record<string, any> } | null {
    try {
      const parts = key.split(this.SEPARATOR);
      
      if (parts.length < 2 || parts[0] !== this.VERSION) {
        return null;
      }

      const type = parts[1] as CacheDataType;
      const paramsString = parts.slice(2).join(this.SEPARATOR);
      
      // If the params part looks like a hash, we can't parse it back
      if (this.isHashString(paramsString)) {
        return { type, params: {} };
      }

      const params = this.deserializeParams(paramsString);
      return { type, params };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate a pattern for matching keys by type
   */
  static getTypePattern(type: CacheDataType): string {
    return `${this.VERSION}${this.SEPARATOR}${type}${this.SEPARATOR}*`;
  }

  /**
   * Generate a pattern for matching keys by type and partial params
   */
  static getPartialPattern(type: CacheDataType, partialParams: Record<string, any>): string {
    const sortedParams = this.sortAndNormalizeParams(partialParams);
    const paramString = this.serializeParams(sortedParams);
    return `${this.VERSION}${this.SEPARATOR}${type}${this.SEPARATOR}${paramString}*`;
  }

  /**
   * Check if a key matches a pattern
   */
  static matchesPattern(key: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\\\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Extract data type from cache key
   */
  static getTypeFromKey(key: string): CacheDataType | null {
    const parts = key.split(this.SEPARATOR);
    if (parts.length < 2 || parts[0] !== this.VERSION) {
      return null;
    }
    return parts[1] as CacheDataType;
  }

  /**
   * Validate if a string is a valid cache key
   */
  static isValidKey(key: string): boolean {
    const parts = key.split(this.SEPARATOR);
    return parts.length >= 2 && parts[0] === this.VERSION;
  }

  /**
   * Sort and normalize parameters for consistent key generation
   */
  private static sortAndNormalizeParams(params: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    
    // Sort keys and normalize values
    Object.keys(params)
      .sort()
      .forEach(key => {
        const value = params[key];
        
        // Normalize different types
        if (value === null || value === undefined) {
          normalized[key] = '';
        } else if (typeof value === 'object') {
          normalized[key] = JSON.stringify(value);
        } else {
          normalized[key] = String(value);
        }
      });

    return normalized;
  }

  /**
   * Serialize parameters to string
   */
  private static serializeParams(params: Record<string, any>): string {
    if (Object.keys(params).length === 0) {
      return '';
    }

    return Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  /**
   * Deserialize parameters from string
   */
  private static deserializeParams(paramString: string): Record<string, any> {
    if (!paramString) {
      return {};
    }

    const params: Record<string, any> = {};
    
    paramString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        params[key] = value;
      }
    });

    return params;
  }

  /**
   * Hash a string using SHA-256
   */
  private static hashString(input: string): string {
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Check if a string looks like a hash
   */
  private static isHashString(input: string): boolean {
    return /^[a-f0-9]{16}$/.test(input);
  }

  /**
   * Generate cache key for leagues
   */
  static forLeagues(): string {
    return this.generateKey('leagues');
  }

  /**
   * Generate cache key for categories
   */
  static forCategories(): string {
    return this.generateKey('categories');
  }

  /**
   * Generate cache key for unique items
   */
  static forUniqueItems(category: string, options: Record<string, any> = {}): string {
    return this.generateKey('unique_items', { category, ...options });
  }

  /**
   * Generate cache key for currency items
   */
  static forCurrencyItems(category: string, options: Record<string, any> = {}): string {
    return this.generateKey('currency_items', { category, ...options });
  }

  /**
   * Generate cache key for item history
   */
  static forItemHistory(itemId: string, options: Record<string, any> = {}): string {
    return this.generateKey('item_history', { itemId, ...options });
  }

  /**
   * Generate cache key for search results
   */
  static forSearchResults(query: string, options: Record<string, any> = {}): string {
    return this.generateKey('search_results', { query, ...options });
  }

  /**
   * Generate cache key for item filters
   */
  static forItemFilters(): string {
    return this.generateKey('item_filters');
  }

  /**
   * Generate cache key for landing info
   */
  static forLandingInfo(): string {
    return this.generateKey('landing_info');
  }

  /**
   * Generate cache key for base items
   */
  static forBaseItems(): string {
    return this.generateKey('base_items');
  }
}