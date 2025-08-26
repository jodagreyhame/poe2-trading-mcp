/**
 * POE2Official Batch Search Tool
 * 
 * MCP tool for executing multiple concurrent trade searches with priority queue,
 * deduplication, and intelligent result aggregation.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolHandler } from '../server/toolRegistry.js';
import { Logger } from '../utils/logger.js';
import { POE2OfficialClient } from '../api/poe2OfficialClient.js';
import { TradeCache } from '../utils/trade-cache.js';
import { PriorityQueue, Priority } from '../utils/priority-queue.js';
import { BatchManager, BatchRequest } from '../utils/batch-manager.js';
import { TradeSearchQuery, TradeExchangeQuery } from '../types/trade-search-types.js';

/**
 * Batch search parameters
 */
export interface BatchSearchParams {
  searches: Array<{
    id?: string;
    league: string;
    query?: TradeSearchQuery;
    exchange?: TradeExchangeQuery;
    priority?: 'high' | 'medium' | 'low';
  }>;
  delayBetweenMs?: number;
  maxConcurrent?: number;
  deduplicateResults?: boolean;
  aggregateResults?: boolean;
}

/**
 * Batch search result
 */
export interface BatchSearchResult {
  searchId: string;
  league: string;
  total: number;
  itemIds: string[];
  cached: boolean;
  error?: string;
}

/**
 * Batch search response
 */
export interface BatchSearchResponse {
  results: BatchSearchResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
    duplicatesPrevented: number;
    executionTime: number;
  };
  aggregated?: {
    totalItems: number;
    uniqueItems: number;
    byLeague: Record<string, number>;
  };
}

// Initialize shared cache for batch searches
const batchCache = new TradeCache({
  searchTTL: 120000,    // 2 minutes
  fetchTTL: 60000,      // 1 minute
  maxSize: 200,         // Larger cache for batch operations
  cleanupInterval: 60000
});

/**
 * Create POE2Official batch search tool
 */
