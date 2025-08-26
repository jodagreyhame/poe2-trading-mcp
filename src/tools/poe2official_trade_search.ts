/**
 * POE2Official Trade Search Tools
 * 
 * MCP tools for searching items and currency on the official POE2 trade API.
 * Implements rate limiting, caching, and error handling.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolHandler } from '../server/toolRegistry.js';
import { Logger } from '../utils/logger.js';
import { POE2OfficialClient } from '../api/poe2OfficialClient.js';
import { TradeCache } from '../utils/trade-cache.js';
import {
  TradeSearchParams,
  TradeSearchResponse,
  TradeFetchParams,
  TradeFetchResponse,
  TradeSearchQuery,
  TradeExchangeQuery
} from '../types/trade-search-types.js';

// Initialize shared cache instance
const cache = new TradeCache({
  searchTTL: 120000,    // 2 minutes for search results
  fetchTTL: 60000,      // 1 minute for item details
  maxSize: 100,         // Maximum cache entries
  cleanupInterval: 60000 // Cleanup every minute
});

/**
 * Create POE2Official trade tools
 */
export function createPOE2OfficialTradeTools(logger: Logger): ToolHandler[] {
  return [
    createTradeSearchTool(cache, logger),
    createTradeFetchTool(cache, logger),
  ];
}

/**
 * Trade Search Tool - Search for items or currency
 */
function createTradeSearchTool(cache: TradeCache, logger: Logger): ToolHandler {
  const client = new POE2OfficialClient({
    contactEmail: process.env['POE2SCOUT_CONTACT_EMAIL'] || 'mcp-server@example.com',
    userAgent: 'poe2-mcp-server/1.0.0',
    logger
  });

  return {
    definition: {
      name: 'poe2official_trade_search',
      description: 'Search for items or currency on the official POE2 trade API. Returns a search ID and list of item IDs for fetching details.',
      inputSchema: {
        type: 'object',
        properties: {
          league: {
            type: 'string',
            description: 'League name (e.g., "Standard", "Hardcore")',
          },
          query: {
            type: 'object',
            description: 'Search query for items',
            properties: {
              term: {
                type: 'string',
                description: 'Search term (item name)',
              },
              type: {
                type: 'string',
                description: 'Item type filter',
              },
              stats: {
                type: 'array',
                description: 'Stat filters',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    filters: { type: 'array' },
                  },
                },
              },
              filters: {
                type: 'object',
                description: 'Additional filters (rarity, sockets, etc.)',
              },
            },
          },
          exchange: {
            type: 'object',
            description: 'Exchange query for currency',
            properties: {
              want: {
                type: 'array',
                items: { type: 'string' },
                description: 'Currency types to receive',
              },
              have: {
                type: 'array',
                items: { type: 'string' },
                description: 'Currency types to pay with',
              },
              minimum: {
                type: 'number',
                description: 'Minimum stock',
              },
            },
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10, max: 100)',
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['league'],
        additionalProperties: false,
      },
    },
    handler: async (args: TradeSearchParams): Promise<CallToolResult> => {
      const { league, query, exchange, limit = 10 } = args;

      // Validate input
      if (!league) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'League parameter is required',
              }, null, 2),
            },
          ],
        };
      }

      if (!query && !exchange) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Either query or exchange parameter is required',
              }, null, 2),
            },
          ],
        };
      }

      logger.debug('POE2Official trade search', { league, hasQuery: !!query, hasExchange: !!exchange });

      try {
        // Check cache first
        const cacheKey = cache.generateKey('search', { league, query, exchange });
        const cached = cache.get<TradeSearchResponse>(cacheKey);
        
        if (cached) {
          logger.debug('Returning cached search results', { cacheKey });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...cached,
                  cached: true,
                }, null, 2),
              },
            ],
          };
        }

        // Prepare search payload
        const searchPayload = exchange 
          ? { exchange: exchange as TradeExchangeQuery }
          : { query: query as TradeSearchQuery, sort: { price: 'asc' } };

        // Perform search
        const response = await client.searchTrade(league, searchPayload);

        // Parse response
        const searchResult: TradeSearchResponse = {
          id: response.id,
          complexity: response.complexity || null,
          result: response.result || [],
          total: response.total || response.result?.length || 0,
          inexact: response.inexact || false,
          cached: false,
        };

        // Limit results
        if (searchResult.result.length > limit) {
          searchResult.result = searchResult.result.slice(0, limit);
        }

        // Cache the result
        cache.set(cacheKey, searchResult);

        logger.info('Trade search completed', {
          league,
          total: searchResult.total,
          returned: searchResult.result.length,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResult, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Trade search failed', { error: errorMessage, league });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Trade search failed',
                message: errorMessage,
                league,
              }, null, 2),
            },
          ],
        };
      }
    },
  };
}

