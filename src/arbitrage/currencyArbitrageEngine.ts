/**
 * Currency Arbitrage Detection Engine
 *
 * Detects profitable currency exchange opportunities within POE2 leagues
 * by analyzing exchange rate triangles and currency conversion chains.
 * 
 * Example arbitrage opportunity:
 * 1 Divine → 180 Chaos → 18 Exalts → 1.2 Divine = 0.2 Divine profit
 */

import { POE2ScoutClient } from '../api/client.js';
import { Logger } from '../utils/logger.js';
import { CacheManager } from '../cache/cache_manager.js';

export interface CurrencyArbitrageOpportunity {
  id: string;
  league: string;
  exchangePath: CurrencyExchangeStep[];
  initialAmount: number;
  finalAmount: number;
  profitAmount: number;
  profitPercentage: number;
  riskScore: number;
  confidence: number;
  detectedAt: string;
  validUntil: string;
}

export interface CurrencyExchangeStep {
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  amount: number;
  confidence: number;
  liquidity: number;
}

export interface ItemFlipOpportunity {
  id: string;
  league: string;
  itemName: string;
  buyPrice: number;
  estimatedSellPrice: number;
  profitAmount: number;
  profitPercentage: number;
  riskScore: number;
  confidence: number;
  timeToSell: number; // estimated hours
  detectedAt: string;
}

export class CurrencyArbitrageEngine {
  private client: POE2ScoutClient;
  private logger: Logger;
  private cacheManager: CacheManager;

  constructor(
    client: POE2ScoutClient,
    logger: Logger,
    cacheManager: CacheManager
  ) {
    this.client = client;
    this.logger = logger;
    this.cacheManager = cacheManager;
  }

  /**
   * Detect currency arbitrage opportunities within a league
   */
  async detectCurrencyArbitrage(league: string): Promise<CurrencyArbitrageOpportunity[]> {
    try {
      this.logger.info('Detecting currency arbitrage opportunities', { league });

      // Get current currency exchange rates
      const currencyRates = await this.getCurrencyExchangeRates(league);
      
      // Find profitable exchange paths
      const opportunities = this.findArbitrageTriangles(currencyRates, league);

      this.logger.info(`Found ${opportunities.length} currency arbitrage opportunities`, { league });
      
      return opportunities;

    } catch (error) {
      this.logger.error('Error detecting currency arbitrage', { error, league });
      return [];
    }
  }

