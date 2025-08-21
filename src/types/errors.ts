/**
 * Error Types for MCP Server
 *
 * Defines custom error classes for different error scenarios
 * in the MCP server infrastructure.
 */

/**
 * Base error class for all MCP server errors
 */
export abstract class MCPError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Validation errors for invalid input/arguments
 */
export class ValidationError extends MCPError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends MCPError {
  readonly code = 'TOOL_EXECUTION_ERROR';
  readonly statusCode = 500;

  constructor(
    message: string,
    public readonly toolName: string,
    context?: Record<string, any>
  ) {
    super(message, { ...context, toolName });
  }
}

/**
 * Server configuration and lifecycle errors
 */
export class ServerError extends MCPError {
  readonly code = 'SERVER_ERROR';
  readonly statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends MCPError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends MCPError {
  readonly code = 'RATE_LIMIT_ERROR';
  readonly statusCode = 429;

  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, { ...context, retryAfter });
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends MCPError {
  readonly code = 'CIRCUIT_BREAKER_ERROR';
  readonly statusCode = 503;

  constructor(
    message: string,
    public readonly nextAttemptTime?: number,
    context?: Record<string, any>
  ) {
    super(message, { ...context, nextAttemptTime });
  }
}

/**
 * External API errors
 */
export class APIError extends MCPError {
  readonly code = 'API_ERROR';
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number = 500,
    public readonly response?: any,
    public readonly config?: any,
    public readonly isRetryable: boolean = false,
    context?: Record<string, any>
  ) {
    super(message, { ...context, response, config, isRetryable });
    this.statusCode = statusCode;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends MCPError {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = 408;

  constructor(
    message: string,
    public readonly timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(message, { ...context, timeoutMs });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends MCPError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  /**
   * Create error from axios error
   */
  static fromAxiosError(error: any): APIError {
    const message = error.message || 'API request failed';
    const statusCode = error.response?.status || 500;
    const response = error.response?.data;
    const config = error.config;
    const isRetryable = this.isRetryableStatus(statusCode);

    return new APIError(message, statusCode, response, config, isRetryable);
  }

  /**
   * Create error from unknown error
   */
  static fromUnknown(error: unknown, defaultMessage = 'Unknown error occurred'): MCPError {
    if (error instanceof MCPError) {
      return error;
    }

    if (error instanceof Error) {
      return new ServerError(error.message, { originalError: error.name });
    }

    if (typeof error === 'string') {
      return new ServerError(error);
    }

    return new ServerError(defaultMessage, { originalError: String(error) });
  }

  /**
   * Check if HTTP status is retryable
   */
  private static isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429 || status === 408;
  }
}

/**
 * Error handler utility for consistent error processing
 */
export class ErrorHandler {
  /**
   * Process and normalize errors for MCP responses
   */
  static processError(error: unknown): {
    message: string;
    code: string;
    statusCode: number;
    isRetryable: boolean;
    context?: Record<string, any>;
  } {
    const mcpError = ErrorFactory.fromUnknown(error);

    return {
      message: mcpError.message,
      code: mcpError.code,
      statusCode: mcpError.statusCode,
      isRetryable: mcpError instanceof APIError ? mcpError.isRetryable : false,
      ...(mcpError.context && { context: mcpError.context }),
    };
  }

  /**
   * Check if error should be retried
   */
  static shouldRetry(error: unknown): boolean {
    if (error instanceof APIError) {
      return error.isRetryable;
    }

    if (error instanceof CircuitBreakerError) {
      return false; // Circuit breaker handles its own retry logic
    }

    if (error instanceof RateLimitError) {
      return true; // Rate limit errors can be retried after delay
    }

    return false;
  }

  /**
   * Get retry delay from error
   */
  static getRetryDelay(error: unknown): number | null {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    if (error instanceof CircuitBreakerError && error.nextAttemptTime) {
      return Math.max(0, error.nextAttemptTime - Date.now());
    }

    return null;
  }
}
