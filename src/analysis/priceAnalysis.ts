/**
 * Price Analysis Module
 * 
 * Provides comprehensive price trend analysis, volatility calculation,
 * and trading signal generation for POE2 items.
 */

export interface PriceLog {
  price: number;
  time: string;
  quantity: number;
}

export interface PriceAnalysisResult {
  item: string;
  currentPrice: number;
  priceAnalysis: {
    trend: 'rising' | 'falling' | 'stable';
    trendDirection: 'up' | 'down' | 'flat';
    trendStrength: 'weak' | 'moderate' | 'strong';
    volatility: 'low' | 'medium' | 'high';
    confidence: 'low' | 'medium' | 'high';
    volumeAnalysis: 'low' | 'normal' | 'high';
    priceRange: {
      min: number;
      max: number;
      avg: number;
    };
    recommendation: 'buy' | 'sell' | 'hold' | 'fair_value';
    riskLevel: 'low' | 'medium' | 'high';
  };
  tradingSignals: {
    buySignal: 'strong' | 'weak' | 'neutral';
    sellSignal: 'strong' | 'weak' | 'neutral';
    holdRecommendation: 'yes' | 'no';
  };
  marketContext: {
    recentVolumeSpike: boolean;
    priceStability: number; // 0-1 score
    outlierDetected: boolean;
    outlierPrice?: number;
    dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
  };
  insights: string[];
}

/**
 * Analyzes price history data and generates comprehensive market insights
 */
export function analyzePriceHistory(
  itemName: string,
  currentPrice: number,
  priceLogs: (PriceLog | null)[],
  _analysisType: 'trend' | 'volatility' | 'trading_signals' | 'comprehensive' = 'comprehensive'
): PriceAnalysisResult {
  // Filter out null entries and sort by time (newest first)
  const validLogs = priceLogs
    .filter((log): log is PriceLog => log !== null)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (validLogs.length === 0) {
    return createEmptyAnalysis(itemName, currentPrice);
  }

  // Extract price and volume data
  const prices = validLogs.map(log => log.price);
  const volumes = validLogs.map(log => log.quantity);

  // Calculate basic statistics
  const priceStats = calculatePriceStatistics(prices);
  const volatility = calculateVolatility(prices);
  const trend = calculateTrend(prices);
  const volumeAnalysis = analyzeVolume(volumes);
  const outlierInfo = detectOutliers(prices, volumes);

  // Generate trading signals
  const signals = generateTradingSignals(currentPrice, prices, trend, volatility);
  
  // Calculate confidence based on data quality
  const confidence = calculateConfidence(validLogs.length, volatility, volumeAnalysis);
  
  // Generate insights
  const insights = generateInsights(itemName, currentPrice, priceStats, trend, volatility, outlierInfo);

  return {
    item: itemName,
    currentPrice,
    priceAnalysis: {
      trend: trend.direction,
      trendDirection: trend.direction === 'stable' ? 'flat' : (trend.direction === 'rising' ? 'up' : 'down'),
      trendStrength: trend.strength,
      volatility: volatility.level,
      confidence,
      volumeAnalysis: volumeAnalysis.level,
      priceRange: priceStats,
      recommendation: generateRecommendation(currentPrice, priceStats, trend),
      riskLevel: calculateRiskLevel(volatility, trend),
    },
    tradingSignals: signals,
    marketContext: {
      recentVolumeSpike: volumeAnalysis.spike,
      priceStability: 1 - volatility.score,
      outlierDetected: outlierInfo.detected,
      ...(outlierInfo.detected && outlierInfo.price !== undefined && { outlierPrice: outlierInfo.price }),
      dataQuality: assessDataQuality(validLogs.length, volumeAnalysis.totalVolume),
    },
    insights,
  };
}

function createEmptyAnalysis(itemName: string, currentPrice: number): PriceAnalysisResult {
  return {
    item: itemName,
    currentPrice,
    priceAnalysis: {
      trend: 'stable',
      trendDirection: 'flat',
      trendStrength: 'weak',
      volatility: 'low',
      confidence: 'low',
      volumeAnalysis: 'low',
      priceRange: { min: currentPrice, max: currentPrice, avg: currentPrice },
      recommendation: 'hold',
      riskLevel: 'high',
    },
    tradingSignals: {
      buySignal: 'neutral',
      sellSignal: 'neutral',
      holdRecommendation: 'yes',
    },
    marketContext: {
      recentVolumeSpike: false,
      priceStability: 0,
      outlierDetected: false,
      dataQuality: 'poor',
    },
    insights: ['Insufficient price history data for reliable analysis'],
  };
}

