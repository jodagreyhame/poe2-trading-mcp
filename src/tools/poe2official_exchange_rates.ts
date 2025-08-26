/**
 * POE2Official Exchange Rates Tool
 * 
 * MCP tool for retrieving current currency exchange rates from the official POE2 trade API.
 * Implements 15-minute caching and enhanced rate limiting (45 req/min).
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolHandler } from '../server/toolRegistry.js';
import { Logger } from '../utils/logger.js';
import { POE2OfficialClient } from '../api/poe2OfficialClient.js';
import { TradeCache } from '../utils/trade-cache.js';

/**
 * Exchange rates interfaces
 */
export interface ExchangeRatesParams {
  league: string;
  baseCurrency?: string;
  currencies?: string[];
}

export interface ExchangeRatesResponse {
  baseCurrency: string;
  league: string;
  timestamp: number;
  rates: Record<string, number>;
  confidence: Record<string, number>;
  cached: boolean;
}

/**
 * Enhanced rate limiter for exchange rates (45 req/min)
 */
class ExchangeRateLimiter {
  private requests: number[] = [];
  private readonly limit = 45;
  private readonly windowMs = 60000; // 1 minute

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      if (oldestRequest !== undefined) {
        const waitTime = (oldestRequest + this.windowMs) - now;
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.acquire();
        }
      }
    }
    
    this.requests.push(now);
  }
}

// Initialize specialized cache for exchange rates (15-minute TTL)
const exchangeCache = new TradeCache({
  searchTTL: 900000,    // 15 minutes for exchange rates
  fetchTTL: 900000,     // Same TTL for all exchange operations
  maxSize: 50,          // Smaller cache for rates
  cleanupInterval: 300000 // Cleanup every 5 minutes
});

/**
 * Create POE2Official exchange rates tool
 */
export function createPOE2OfficialExchangeRatesTool(logger: Logger): ToolHandler {
  const rateLimiter = new ExchangeRateLimiter();
  const client = new POE2OfficialClient({
    contactEmail: process.env['POE2SCOUT_CONTACT_EMAIL'] || 'mcp-server@example.com',
    userAgent: 'poe2-mcp-server/1.0.0',
    logger
  });

  return {
    definition: {
      name: 'poe2official_exchange_rates',
      description: 'Get current currency exchange rates from the official POE2 trade API with 15-minute caching',
      inputSchema: {
        type: 'object',
        properties: {
          league: {
            type: 'string',
            description: 'League name (e.g., "Standard", "Hardcore")',
          },
          baseCurrency: {
            type: 'string',
            description: 'Base currency for rate calculations (default: "chaos")',
            default: 'chaos',
          },
          currencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific currencies to get rates for (default: common currencies)',
          },
        },
        required: ['league'],
        additionalProperties: false,
      },
    },
    handler: async (args: ExchangeRatesParams): Promise<CallToolResult> => {
      const { 
        league, 
        baseCurrency = 'chaos', 
        currencies = ['divine', 'exalted', 'chaos', 'ancient', 'mirror'] 
      } = args;

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

      logger.debug('POE2Official exchange rates request', { league, baseCurrency, currencies });

      try {
        // Rate limiting
        await rateLimiter.acquire();

        // Check cache first
        const cacheKey = exchangeCache.generateKey('search', { 
          league, 
          baseCurrency, 
          currencies: currencies.sort() 
        });
        const cached = exchangeCache.get<ExchangeRatesResponse>(cacheKey);
        
        if (cached) {
          logger.debug('Returning cached exchange rates', { cacheKey });
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

        // Fetch exchange data for each currency pair
        const rates: Record<string, number> = {};
        const confidence: Record<string, number> = {};
        
        // Always include base currency with rate 1.0
        rates[baseCurrency] = 1.0;
        confidence[baseCurrency] = 1.0;

        for (const currency of currencies) {
          if (currency === baseCurrency) continue;

          try {
            // Search for exchange listings
            const searchResult = await client.searchTrade(league, {
              exchange: {
                want: [currency],
                have: [baseCurrency],
                minimum: 1
              }
            });

            if (searchResult.result && searchResult.result.length > 0) {
              // Calculate rate based on recent listings
              const rate = await calculateExchangeRate(
                client, 
                searchResult.id, 
                searchResult.result.slice(0, 5), // Top 5 listings
                currency,
                baseCurrency,
                logger
              );
              
              if (rate && rate.value > 0) {
                rates[currency] = rate.value;
                confidence[currency] = rate.confidence;
              }
            }
          } catch (error) {
            logger.warn(`Failed to get rate for ${currency}`, { error });
            // Continue with other currencies
          }
        }

        // Create response
        const response: ExchangeRatesResponse = {
          baseCurrency,
          league,
          timestamp: Date.now(),
          rates,
          confidence,
          cached: false,
        };

        // Cache the result
        exchangeCache.set(cacheKey, response, 900000); // 15 minutes

        logger.info('Exchange rates retrieved', {
          league,
          baseCurrency,
          currencyCount: Object.keys(rates).length,
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
        logger.error('Exchange rates request failed', { error: errorMessage, league });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Exchange rates request failed',
                message: errorMessage,
                league,
                baseCurrency,
              }, null, 2),
            },
          ],
        };
      }
    },
  };
}

/**
 * Calculate exchange rate from trade listings
 */
async function calculateExchangeRate(
  client: POE2OfficialClient,
  searchId: string,
  itemIds: string[],
  wantCurrency: string,
  haveCurrency: string,
  logger: Logger
): Promise<{ value: number; confidence: number } | null> {
  try {
    // Fetch detailed listings
    const listings = await client.fetchTradeItems(itemIds, searchId, true);
    
    if (!listings.result || listings.result.length === 0) {
      return null;
    }

    const rates: number[] = [];
    
    // Extract rates from listings
    for (const listing of listings.result) {
      const price = listing.listing?.price;
      if (price && price.type === 'bulk' && price.currency === haveCurrency) {
        const rate = price.amount;
        if (rate > 0 && rate < 1000000) { // Sanity check
          rates.push(rate);
        }
      }
    }

    if (rates.length === 0) {
      return null;
    }

    // Calculate median rate for stability
    rates.sort((a, b) => a - b);
    const medianIndex = Math.floor(rates.length / 2);
    const median = rates[medianIndex];
    
    if (median === undefined) {
      return null;
    }
    
    // Calculate confidence based on data quality
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - median, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / median;
    
    // Confidence: higher with more data and lower variance
    const confidence = Math.max(0.1, Math.min(1.0, 
      (rates.length / 10) * (1 - Math.min(coefficient, 1))
    ));

    return {
      value: median,
      confidence
    };
  } catch (error) {
    logger.warn('Exchange rate calculation failed', { error, wantCurrency, haveCurrency });
    return null;
  }
}