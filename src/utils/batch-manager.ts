/**
 * Batch Manager for Concurrent Operations
 * 
 * Manages concurrent execution of batch operations with semaphore-based
 * concurrency control and result aggregation.
 */

/**
 * Batch request interface
 */
export interface BatchRequest<T> {
  id: string;
  data: T;
  priority?: number;
  timeout?: number;
}

/**
 * Batch result interface
 */
export interface BatchResult<T, R> {
  id: string;
  request: T;
  result?: R;
  error?: Error;
  duration: number;
  timestamp: number;
}

/**
 * Batch summary statistics
 */
export interface BatchSummary {
  total: number;
  successful: number;
  failed: number;
  timedOut: number;
  averageTime: number;
  totalTime: number;
  peakConcurrency: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

/**
 * Batch manager configuration
 */
export interface BatchManagerConfig {
  maxConcurrent?: number;
  defaultTimeout?: number;
  retryLimit?: number;
  retryDelay?: number;
}

/**
 * Executor function type
 */
export type ExecutorFunction<T, R> = (request: T) => Promise<R>;

/**
 * Semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  private maxPermits: number;

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const resolve = this.waiting.shift()!;
      resolve();
    }
  }

  available(): number {
    return this.permits;
  }

  getMaxPermits(): number {
    return this.maxPermits;
  }

  getCurrentUsage(): number {
    return this.maxPermits - this.permits;
  }
}

/**
 * Batch Manager implementation
 */
export class BatchManager<T, R> {
  private config: Required<BatchManagerConfig>;
  private semaphore: Semaphore;
  private activeRequests: Map<string, AbortController> = new Map();
  private stats = {
    peakConcurrency: 0,
    responseTimes: [] as number[],
  };

  constructor(config: BatchManagerConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      defaultTimeout: config.defaultTimeout ?? 30000, // 30 seconds
      retryLimit: config.retryLimit ?? 3,
      retryDelay: config.retryDelay ?? 1000, // 1 second
    };
    
    this.semaphore = new Semaphore(this.config.maxConcurrent);
  }

  /**
   * Execute batch of requests
   */
  async executeBatch(
    requests: BatchRequest<T>[],
    executor: ExecutorFunction<T, R>
  ): Promise<BatchResult<T, R>[]> {
    // Sort by priority if specified
    const sortedRequests = [...requests].sort((a, b) => 
      (a.priority ?? 999) - (b.priority ?? 999)
    );

    const results = await Promise.all(
      sortedRequests.map(request => this.executeRequest(request, executor))
    );

    return results;
  }

  /**
   * Execute single request with concurrency control
   */
  private async executeRequest(
    request: BatchRequest<T>,
    executor: ExecutorFunction<T, R>
  ): Promise<BatchResult<T, R>> {
    const startTime = Date.now();
    
    await this.semaphore.acquire();
    
    // Track peak concurrency
    const currentUsage = this.semaphore.getCurrentUsage();
    if (currentUsage > this.stats.peakConcurrency) {
      this.stats.peakConcurrency = currentUsage;
    }

    const abortController = new AbortController();
    this.activeRequests.set(request.id, abortController);

    try {
      const timeout = request.timeout ?? this.config.defaultTimeout;
      const result = await this.executeWithTimeout(
        () => executor(request.data),
        timeout,
        abortController.signal
      );

      const duration = Date.now() - startTime;
      this.stats.responseTimes.push(duration);

      return {
        id: request.id,
        request: request.data,
        result,
        duration,
        timestamp: Date.now(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.responseTimes.push(duration);

      // Retry logic
      if (this.shouldRetry(error as Error)) {
        await this.delay(this.config.retryDelay);
        return this.executeRequest(request, executor);
      }

      return {
        id: request.id,
        request: request.data,
        error: error as Error,
        duration,
        timestamp: Date.now(),
      };
    } finally {
      this.activeRequests.delete(request.id);
      this.semaphore.release();
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Request aborted'));
      });

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Should retry based on error
   */
  private shouldRetry(error: Error): boolean {
    // Don't retry timeouts or aborts
    if (error.message === 'Request timeout' || error.message === 'Request aborted') {
      return false;
    }
    
    // Retry network errors
    return error.message.includes('network') || error.message.includes('ECONNRESET');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Abort all active requests
   */
  abortAll(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
  }

  /**
   * Get batch execution summary
   */
  getSummary(results: BatchResult<T, R>[]): BatchSummary {
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    const timedOut = results.filter(r => r.error?.message === 'Request timeout').length;
    const times = results.map(r => r.duration);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    
    // Calculate percentiles
    const sortedTimes = [...this.stats.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);

    return {
      total: results.length,
      successful,
      failed,
      timedOut,
      averageTime: totalTime / results.length,
      totalTime,
      peakConcurrency: this.stats.peakConcurrency,
      p95ResponseTime: sortedTimes[p95Index] || 0,
      p99ResponseTime: sortedTimes[p99Index] || 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      peakConcurrency: 0,
      responseTimes: [],
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BatchManagerConfig>): void {
    Object.assign(this.config, config);
    if (config.maxConcurrent !== undefined) {
      this.semaphore = new Semaphore(config.maxConcurrent);
    }
  }
}

/**
 * Result aggregator utility
 */
export class ResultAggregator {
  /**
   * Merge multiple result arrays
   */
  static merge<T>(results: T[][]): T[] {
    return results.flat();
  }

  /**
   * Deduplicate results by key
   */
  static deduplicate<T>(results: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>();
    return results.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Group results by key
   */
  static groupBy<T, K>(results: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    for (const item of results) {
      const key = keyFn(item);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }
    return groups;
  }

  /**
   * Calculate statistics for numeric results
   */
  static stats(values: number[]): {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
  } {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const mean = sum / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;

    return {
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      mean,
      median: sorted[Math.floor(sorted.length / 2)] || 0,
      stdDev: Math.sqrt(variance),
    };
  }
}

/**
 * Default batch manager instance
 */
export const defaultBatchManager = new BatchManager({
  maxConcurrent: 10,
  defaultTimeout: 30000,
  retryLimit: 3,
  retryDelay: 1000,
});