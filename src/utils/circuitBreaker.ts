/**
 * Circuit Breaker Pattern Implementation
 *
 * Provides fault tolerance by tracking failures and preventing cascading failures
 * when external services or operations are failing consistently.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  timeout: number; // Timeout for individual requests (ms)
  resetTimeout: number; // Time to wait before trying half-open (ms)
  monitoringPeriod?: number; // Window for counting failures (ms)
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextAttemptTime: number | null;
  config: CircuitBreakerConfig;
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker<T = any> {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(
    private operation: (args?: any) => Promise<T>,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      failureThreshold: 5,
      timeout: 10000, // 10 seconds
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      ...config,
    };
  }

  /**
   * Execute the operation with circuit breaker protection
   */
  async execute(args?: any): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from open to half-open
    this.checkStateTransition();

    if (this.state === 'open') {
      throw new CircuitBreakerError(
        `Circuit breaker is open. Next attempt allowed at ${new Date(this.nextAttemptTime!).toISOString()}`
      );
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(args);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout protection
   */
  private async executeWithTimeout(args?: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      this.operation(args)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'half-open') {
      // Reset to closed state after successful operation in half-open
      this.reset();
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttemptTime = null;
  }

  /**
   * Check if circuit should transition states
   */
  private checkStateTransition(): void {
    if (this.state === 'open' && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
      this.state = 'half-open';
      this.nextAttemptTime = null;
    }

    // Clean up old failures if monitoring period is configured
    if (this.config.monitoringPeriod && this.lastFailureTime) {
      const cutoffTime = Date.now() - this.config.monitoringPeriod;
      if (this.lastFailureTime < cutoffTime) {
        // Reset failure count for old failures
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      config: this.config,
    };
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    isOpen: boolean;
    isHalfOpen: boolean;
    isClosed: boolean;
    canExecute: boolean;
    failureRate: number;
  } {
    const failureRate = this.totalRequests > 0 ? (this.failureCount / this.totalRequests) * 100 : 0;

    return {
      isOpen: this.state === 'open',
      isHalfOpen: this.state === 'half-open',
      isClosed: this.state === 'closed',
      canExecute:
        this.state !== 'open' ||
        (this.nextAttemptTime !== null && Date.now() >= this.nextAttemptTime),
      failureRate: Number(failureRate.toFixed(2)),
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  manualReset(): void {
    this.reset();
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  /**
   * Force open the circuit breaker
   */
  forceOpen(): void {
    this.openCircuit();
  }

  /**
   * Update circuit breaker configuration
   */
  updateConfig(updates: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