/**
 * Trade Fetch Tool - Fetch detailed item information
 */
function createTradeFetchTool(cache: TradeCache, logger: Logger): ToolHandler {
  const client = new POE2OfficialClient({
    contactEmail: process.env['POE2SCOUT_CONTACT_EMAIL'] || 'mcp-server@example.com',
    userAgent: 'poe2-mcp-server/1.0.0',
    logger
  });

  return {
    definition: {
      name: 'poe2official_trade_fetch',
      description: 'Fetch detailed information for items from a trade search. Requires a search ID and item IDs from a previous search.',
      inputSchema: {
        type: 'object',
        properties: {
          searchId: {
            type: 'string',
            description: 'Search ID from a previous trade search',
          },
          itemIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of item IDs to fetch (max 10)',
            maxItems: 10,
          },
          exchange: {
            type: 'boolean',
            description: 'Whether this is for currency exchange results',
          },
        },
        required: ['searchId', 'itemIds'],
        additionalProperties: false,
      },
    },
    handler: async (args: TradeFetchParams): Promise<CallToolResult> => {
      const { searchId, itemIds, exchange = false } = args;

      // Validate input
      if (!searchId || !itemIds || itemIds.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'searchId and itemIds are required',
              }, null, 2),
            },
          ],
        };
      }

      if (itemIds.length > 10) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Maximum 10 items can be fetched at once',
                provided: itemIds.length,
              }, null, 2),
            },
          ],
        };
      }

      logger.debug('POE2Official trade fetch', { searchId, itemCount: itemIds.length, exchange });

      try {
        // Check cache for individual items
        const cacheKey = cache.generateKey('fetch', { searchId, itemIds });
        const cached = cache.get<TradeFetchResponse>(cacheKey);
        
        if (cached) {
          logger.debug('Returning cached fetch results', { cacheKey });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...cached,
                  cached: true,
                }, null, 2),
              },
            ],
          };
        }

        // Fetch items
        const response = await client.fetchTradeItems(itemIds, searchId, exchange);

        // Parse and structure response
        const fetchResult: TradeFetchResponse = {
          result: response.result || [],
          cached: false,
        };

        // Process items to extract key information
        fetchResult.result = fetchResult.result.map((item: any) => ({
          id: item.id,
          listing: {
            method: item.listing?.method,
            indexed: item.listing?.indexed,
            stash: item.listing?.stash,
            whisper: item.listing?.whisper,
            account: {
              name: item.listing?.account?.name,
              lastCharacterName: item.listing?.account?.lastCharacterName,
              online: item.listing?.account?.online,
              language: item.listing?.account?.language,
            },
            price: item.listing?.price ? {
              type: item.listing.price.type,
              amount: item.listing.price.amount,
              currency: item.listing.price.currency,
            } : undefined,
          },
          item: {
            verified: item.item?.verified,
            w: item.item?.w,
            h: item.item?.h,
            icon: item.item?.icon,
            league: item.item?.league,
            name: item.item?.name,
            typeLine: item.item?.typeLine,
            baseType: item.item?.baseType,
            identified: item.item?.identified,
            ilvl: item.item?.ilvl,
            properties: item.item?.properties,
            requirements: item.item?.requirements,
            implicitMods: item.item?.implicitMods,
            explicitMods: item.item?.explicitMods,
            craftedMods: item.item?.craftedMods,
            enchantMods: item.item?.enchantMods,
            frameType: item.item?.frameType,
            corrupted: item.item?.corrupted,
            influences: item.item?.influences,
            sockets: item.item?.sockets,
            socketedItems: item.item?.socketedItems,
          },
        }));

        // Cache the result
        cache.set(cacheKey, fetchResult);

        logger.info('Trade fetch completed', {
          searchId,
          itemsFetched: fetchResult.result.length,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fetchResult, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Trade fetch failed', { error: errorMessage, searchId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Trade fetch failed',
                message: errorMessage,
                searchId,
                itemIds,
              }, null, 2),
            },
          ],
        };
      }
    },
  };
}