  /**
   * Detect item flipping opportunities within a league
   */
  async detectItemFlipOpportunities(league: string, categories: string[] = ['weapon', 'armour', 'accessory']): Promise<ItemFlipOpportunity[]> {
    try {
      this.logger.info('Detecting item flip opportunities', { league, categories });

      const opportunities: ItemFlipOpportunity[] = [];

      for (const category of categories) {
        const categoryOpportunities = await this.findFlipOpportunitiesInCategory(league, category);
        opportunities.push(...categoryOpportunities);
      }

      // Sort by profit percentage
      opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);

      this.logger.info(`Found ${opportunities.length} item flip opportunities`, { league });
      
      return opportunities;

    } catch (error) {
      this.logger.error('Error detecting item flip opportunities', { error, league });
      return [];
    }
  }

  /**
   * Get current currency exchange rates for a league
   */
  private async getCurrencyExchangeRates(league: string): Promise<Map<string, Map<string, number>>> {
    const cacheKey = `currency_rates:${league}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached && cached.value && Array.isArray(cached.value)) {
      return new Map(cached.value.map(([key, value]: [string, any]) => [key, new Map(value)]));
    }

    const rates = new Map<string, Map<string, number>>();

    try {
      const currencyResponse = await this.client.getCurrencyItems('currency', { league });
      const currencies = currencyResponse.items || currencyResponse;

      if (!Array.isArray(currencies)) {
        return rates;
      }

      for (const currency of currencies) {
        // Handle different possible currency structures
        const currencyName = (currency as any).currencyTypeName || 
                           (currency as any).text || 
                           `Currency-${(currency as any).id}`;
        const chaosRate = (currency as any).chaosEquivalent || 0;
        const divineRate = (currency as any).receive?.value || 0;

        if (chaosRate > 0) {
          // Set up bidirectional rates
          if (!rates.has(currencyName)) {
            rates.set(currencyName, new Map());
          }
          if (!rates.has('Chaos Orb')) {
            rates.set('Chaos Orb', new Map());
          }

          rates.get(currencyName)!.set('Chaos Orb', chaosRate);
          rates.get('Chaos Orb')!.set(currencyName, 1 / chaosRate);
        }

        if (divineRate > 0) {
          if (!rates.has('Divine Orb')) {
            rates.set('Divine Orb', new Map());
          }

          rates.get(currencyName)!.set('Divine Orb', 1 / divineRate);
          rates.get('Divine Orb')!.set(currencyName, divineRate);
        }
      }

      // Cache for 2 minutes - convert Maps to arrays for serialization
      const serializableRates = Array.from(rates.entries()).map(([key, value]) => [
        key, 
        Array.from(value.entries())
      ]);
      await this.cacheManager.set(cacheKey, serializableRates, 120);

    } catch (error) {
      this.logger.error('Error getting currency exchange rates', { error, league });
    }

    return rates;
  }

  /**
   * Find profitable arbitrage triangles in currency exchange rates
   */
  private findArbitrageTriangles(
    rates: Map<string, Map<string, number>>, 
    league: string
  ): CurrencyArbitrageOpportunity[] {
    const opportunities: CurrencyArbitrageOpportunity[] = [];
    const currencies = Array.from(rates.keys());

    // Check all possible triangular arbitrage opportunities
    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        for (let k = 0; k < currencies.length; k++) {
          if (i !== j && j !== k && i !== k) {
            const currencyA = currencies[i]!;
            const currencyB = currencies[j]!;
            const currencyC = currencies[k]!;

            const opportunity = this.calculateTriangleArbitrage(
              rates, 
              currencyA, 
              currencyB, 
              currencyC, 
              league
            );

            if (opportunity && opportunity.profitPercentage > 1) { // Minimum 1% profit
              opportunities.push(opportunity);
            }
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);
  }

  /**
   * Calculate triangular arbitrage profit for three currencies
   */
  private calculateTriangleArbitrage(
    rates: Map<string, Map<string, number>>,
    currencyA: string,
    currencyB: string,
    currencyC: string,
    league: string
  ): CurrencyArbitrageOpportunity | null {
    const rateAB = rates.get(currencyA)?.get(currencyB);
    const rateBC = rates.get(currencyB)?.get(currencyC);
    const rateCA = rates.get(currencyC)?.get(currencyA);

    if (!rateAB || !rateBC || !rateCA) {
      return null;
    }

    const initialAmount = 1; // Start with 1 unit of currencyA
    const step1Amount = initialAmount * rateAB;
    const step2Amount = step1Amount * rateBC;
    const finalAmount = step2Amount * rateCA;

    const profitAmount = finalAmount - initialAmount;
    const profitPercentage = (profitAmount / initialAmount) * 100;

    if (profitAmount <= 0) {
      return null;
    }

    const exchangePath: CurrencyExchangeStep[] = [
      {
        fromCurrency: currencyA,
        toCurrency: currencyB,
        exchangeRate: rateAB,
        amount: step1Amount,
        confidence: 80, // Placeholder
        liquidity: 100, // Placeholder
      },
      {
        fromCurrency: currencyB,
        toCurrency: currencyC,
        exchangeRate: rateBC,
        amount: step2Amount,
        confidence: 80,
        liquidity: 100,
      },
      {
        fromCurrency: currencyC,
        toCurrency: currencyA,
        exchangeRate: rateCA,
        amount: finalAmount,
        confidence: 80,
        liquidity: 100,
      },
    ];

    return {
      id: `${currencyA}-${currencyB}-${currencyC}-${Date.now()}`,
      league,
      exchangePath,
      initialAmount,
      finalAmount,
      profitAmount,
      profitPercentage,
      riskScore: this.calculateRiskScore(exchangePath),
      confidence: 80, // Average confidence
      detectedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // Valid for 10 minutes
    };
  }

  /**
   * Find item flipping opportunities in a category
   */
  private async findFlipOpportunitiesInCategory(
    league: string, 
    category: string
  ): Promise<ItemFlipOpportunity[]> {
    const opportunities: ItemFlipOpportunity[] = [];

    try {
      const itemsResponse = await this.client.getUniqueItems(category, { league, limit: 100 });
      const items = itemsResponse.items || itemsResponse;

      if (!Array.isArray(items)) {
        return opportunities;
      }

      for (const item of items) {
        if (!item.chaosValue || item.chaosValue <= 0) continue;

        const opportunity = await this.analyzeItemFlipOpportunity(item, league);
        if (opportunity && opportunity.profitPercentage > 5) { // Minimum 5% profit
          opportunities.push(opportunity);
        }
      }

    } catch (error) {
      this.logger.error('Error finding flip opportunities in category', { error, category, league });
    }

    return opportunities;
  }

  /**
   * Analyze individual item for flip opportunity
   */
  private async analyzeItemFlipOpportunity(item: any, league: string): Promise<ItemFlipOpportunity | null> {
    try {
      const currentPrice = item.chaosValue;
      
      // Get price history to estimate typical selling price
      const priceHistory = item.priceLog || [];
      
      if (priceHistory.length < 7) {
        return null; // Need at least a week of data
      }

      // Calculate average price over last 7 days
      const recentPrices = priceHistory.slice(-7).map((log: any) => log.value);
      const averagePrice = recentPrices.reduce((sum: number, price: number) => sum + price, 0) / recentPrices.length;
      
      // Look for items significantly below average price
      const priceDifference = averagePrice - currentPrice;
      const profitPercentage = (priceDifference / currentPrice) * 100;

      if (profitPercentage < 5) {
        return null; // Not profitable enough
      }

      // Estimate time to sell based on listing count
      const timeToSell = this.estimateTimeToSell(item.count || 0, profitPercentage);

      return {
        id: `flip-${item.name || item.id}-${Date.now()}`,
        league,
        itemName: item.name || 'Unknown Item',
        buyPrice: currentPrice,
        estimatedSellPrice: averagePrice,
        profitAmount: priceDifference,
        profitPercentage,
        riskScore: this.calculateItemRiskScore(item, priceHistory),
        confidence: item.lowConfidenceValue ? 50 : 80,
        timeToSell,
        detectedAt: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Error analyzing item flip opportunity', { error, itemName: item.name });
      return null;
    }
  }

  /**
   * Calculate risk score for currency arbitrage
   */
  private calculateRiskScore(exchangePath: CurrencyExchangeStep[]): number {
    // Higher risk for longer paths and lower liquidity
    const pathLengthRisk = exchangePath.length * 2;
    const liquidityRisk = exchangePath.reduce((risk, step) => risk + (10 - step.liquidity / 10), 0);
    const confidenceRisk = exchangePath.reduce((risk, step) => risk + (10 - step.confidence / 10), 0);

    return Math.min(pathLengthRisk + liquidityRisk + confidenceRisk, 10);
  }

  /**
   * Calculate risk score for item flipping
   */
  private calculateItemRiskScore(item: any, priceHistory: any[]): number {
    let risk = 0;

    // Volatility risk
    if (priceHistory.length >= 7) {
      const prices = priceHistory.slice(-7).map(log => log.value);
      const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
      const volatility = Math.sqrt(variance) / mean;
      risk += Math.min(volatility * 20, 5); // Scale volatility to 0-5
    }

    // Liquidity risk (low count = high risk)
    const listingCount = item.count || 0;
    if (listingCount < 5) risk += 3;
    else if (listingCount < 10) risk += 2;
    else if (listingCount < 20) risk += 1;

    // Confidence risk
    if (item.lowConfidenceValue) risk += 2;

    return Math.min(risk, 10);
  }

  /**
   * Estimate time to sell based on market conditions
   */
  private estimateTimeToSell(listingCount: number, profitMargin: number): number {
    // Base time: more listings = longer to sell
    let baseTime = 24; // 24 hours base
    
    if (listingCount > 50) baseTime = 72; // 3 days
    else if (listingCount > 20) baseTime = 48; // 2 days
    else if (listingCount > 10) baseTime = 36; // 1.5 days
    
    // Adjust for profit margin: higher margin = faster sale
    const marginMultiplier = Math.max(0.5, 1 - (profitMargin / 100));
    
    return baseTime * marginMultiplier;
  }
}