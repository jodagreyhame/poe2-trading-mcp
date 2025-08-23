/**
 * Basic POE2Scout API Tools
 * 
 * Simple, direct access to POE2Scout API endpoints without complex wrappers.
 * These tools provide reliable access to the core API functionality.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { POE2ScoutClient } from '../api/client.js';
import { ToolHandler } from '../server/toolRegistry.js';
import { Logger } from '../utils/logger.js';
import { analyzePriceHistory } from '../analysis/priceAnalysis.js';

/**
 * Create basic POE2Scout tool handlers
 */
export function createBasicPOE2ScoutTools(client: POE2ScoutClient, logger: Logger): ToolHandler[] {
  return [
    createGetLeaguesTool(client, logger),
    createGetItemCategoriesTool(client, logger),
    createGetUniqueItemsTool(client, logger),
    createGetCurrencyItemsTool(client, logger),
    // createGetItemHistoryTool(client, logger), // REMOVED: API endpoint doesn't exist
    // createGetCurrencyByIdTool(client, logger), // REMOVED: API endpoint doesn't exist
    createGetApiStatusTool(client, logger),
    createGetItemFiltersTool(client, logger),
    createGetLandingSplashInfoTool(client, logger),
    createGetUniqueBaseItemsTool(client, logger),
    createGetUniquesByBaseNameTool(client, logger),
    createBasicSearchTool(client, logger),
    createAnalyzePriceHistoryTool(client, logger),
  ];
}

/**
 * Get all available leagues
 */
function createGetLeaguesTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_leagues',
      description: 'Get all available Path of Exile 2 leagues with their current status and metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching leagues');

      const leagues = await client.getLeagues();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(leagues, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get all item categories
 */
function createGetItemCategoriesTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_item_categories',
      description: 'Get all available item categories for filtering and organization',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching item categories');

      const categories = await client.getItemCategories();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(categories, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get unique items by category
 */
function createGetUniqueItemsTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_unique_items',
      description: 'Get unique items by category with optional filtering by league, search term, and result limit',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Item category to search within (required). Use get_item_categories to see available categories.',
          },
          league: {
            type: 'string',
            description: 'League to filter items for (optional)',
          },
          search: {
            type: 'string',
            description: 'Search term to filter items by name (optional)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (optional, max 100)',
            maximum: 100,
            minimum: 1,
          },
        },
        required: ['category'],
        additionalProperties: false,
      },
    },
    handler: async (args: any): Promise<CallToolResult> => {
      const { category, league, search, limit } = args;

      logger.debug('Fetching unique items', { category, league, search, limit });

      const response = await client.getUniqueItems(category, {
        ...(league && { league }),
        ...(search && { search }),
        ...(limit && { limit }),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.items || response, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get currency items by category
 */
function createGetCurrencyItemsTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_currency_items',
      description: 'Get currency items by category with optional filtering by league, search term, and result limit',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Currency category to search within (required). Use get_item_categories to see available categories.',
          },
          league: {
            type: 'string',
            description: 'League to filter currency for (optional)',
          },
          search: {
            type: 'string',
            description: 'Search term to filter currency by name (optional)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (optional, max 100)',
            maximum: 100,
            minimum: 1,
          },
        },
        required: ['category'],
        additionalProperties: false,
      },
    },
    handler: async (args: any): Promise<CallToolResult> => {
      const { category, league, search, limit } = args;

      logger.debug('Fetching currency items', { category, league, search, limit });

      const response = await client.getCurrencyItems(category, {
        ...(league && { league }),
        ...(search && { search }),
        ...(limit && { limit }),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.items || response, null, 2),
          },
        ],
      };
    },
  };
}

// REMOVED: getItemHistoryTool - API endpoint doesn't exist

// REMOVED: getCurrencyByIdTool - API endpoint doesn't exist

/**
 * Get API status
 */
function createGetApiStatusTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_api_status',
      description: 'Get the current status of the API client including rate limiting, configuration, and health metrics',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching API status');

      const status = client.getStatus();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get item filters
 */
function createGetItemFiltersTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_item_filters',
      description: 'Get available item filters and categories for advanced searching and filtering',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching item filters');

      const filters = await client.getItemFilters();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(filters, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get landing splash info
 */
function createGetLandingSplashInfoTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_landing_splash_info',
      description: 'Get landing page splash information and featured content',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching landing splash info');

      const info = await client.getLandingSplashInfo();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get unique base items
 */
function createGetUniqueBaseItemsTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_unique_base_items',
      description: 'Get all unique base items and their properties',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: async (): Promise<CallToolResult> => {
      logger.debug('Fetching unique base items');

      const baseItems = await client.getUniqueBaseItems();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(baseItems, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Get uniques by base name
 */
function createGetUniquesByBaseNameTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'get_uniques_by_base_name',
      description: 'Get unique items filtered by their base item name',
      inputSchema: {
        type: 'object',
        properties: {
          baseName: {
            type: 'string',
            description: 'Base name to filter unique items by (required)',
          },
        },
        required: ['baseName'],
        additionalProperties: false,
      },
    },
    handler: async (args: any): Promise<CallToolResult> => {
      const { baseName } = args;

      logger.debug('Fetching uniques by base name', { baseName });

      const uniques = await client.getUniquesByBaseName(baseName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(uniques, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Basic search tool using client-side filtering
 */
function createBasicSearchTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'basic_search',
      description: 'Basic search across currency items using client-side filtering. Searches currency category and filters by name.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to find items',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (optional, max 50)',
            maximum: 50,
            minimum: 1,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    handler: async (args: any): Promise<CallToolResult> => {
      const { query, limit = 10 } = args;

      logger.debug('Performing basic search', { query, limit });

      try {
        // Get currency items from main category
        const response = await client.getCurrencyItems('currency', { limit: 50 });
        const currencyItems = response.items || response;

        // Client-side filtering
        const filtered = (Array.isArray(currencyItems) ? currencyItems : []).filter((item: any) => 
          (item.text && item.text.toLowerCase().includes(query.toLowerCase())) ||
          (item.itemMetadata?.name && item.itemMetadata.name.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                results: filtered,
                total: filtered.length,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('Basic search failed', { error: errorMessage });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Search failed',
                message: errorMessage,
              }, null, 2),
            },
          ],
        };
      }
    },
  };
}

/**
 * Analyze price history and generate comprehensive market insights
 */
function createAnalyzePriceHistoryTool(client: POE2ScoutClient, logger: Logger): ToolHandler {
  return {
    definition: {
      name: 'analyze_price_history',
      description: 'Analyze price history and generate comprehensive market insights including trend analysis, volatility assessment, and trading recommendations',
      inputSchema: {
        type: 'object',
        properties: {
          itemName: {
            type: 'string',
            description: 'Name of the item to analyze (e.g., "Divine Orb", "Chaos Orb")',
          },
          league: {
            type: 'string',
            description: 'League to analyze (optional, defaults to "Dawn of the Hunt")',
          },
          analysisType: {
            type: 'string',
            description: 'Type of analysis to perform',
            enum: ['trend', 'volatility', 'trading_signals', 'comprehensive'],
          },
          category: {
            type: 'string',
            description: 'Item category for search (optional, defaults to "currency")',
          },
        },
        required: ['itemName'],
        additionalProperties: false,
      },
    },
    handler: async (args: any): Promise<CallToolResult> => {
      const { 
        itemName, 
        league = 'Dawn of the Hunt', 
        analysisType = 'comprehensive',
        category = 'currency' 
      } = args;

      logger.debug('Analyzing price history', { itemName, league, analysisType, category });

      try {
        // First, search for the item to get price data
        let itemData;
        let searchResults;

        // Try currency search first
        try {
          searchResults = await client.getCurrencyItems(category, {
            search: itemName,
            league,
            limit: 1,
          });
          itemData = searchResults.items?.[0];
        } catch (error) {
          logger.debug('Currency search failed, trying basic search', { error });
        }

        // If not found in currency, try basic search
        if (!itemData) {
          try {
            const basicSearch = await client.getAllItems({
              search: itemName,
              league,
              limit: 1,
            });
            // Check both currency and unique items
            itemData = basicSearch.currencyItems?.[0] || basicSearch.uniqueItems?.[0];
          } catch (error) {
            logger.debug('Basic search failed', { error });
          }
        }

        if (!itemData) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Item not found',
                  message: `Could not find item "${itemName}" in league "${league}"`,
                  suggestion: 'Try a different item name or check spelling',
                }, null, 2),
              },
            ],
          };
        }

        // Extract price data - handle different item types
        const currentPrice = (itemData as any).currentPrice || 0;
        const priceLogs = (itemData as any).priceLogs || [];
        const itemText = (itemData as any).text || (itemData as any).name || itemName;

        // Fetch real-time currency rates for context
        let realTimeRates: { chaosRate?: number; divineRate?: number } = {};
        try {
          // Get current Chaos Orb price (if not analyzing Chaos itself)
          if (itemText.toLowerCase() !== 'chaos orb') {
            const chaosSearch = await client.getCurrencyItems('currency', {
              search: 'Chaos Orb',
              league,
              limit: 1,
            });
            const chaosData = chaosSearch.items?.[0];
            if (chaosData && (chaosData as any).currentPrice) {
              realTimeRates.chaosRate = (chaosData as any).currentPrice;
            }
          }

          // Get current Divine Orb price (if not analyzing Divine itself)
          if (itemText.toLowerCase() !== 'divine orb') {
            const divineSearch = await client.getCurrencyItems('currency', {
              search: 'Divine Orb',
              league,
              limit: 1,
            });
            const divineData = divineSearch.items?.[0];
            if (divineData && (divineData as any).currentPrice) {
              realTimeRates.divineRate = (divineData as any).currentPrice;
            }
          }
        } catch (error) {
          logger.debug('Failed to fetch currency rates', { error });
        }

        // Perform analysis with real-time rates
        const analysis = analyzePriceHistory(
          itemText,
          currentPrice,
          priceLogs,
          analysisType as any,
          realTimeRates
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Price analysis failed', { error: errorMessage, itemName });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Analysis failed',
                message: errorMessage,
                item: itemName,
              }, null, 2),
            },
          ],
        };
      }
    },
  };
}