function calculatePriceStatistics(prices: number[]): { min: number; max: number; avg: number } {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  
  return { min, max, avg };
}

function calculateVolatility(prices: number[]): { level: 'low' | 'medium' | 'high'; score: number } {
  if (prices.length < 2) {
    return { level: 'low', score: 0 };
  }

  // Calculate coefficient of variation (std dev / mean)
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  // Classify volatility
  let level: 'low' | 'medium' | 'high';
  if (coefficientOfVariation < 0.1) {
    level = 'low';
  } else if (coefficientOfVariation < 0.3) {
    level = 'medium';
  } else {
    level = 'high';
  }

  return { level, score: Math.min(coefficientOfVariation, 1) };
}

function calculateTrend(prices: number[]): { 
  direction: 'rising' | 'falling' | 'stable'; 
  strength: 'weak' | 'moderate' | 'strong' 
} {
  if (prices.length < 3) {
    return { direction: 'stable', strength: 'weak' };
  }

  // Simple linear trend calculation
  const recentPrices = prices.slice(0, Math.min(5, prices.length));
  const oldest = recentPrices[recentPrices.length - 1];
  const newest = recentPrices[0];
  
  if (!oldest || !newest) {
    return { direction: 'stable', strength: 'weak' };
  }
  
  const percentChange = ((newest - oldest) / oldest) * 100;

  let direction: 'rising' | 'falling' | 'stable';
  let strength: 'weak' | 'moderate' | 'strong';

  if (Math.abs(percentChange) < 5) {
    direction = 'stable';
  } else if (percentChange > 0) {
    direction = 'rising';
  } else {
    direction = 'falling';
  }

  const absChange = Math.abs(percentChange);
  if (absChange < 10) {
    strength = 'weak';
  } else if (absChange < 25) {
    strength = 'moderate';
  } else {
    strength = 'strong';
  }

  return { direction, strength };
}

function analyzeVolume(volumes: number[]): { 
  level: 'low' | 'normal' | 'high'; 
  spike: boolean;
  totalVolume: number;
} {
  if (volumes.length === 0) {
    return { level: 'low', spike: false, totalVolume: 0 };
  }

  const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
  const avgVolume = totalVolume / volumes.length;
  const recentVolume = volumes[0] || 0;

  // Check for volume spike (recent volume > 3x average)
  const spike = recentVolume > avgVolume * 3;

  // Classify volume level
  let level: 'low' | 'normal' | 'high';
  if (avgVolume < 100) {
    level = 'low';
  } else if (avgVolume < 1000) {
    level = 'normal';
  } else {
    level = 'high';
  }

  return { level, spike, totalVolume };
}

function detectOutliers(prices: number[], volumes: number[]): { 
  detected: boolean; 
  price?: number 
} {
  if (prices.length < 3) {
    return { detected: false };
  }

  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  
  // Find prices that are more than 50% away from mean with low volume
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    const volume = volumes[i] || 0;
    
    if (price !== undefined) {
      const deviation = Math.abs((price - mean) / mean);
      
      // Outlier: large price deviation + low volume (< 10 trades)
      if (deviation > 0.5 && volume < 10) {
        return { detected: true, price };
      }
    }
  }

  return { detected: false };
}

function generateTradingSignals(
  currentPrice: number,
  prices: number[],
  trend: { direction: 'rising' | 'falling' | 'stable'; strength: 'weak' | 'moderate' | 'strong' },
  volatility: { level: 'low' | 'medium' | 'high'; score: number }
): {
  buySignal: 'strong' | 'weak' | 'neutral';
  sellSignal: 'strong' | 'weak' | 'neutral';
  holdRecommendation: 'yes' | 'no';
} {
  const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const priceVsAverage = (currentPrice - avgPrice) / avgPrice;

  let buySignal: 'strong' | 'weak' | 'neutral' = 'neutral';
  let sellSignal: 'strong' | 'weak' | 'neutral' = 'neutral';

  // Buy signals
  if (priceVsAverage < -0.15 && trend.direction === 'rising') {
    buySignal = 'strong'; // Price below average + rising trend
  } else if (priceVsAverage < -0.1 || (trend.direction === 'rising' && trend.strength === 'strong')) {
    buySignal = 'weak';
  }

  // Sell signals  
  if (priceVsAverage > 0.15 && trend.direction === 'falling') {
    sellSignal = 'strong'; // Price above average + falling trend
  } else if (priceVsAverage > 0.1 || (trend.direction === 'falling' && trend.strength === 'strong')) {
    sellSignal = 'weak';
  }

  // Hold recommendation
  const holdRecommendation = (
    volatility.level === 'high' || 
    trend.direction === 'stable' ||
    (buySignal === 'neutral' && sellSignal === 'neutral')
  ) ? 'yes' : 'no';

  return { buySignal, sellSignal, holdRecommendation };
}

