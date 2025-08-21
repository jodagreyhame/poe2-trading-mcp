/**
 * TypeScript interfaces for POE2Scout API
 * Based on the OpenAPI specification at https://poe2scout.com/api/openapi.json
 */

export interface League {
  id: string;
  realm: string;
  description: string;
  category: {
    id: string;
    current: boolean;
  };
  rules: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  registerAt: string;
  event: boolean;
  url: string;
  startAt: string;
  endAt?: string;
  timedEvent: boolean;
  scoreEvent: boolean;
  delveEvent: boolean;
  ancestorEvent: boolean;
  leagueEvent: boolean;
  pvp: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface ItemCategory {
  id: number;
  apiId: string;
  label: string;
  icon: string;
}

export interface CategoriesResponse {
  unique_categories: ItemCategory[];
  currency_categories: ItemCategory[];
}

export interface PriceLog {
  timestamp: string;
  value: number;
  count: number;
  lowValue?: number;
  highValue?: number;
  totalListings: number;
}

export interface UniqueItem {
  id: string;
  name: string;
  category: string;
  baseType: string;
  levelReq?: number;
  league: string;
  icon: string;
  flavourText?: string;
  corruptedOnly: boolean;
  variant?: string;
  priceLog: PriceLog[];
  lowConfidenceValue?: number;
  chaosValue?: number;
  divineValue?: number;
  detailsId?: string;
  itemClass?: number;
  sparkline?: {
    data: number[];
    totalChange: number;
  };
  implicitModifiers?: Array<{
    text: string;
    optional: boolean;
  }>;
  explicitModifiers?: Array<{
    text: string;
    optional: boolean;
  }>;
  gemLevel?: number;
  gemQuality?: number;
  itemType?: string;
  links?: number;
  mapTier?: number;
  count?: number;
}

export interface CurrencyItem {
  id: string;
  currencyTypeName: string;
  chaosEquivalent: number;
  receive: {
    id: number;
    league_id: number;
    pay_currency_id: number;
    get_currency_id: number;
    sample_time_utc: string;
    count: number;
    value: number;
    data_point_count: number;
    includes_secondary: boolean;
    listing_count: number;
  };
  pay: {
    id: number;
    league_id: number;
    pay_currency_id: number;
    get_currency_id: number;
    sample_time_utc: string;
    count: number;
    value: number;
    data_point_count: number;
    includes_secondary: boolean;
    listing_count: number;
  };
  paySparkLine: {
    data: number[];
    totalChange: number;
  };
  receiveSparkLine: {
    data: number[];
    totalChange: number;
  };
  lowConfidencePayCurrency?: number;
  lowConfidenceReceiveCurrency?: number;
  detailsId?: string;
}

export interface ItemFilters {
  uniqueItems: string[];
  currencies: string[];
}

export interface LandingSplashInfo {
  uniqueItems: UniqueItem[];
  currencies: CurrencyItem[];
}

export interface UniqueBaseItem {
  name: string;
  category: string;
  variants: Array<{
    name: string;
    category: string;
  }>;
}

export interface APIResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface RequestConfig {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  userAgent?: string;
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }>;
}

export interface RetryConfig {
  retries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
  retryCondition: (error: any) => boolean;
}

export interface APIError extends Error {
  status?: number;
  response?: any;
  config?: any;
  isRetryable?: boolean;
}

// Arbitrage Detection Types (Issue #9)
export interface ArbitrageOpportunity {
  id: string;
  itemName: string;
  itemId?: string;
  sourceLeague: string;
  targetLeague: string;
  sourcePriceData: {
    chaosValue: number;
    divineValue?: number;
    confidence: number;
    timestamp: string;
    listingCount: number;
    totalListings: number;
  };
  targetPriceData: {
    chaosValue: number;
    divineValue?: number;
    confidence: number;
    timestamp: string;
    listingCount: number;
    totalListings: number;
  };
  profitCalculation: {
    rawProfitChaos: number;
    rawProfitDivine?: number;
    netProfitChaos: number;
    netProfitDivine?: number;
    profitMarginPercent: number;
    breakEvenQuantity: number;
  };
  transactionCosts: {
    transferCostChaos: number;
    tradingFeeChaos: number;
    timeCostChaos: number;
    totalCostChaos: number;
  };
  riskAssessment: {
    liquidityRisk: number; // 0-10 scale
    volatilityRisk: number; // 0-10 scale
    confidenceRisk: number; // 0-10 scale
    timeRisk: number; // 0-10 scale
    overallRiskScore: number; // 0-10 scale
    riskCategory: 'Low' | 'Medium' | 'High' | 'Extreme';
  };
  opportunityScore: number; // 0-100 scale
  detectedAt: string;
  validUntil: string;
  metadata: {
    category?: string;
    itemClass?: number;
    levelReq?: number;
    baseType?: string;
    variant?: string;
  };
}

export interface ArbitrageFilter {
  leagues?: string[];
  excludeLeagues?: string[];
  minProfitChaos?: number;
  minProfitPercent?: number;
  maxRiskScore?: number;
  categories?: string[];
  itemTypes?: string[];
  minConfidence?: number;
  minOpportunityScore?: number;
  maxTimeRisk?: number;
  requireHighLiquidity?: boolean;
}

export interface ArbitrageDetectionConfig {
  enabledLeaguePairs?: Array<{
    source: string;
    target: string;
    transferCostChaos: number;
    transferTimeMinutes: number;
  }>;
  defaultTransactionCosts: {
    tradingFeePercent: number;
    baseTransferCostChaos: number;
    timeCostPerMinuteChaos: number;
  };
  riskWeighting: {
    liquidityWeight: number;
    volatilityWeight: number;
    confidenceWeight: number;
    timeWeight: number;
  };
  thresholds: {
    minProfitChaos: number;
    minProfitPercent: number;
    maxRiskScore: number;
    minConfidenceScore: number;
    maxTimeWindowHours: number;
  };
  updateIntervalSeconds: number;
  maxOpportunitiesToTrack: number;
}

export interface CrossLeaguePriceData {
  itemName: string;
  itemId?: string;
  leaguePrices: Record<string, {
    chaosValue: number;
    divineValue?: number;
    confidence: number;
    timestamp: string;
    listingCount: number;
    totalListings: number;
    priceHistory?: PriceLog[];
    volatilityScore?: number;
  }>;
  averagePrice: number;
  priceSpread: number;
  highestPriceLeague: string;
  lowestPriceLeague: string;
  lastUpdated: string;
}

export interface MarketLiquidity {
  league: string;
  itemName: string;
  listingCount: number;
  totalListings: number;
  averageVolume24h: number;
  liquidityScore: number; // 0-10 scale
  timeToSell: number; // estimated minutes
  priceImpact: number; // expected price impact for average trade size
}

export interface VolatilityMetrics {
  league: string;
  itemName: string;
  volatilityScore: number; // 0-10 scale
  standardDeviation: number;
  priceChangePercent1h: number;
  priceChangePercent4h: number;
  priceChangePercent24h: number;
  priceStability: 'Stable' | 'Moderate' | 'Volatile' | 'Extreme';
}
