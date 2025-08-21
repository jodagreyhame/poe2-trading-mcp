/**
 * Tool Registry for MCP Server
 *
 * Manages tool registration, discovery, and organization.
 * Provides a centralized system for tool lifecycle management.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { ValidationError, ToolExecutionError } from '../types/errors.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

export interface ToolDefinition {
  name: string;
  description: string;
  category?: string;
  version?: string;
  deprecated?: boolean;
  inputSchema: any;
  outputSchema?: any;
  examples?: Array<{
    name: string;
    description: string;
    input: any;
    expectedOutput?: any;
  }>;
  tags?: string[];
}

export interface ToolHandler {
  definition: ToolDefinition;
  handler: (args: any) => Promise<CallToolResult>;
  validation?: (args: any) => void | Promise<void>;
  circuitBreaker?: CircuitBreaker;
  middleware?: ToolMiddleware[];
}

export interface ToolMiddleware {
  name: string;
  before?: (args: any, context: ToolContext) => Promise<any>;
  after?: (result: CallToolResult, args: any, context: ToolContext) => Promise<CallToolResult>;
  onError?: (error: Error, args: any, context: ToolContext) => Promise<Error>;
}

export interface ToolContext {
  toolName: string;
  requestId: number;
  startTime: number;
  metadata: Record<string, any>;
}

export interface ToolRegistryConfig {
  enableValidation?: boolean;
  enableCircuitBreaker?: boolean;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
  logger?: Logger;
}

export interface ToolMetrics {
  name: string;
  category?: string;
  callCount: number;
  errorCount: number;
  totalDuration: number;
  averageDuration: number;
  lastCalled: number | null;
  lastError: number | null;
}

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private metrics: Map<string, ToolMetrics> = new Map();
  private middleware: Map<string, ToolMiddleware> = new Map();
  private config: ToolRegistryConfig;
  private logger: Logger;
  private requestCounter = 0;

  constructor(config: ToolRegistryConfig) {
    this.config = {
      enableValidation: config.enableValidation ?? true,
      enableCircuitBreaker: config.enableCircuitBreaker ?? false,
      ...(config.circuitBreakerConfig && { circuitBreakerConfig: config.circuitBreakerConfig }),
      ...(config.logger && { logger: config.logger }),
    };

    this.logger = config.logger || new Logger({ level: 'info', enableMetrics: true });
  }

  /**
   * Register a tool with the registry
   */
  async registerTool(toolHandler: ToolHandler): Promise<void> {
    const { definition } = toolHandler;

    if (this.tools.has(definition.name)) {
      throw new ValidationError(`Tool '${definition.name}' is already registered`);
    }

    // Validate tool definition
    this.validateToolDefinition(definition);

    // Set up circuit breaker if enabled
    if (this.config.enableCircuitBreaker && !toolHandler.circuitBreaker) {
      toolHandler.circuitBreaker = new CircuitBreaker(
        toolHandler.handler,
        this.config.circuitBreakerConfig || {}
      );
    }

    // Initialize metrics
    const metrics: ToolMetrics = {
      name: definition.name,
      callCount: 0,
      errorCount: 0,
      totalDuration: 0,
      averageDuration: 0,
      lastCalled: null,
      lastError: null,
    };

    if (definition.category) {
      metrics.category = definition.category;
    }

    this.metrics.set(definition.name, metrics);

    // Add to category index
    if (definition.category) {
      if (!this.categories.has(definition.category)) {
        this.categories.set(definition.category, new Set());
      }
      this.categories.get(definition.category)!.add(definition.name);
    }

    this.tools.set(definition.name, toolHandler);

    this.logger.info('Tool registered successfully', {
      name: definition.name,
      category: definition.category,
      version: definition.version,
    });
  }

  /**
   * Register multiple tools at once
   */
  async registerTools(toolHandlers: ToolHandler[]): Promise<void> {
    const errors: Error[] = [];

    for (const handler of toolHandlers) {
      try {
        await this.registerTool(handler);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      this.logger.warn('Some tools failed to register', {
        failed: errors.length,
        total: toolHandlers.length,
        errors: errors.map((e) => e.message),
      });
    }

    this.logger.info('Bulk tool registration completed', {
      successful: toolHandlers.length - errors.length,
      failed: errors.length,
      total: toolHandlers.length,
    });
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return false;
    }

    // Remove from category index
    if (tool.definition.category) {
      const categoryTools = this.categories.get(tool.definition.category);
      if (categoryTools) {
        categoryTools.delete(toolName);
        if (categoryTools.size === 0) {
          this.categories.delete(tool.definition.category);
        }
      }
    }

    this.tools.delete(toolName);
    this.metrics.delete(toolName);

    this.logger.info('Tool unregistered', { name: toolName });
    return true;
  }

  /**
   * Execute a tool with full pipeline processing
   */
  async executeTool(toolName: string, args: any): Promise<CallToolResult> {
    const requestId = ++this.requestCounter;
    const startTime = performance.now();

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new ValidationError(`Tool '${toolName}' not found`);
    }

    const context: ToolContext = {
      toolName,
      requestId,
      startTime,
      metadata: {},
    };

    const metrics = this.metrics.get(toolName)!;
    metrics.callCount++;
    metrics.lastCalled = Date.now();

    try {
      // Run validation if enabled
      if (this.config.enableValidation && tool.validation) {
        await tool.validation(args);
      }

      // Process middleware before hooks
      let processedArgs = args;
      if (tool.middleware) {
        for (const middleware of tool.middleware) {
          if (middleware.before) {
            processedArgs = await middleware.before(processedArgs, context);
          }
        }
      }

      // Execute tool
      let result: CallToolResult;
      if (tool.circuitBreaker) {
        result = await tool.circuitBreaker.execute(processedArgs);
      } else {
        result = await tool.handler(processedArgs);
      }

      // Process middleware after hooks
      if (tool.middleware) {
        for (const middleware of tool.middleware) {
          if (middleware.after) {
            result = await middleware.after(result, processedArgs, context);
          }
        }
      }

      // Update metrics
      const duration = performance.now() - startTime;
      metrics.totalDuration += duration;
      metrics.averageDuration = metrics.totalDuration / metrics.callCount;

      this.logger.debug('Tool executed successfully', {
        toolName,
        requestId,
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      metrics.errorCount++;
      metrics.lastError = Date.now();

      // Process middleware error hooks
      let processedError = error instanceof Error ? error : new Error(String(error));
      if (tool.middleware) {
        for (const middleware of tool.middleware) {
          if (middleware.onError) {
            processedError = await middleware.onError(processedError, args, context);
          }
        }
      }

      const duration = performance.now() - startTime;
      this.logger.error('Tool execution failed', {
        toolName,
        requestId,
        error: processedError.message,
        duration: `${duration.toFixed(2)}ms`,
      });

      throw new ToolExecutionError(
        `Tool '${toolName}' execution failed: ${processedError.message}`,
        toolName,
        { requestId, duration, originalError: processedError.name }
      );
    }
  }

  /**
   * Get tool definition
   */
  getToolDefinition(toolName: string): ToolDefinition | null {
    const tool = this.tools.get(toolName);
    return tool ? tool.definition : null;
  }

  /**
   * Get all registered tool definitions
   */
  getAllToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolDefinition[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map((name) => this.tools.get(name)?.definition)
      .filter(Boolean) as ToolDefinition[];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.tools.values())
      .filter(
        (tool) =>
          tool.definition.name.toLowerCase().includes(lowerQuery) ||
          tool.definition.description.toLowerCase().includes(lowerQuery) ||
          tool.definition.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
      )
      .map((tool) => tool.definition);
  }

  /**
   * Get tool metrics
   */
  getToolMetrics(toolName?: string): ToolMetrics | ToolMetrics[] {
    if (toolName) {
      const metrics = this.metrics.get(toolName);
      if (!metrics) {
        throw new ValidationError(`No metrics found for tool '${toolName}'`);
      }
      return metrics;
    }

    return Array.from(this.metrics.values());
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalTools: number;
    totalCategories: number;
    totalCalls: number;
    totalErrors: number;
    averageResponseTime: number;
    toolsByCategory: Record<string, number>;
    topTools: Array<{ name: string; calls: number }>;
  } {
    const allMetrics = Array.from(this.metrics.values());

    const totalCalls = allMetrics.reduce((sum, m) => sum + m.callCount, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorCount, 0);
    const totalDuration = allMetrics.reduce((sum, m) => sum + m.totalDuration, 0);
    const averageResponseTime = totalCalls > 0 ? totalDuration / totalCalls : 0;

    const toolsByCategory: Record<string, number> = {};
    for (const [category, tools] of this.categories.entries()) {
      toolsByCategory[category] = tools.size;
    }

    const topTools = allMetrics
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10)
      .map((m) => ({ name: m.name, calls: m.callCount }));

    return {
      totalTools: this.tools.size,
      totalCategories: this.categories.size,
      totalCalls,
      totalErrors,
      averageResponseTime: Number(averageResponseTime.toFixed(2)),
      toolsByCategory,
      topTools,
    };
  }

  /**
   * Register global middleware
   */
  registerMiddleware(middleware: ToolMiddleware): void {
    this.middleware.set(middleware.name, middleware);
    this.logger.debug('Middleware registered', { name: middleware.name });
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    for (const metrics of this.metrics.values()) {
      metrics.callCount = 0;
      metrics.errorCount = 0;
      metrics.totalDuration = 0;
      metrics.averageDuration = 0;
      metrics.lastCalled = null;
      metrics.lastError = null;
    }
    this.requestCounter = 0;
    this.logger.info('Tool metrics reset');
  }

  /**
   * Validate tool definition
   */
  private validateToolDefinition(definition: ToolDefinition): void {
    if (!definition.name || typeof definition.name !== 'string') {
      throw new ValidationError('Tool name is required and must be a string');
    }

    if (!definition.description || typeof definition.description !== 'string') {
      throw new ValidationError('Tool description is required and must be a string');
    }

    if (!definition.inputSchema || typeof definition.inputSchema !== 'object') {
      throw new ValidationError('Tool inputSchema is required and must be an object');
    }

    // Validate name format
    if (!/^[a-z][a-z0-9_]*$/.test(definition.name)) {
      throw new ValidationError(
        'Tool name must start with a letter and contain only lowercase letters, numbers, and underscores'
      );
    }
  }
}
