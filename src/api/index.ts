/**
 * POE2Scout API Client - Main exports
 * Provides a clean interface for importing all API components
 */

import { POE2ScoutClient } from './client.js';
import { CachedPOE2ScoutClient } from './cached_client.js';
import { ConfigManager, type POE2ScoutConfig } from '../utils/config.js';

export { POE2ScoutClient } from './client.js';
export { CachedPOE2ScoutClient } from './cached_client.js';

// Export types
export type {
  League,
  Category,
  UniqueItem,
  CurrencyItem,
  PriceLog,
  ItemFilters,
  LandingSplashInfo,
  UniqueBaseItem,
  APIResponse,
  PaginatedResponse,
  RequestConfig,
  RateLimitState,
  RetryConfig,
  APIError,
} from '../types/api.js';

// Export utilities
export { RateLimiter } from '../utils/rateLimiter.js';
export { RetryHandler } from '../utils/retryHandler.js';
export { ConfigManager, type POE2ScoutConfig } from '../utils/config.js';

// Convenience function to create a client with default settings
export function createClient(config?: Partial<POE2ScoutConfig>) {
  return new POE2ScoutClient(config);
}

// Convenience function to create a cached client with default settings
export function createCachedClient(config?: Partial<POE2ScoutConfig>) {
  return new CachedPOE2ScoutClient(config);
}

// Convenience function to create a client for different environments
export function createClientForEnvironment(
  env: 'development' | 'production' | 'testing',
  overrides?: Partial<POE2ScoutConfig>
) {
  const configManager = ConfigManager.createForEnvironment(env);
  return new POE2ScoutClient({
    ...configManager.getConfig(),
    ...overrides,
  });
}