function calculateConfidence(
  dataPoints: number,
  volatility: { level: 'low' | 'medium' | 'high' },
  volumeAnalysis: { level: 'low' | 'normal' | 'high' }
): 'low' | 'medium' | 'high' {
  let score = 0;

  // Data quantity score
  if (dataPoints >= 5) score += 3;
  else if (dataPoints >= 3) score += 2;
  else score += 1;

  // Volatility score (lower volatility = higher confidence)
  if (volatility.level === 'low') score += 3;
  else if (volatility.level === 'medium') score += 2;
  else score += 1;

  // Volume score
  if (volumeAnalysis.level === 'high') score += 3;
  else if (volumeAnalysis.level === 'normal') score += 2;
  else score += 1;

  // Convert to confidence level
  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

function generateRecommendation(
  currentPrice: number,
  priceStats: { min: number; max: number; avg: number },
  trend: { direction: 'rising' | 'falling' | 'stable' }
): 'buy' | 'sell' | 'hold' | 'fair_value' {
  const priceVsAverage = (currentPrice - priceStats.avg) / priceStats.avg;

  if (Math.abs(priceVsAverage) < 0.05) {
    return 'fair_value';
  } else if (priceVsAverage < -0.1 && trend.direction !== 'falling') {
    return 'buy';
  } else if (priceVsAverage > 0.1 && trend.direction !== 'rising') {
    return 'sell';
  } else {
    return 'hold';
  }
}

function calculateRiskLevel(
  volatility: { level: 'low' | 'medium' | 'high' },
  trend: { strength: 'weak' | 'moderate' | 'strong' }
): 'low' | 'medium' | 'high' {
  if (volatility.level === 'high' || trend.strength === 'strong') {
    return 'high';
  } else if (volatility.level === 'medium' || trend.strength === 'moderate') {
    return 'medium';
  } else {
    return 'low';
  }
}

function assessDataQuality(dataPoints: number, totalVolume: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (dataPoints >= 5 && totalVolume >= 1000) return 'excellent';
  if (dataPoints >= 4 && totalVolume >= 500) return 'good';
  if (dataPoints >= 3 && totalVolume >= 100) return 'fair';
  return 'poor';
}

function generateInsights(
  _itemName: string,
  currentPrice: number,
  priceStats: { min: number; max: number; avg: number },
  trend: { direction: 'rising' | 'falling' | 'stable'; strength: 'weak' | 'moderate' | 'strong' },
  volatility: { level: 'low' | 'medium' | 'high'; score: number },
  outlierInfo: { detected: boolean; price?: number }
): string[] {
  const insights: string[] = [];

  // Price position insight
  const priceVsAverage = ((currentPrice - priceStats.avg) / priceStats.avg) * 100;
  if (Math.abs(priceVsAverage) > 10) {
    const direction = priceVsAverage > 0 ? 'above' : 'below';
    insights.push(`Current price is ${Math.abs(priceVsAverage).toFixed(1)}% ${direction} recent average`);
  } else {
    insights.push('Price is near recent average - fair market value');
  }

  // Trend insight
  if (trend.direction !== 'stable') {
    insights.push(`${trend.strength} ${trend.direction} trend detected`);
  }

  // Volatility insight
  if (volatility.level === 'high') {
    insights.push('High price volatility - expect significant price swings');
  } else if (volatility.level === 'low') {
    insights.push('Low volatility - price is stable and predictable');
  }

  // Outlier insight
  if (outlierInfo.detected && outlierInfo.price) {
    insights.push(`Outlier price detected: ${outlierInfo.price} chaos (likely data anomaly)`);
  }

  return insights;
}