export function createPOE2OfficialBatchSearchTool(logger: Logger): ToolHandler {
  const client = new POE2OfficialClient({
    contactEmail: process.env['POE2SCOUT_CONTACT_EMAIL'] || 'mcp-server@example.com',
    userAgent: 'poe2-mcp-server/1.0.0',
    logger
  });

  interface SearchRequest {
    id?: string;
    league: string;
    query?: TradeSearchQuery;
    exchange?: TradeExchangeQuery;
    priority?: 'high' | 'medium' | 'low';
  }

  const priorityQueue = new PriorityQueue<SearchRequest>({
    maxSize: 100,
    deduplicationWindowMs: 60000, // 1 minute deduplication
  });

  const batchManager = new BatchManager<SearchRequest, BatchSearchResult>({
    maxConcurrent: 10,
    defaultTimeout: 30000,
    retryLimit: 2,
    retryDelay: 1000,
  });

  return {
    definition: {
      name: 'poe2official_batch_search',
      description: 'Execute multiple concurrent trade searches with priority queue and deduplication',
      inputSchema: {
        type: 'object',
        properties: {
          searches: {
            type: 'array',
            description: 'Array of search requests (max 50)',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Optional unique identifier for this search',
                },
                league: {
                  type: 'string',
                  description: 'League name',
                },
                query: {
                  type: 'object',
                  description: 'Item search query',
                },
                exchange: {
                  type: 'object',
                  description: 'Currency exchange query',
                },
                priority: {
                  type: 'string',
                  enum: ['high', 'medium', 'low'],
                  description: 'Search priority (default: medium)',
                },
              },
              required: ['league'],
            },
            maxItems: 50,
          },
          delayBetweenMs: {
            type: 'number',
            description: 'Delay between searches in milliseconds (100-5000)',
            minimum: 100,
            maximum: 5000,
            default: 500,
          },
          maxConcurrent: {
            type: 'number',
            description: 'Maximum concurrent searches (1-10)',
            minimum: 1,
            maximum: 10,
            default: 5,
          },
          deduplicateResults: {
            type: 'boolean',
            description: 'Remove duplicate items across searches',
            default: false,
          },
          aggregateResults: {
            type: 'boolean',
            description: 'Provide aggregated statistics',
            default: true,
          },
        },
        required: ['searches'],
        additionalProperties: false,
      },
    },
    handler: async (args: BatchSearchParams): Promise<CallToolResult> => {
      const {
        searches,
        delayBetweenMs = 500,
        maxConcurrent = 5,
        deduplicateResults = false,
        aggregateResults = true,
      } = args;

      // Validate input
      if (!searches || searches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'At least one search is required',
              }, null, 2),
            },
          ],
        };
      }

      if (searches.length > 50) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Maximum 50 searches per batch',
                provided: searches.length,
              }, null, 2),
            },
          ],
        };
      }

      logger.debug('POE2Official batch search', { 
        searchCount: searches.length,
        maxConcurrent,
      });

      const startTime = Date.now();
      const results: BatchSearchResult[] = [];
      const queueStats = { duplicatesPrevented: 0 };

      try {
        // Update batch manager config
        batchManager.updateConfig({ maxConcurrent });

        // Enqueue all searches with priority
        const batchRequests: BatchRequest<SearchRequest>[] = [];
        
        for (const search of searches) {
          const priority = search.priority === 'high' ? Priority.HIGH :
                          search.priority === 'low' ? Priority.LOW :
                          Priority.MEDIUM;

          const searchId = priorityQueue.enqueue(search, priority);
          if (searchId === null) {
            logger.warn('Queue full, skipping search', { search });
            continue;
          }

          // Check if it was a duplicate
          if (!search.id || search.id !== searchId) {
            queueStats.duplicatesPrevented++;
          }

          batchRequests.push({
            id: searchId,
            data: search,
            priority: priority,
            timeout: 30000,
          });
        }

        // Execute searches with batch manager
        const batchResults = await batchManager.executeBatch(
          batchRequests,
          async (search) => {
            // Check cache first
            const cacheKey = batchCache.generateKey('search', {
              league: search.league,
              query: search.query,
              exchange: search.exchange,
            });
            
            const cached = batchCache.get<BatchSearchResult>(cacheKey);
            if (cached) {
              return { ...cached, cached: true };
            }

            // Add delay between searches to respect rate limits
            if (delayBetweenMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
            }

            try {
              // Perform search
              const searchPayload = search.exchange 
                ? { exchange: search.exchange }
                : { query: search.query, sort: { price: 'asc' } };

              const response = await client.searchTrade(search.league, searchPayload);

              const result: BatchSearchResult = {
                searchId: response.id,
                league: search.league,
                total: response.total || 0,
                itemIds: response.result || [],
                cached: false,
              };

              // Cache the result
              batchCache.set(cacheKey, result);

              return result;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return {
                searchId: '',
                league: search.league,
                total: 0,
                itemIds: [],
                cached: false,
                error: errorMessage,
              };
            }
          }
        );

        // Process results
        for (const batchResult of batchResults) {
          if (batchResult.result) {
            results.push(batchResult.result);
          } else if (batchResult.error) {
            results.push({
              searchId: '',
              league: '',
              total: 0,
              itemIds: [],
              cached: false,
              error: batchResult.error.message,
            });
          }
        }


        // Deduplicate results if requested
        let uniqueItemIds = new Set<string>();
        if (deduplicateResults) {
          for (const result of results) {
            result.itemIds = result.itemIds.filter(id => {
              if (uniqueItemIds.has(id)) {
                return false;
              }
              uniqueItemIds.add(id);
              return true;
            });
          }
        } else {
          for (const result of results) {
            result.itemIds.forEach(id => uniqueItemIds.add(id));
          }
        }

        // Build response
        const response: BatchSearchResponse = {
          results,
          summary: {
            total: results.length,
            successful: results.filter(r => !r.error).length,
            failed: results.filter(r => r.error).length,
            cached: results.filter(r => r.cached).length,
            duplicatesPrevented: queueStats.duplicatesPrevented,
            executionTime: Date.now() - startTime,
          },
        };

        // Add aggregated statistics if requested
        if (aggregateResults) {
          const byLeague: Record<string, number> = {};
          let totalItems = 0;
          
          for (const result of results) {
            if (!result.error) {
              totalItems += result.itemIds.length;
              const currentCount = byLeague[result.league] || 0;
              byLeague[result.league] = currentCount + result.itemIds.length;
            }
          }

          response.aggregated = {
            totalItems,
            uniqueItems: uniqueItemIds.size,
            byLeague,
          };
        }

        logger.info('Batch search completed', {
          searches: searches.length,
          successful: response.summary.successful,
          failed: response.summary.failed,
          executionTime: response.summary.executionTime,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Batch search failed', { error: errorMessage });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Batch search failed',
                message: errorMessage,
                searchCount: searches.length,
              }, null, 2),
            },
          ],
        };
      } finally {
        // Clear queue and reset stats
        priorityQueue.clear();
        batchManager.resetStats();
      }
    },
  };
}