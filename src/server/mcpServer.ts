/**
 * Enhanced MCP Server Implementation
 *
 * Provides comprehensive tool registration, request processing pipeline,
 * lifecycle management, and error handling for the POE2Scout MCP server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { ValidationError, ServerError } from '../types/errors.js';

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<CallToolResult>;
  validation?: (args: any) => void;
  circuitBreaker?: CircuitBreaker;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  capabilities?: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
    prompts?: Record<string, any>;
  };
  circuitBreaker?: {
    failureThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    enableMetrics?: boolean;
  };
}

export class EnhancedMCPServer extends EventEmitter {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private toolHandlers: Map<string, ToolHandler> = new Map();
  private logger: Logger;
  private isRunning = false;
  private startTime: number = 0;
  private requestCount = 0;
  private errorCount = 0;
  private lastErrorTime: number | null = null;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
    this.logger = new Logger({
      level: config.logging?.level || 'info',
      enableMetrics: config.logging?.enableMetrics || true,
    });

    // Initialize the MCP server
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: config.capabilities || {
          tools: {},
        },
      }
    );

    this.setupServerHandlers();
    this.setupErrorHandling();

    this.logger.info('Enhanced MCP Server initialized', {
      name: config.name,
      version: config.version,
    });
  }

  /**
   * Register a tool handler with the server
   */
  registerTool(toolHandler: ToolHandler): void {
    this.logger.debug('Registering tool', { name: toolHandler.name });

    // Create circuit breaker if configuration provided
    if (this.config.circuitBreaker) {
      toolHandler.circuitBreaker = new CircuitBreaker(
        toolHandler.handler,
        this.config.circuitBreaker
      );
    }

    this.toolHandlers.set(toolHandler.name, toolHandler);

    this.emit('toolRegistered', {
      name: toolHandler.name,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Register multiple tools at once
   */
  registerTools(toolHandlers: ToolHandler[]): void {
    this.logger.info('Registering multiple tools', { count: toolHandlers.length });

    for (const handler of toolHandlers) {
      this.registerTool(handler);
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    const removed = this.toolHandlers.delete(toolName);
    if (removed) {
      this.logger.debug('Tool unregistered', { name: toolName });
      this.emit('toolUnregistered', {
        name: toolName,
        timestamp: new Date().toISOString(),
      });
    }
    return removed;
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): string[] {
    return Array.from(this.toolHandlers.keys());
  }

  /**
   * Setup server request handlers
   */
  private setupServerHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing tools', { count: this.toolHandlers.size });

      const tools = Array.from(this.toolHandlers.values()).map((handler) => ({
        name: handler.name,
        description: handler.description,
        inputSchema: handler.inputSchema,
      }));

      return { tools };
    });

    // Call tool handler with enhanced processing pipeline
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      return this.processToolCall(request);
    });
  }

  /**
   * Enhanced tool call processing with validation and error handling
   */
  private async processToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const startTime = performance.now();
    const { name, arguments: args } = request.params;

    this.requestCount++;
    this.logger.debug('Processing tool call', {
      toolName: name,
      requestId: this.requestCount,
      args: this.logger.shouldLog('debug') ? args : '[hidden]',
    });

    try {
      // Check if tool exists
      const toolHandler = this.toolHandlers.get(name);
      if (!toolHandler) {
        throw new ValidationError(`Unknown tool: ${name}`);
      }

      // Validate input if validator provided
      if (toolHandler.validation) {
        try {
          toolHandler.validation(args);
        } catch (error) {
          throw new ValidationError(
            `Invalid arguments for tool ${name}: ${error instanceof Error ? error.message : 'Validation failed'}`
          );
        }
      }

      // Execute tool with circuit breaker if available
      let result: CallToolResult;
      if (toolHandler.circuitBreaker) {
        result = await toolHandler.circuitBreaker.execute(args);
      } else {
        result = await toolHandler.handler(args);
      }

      const duration = performance.now() - startTime;
      this.logger.info('Tool call completed', {
        toolName: name,
        requestId: this.requestCount,
        duration: `${duration.toFixed(2)}ms`,
        success: true,
      });

      this.emit('toolCallCompleted', {
        toolName: name,
        requestId: this.requestCount,
        duration,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.errorCount++;
      this.lastErrorTime = Date.now();

      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      this.logger.error('Tool call failed', {
        toolName: name,
        requestId: this.requestCount,
        error: errorMessage,
        duration: `${duration.toFixed(2)}ms`,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });

      this.emit('toolCallFailed', {
        toolName: name,
        requestId: this.requestCount,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      });

      // Return error response in MCP format
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Setup error handling and process signals
   */
  private setupErrorHandling(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.emit('fatalError', error);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise),
      });
      this.emit('fatalError', reason);
    });

    // Handle graceful shutdown signals
    const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    shutdownSignals.forEach((signal) => {
      process.on(signal, () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown`);
        this.shutdown(0);
      });
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting MCP server', {
        name: this.config.name,
        version: this.config.version,
        tools: this.toolHandlers.size,
      });

      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);

      this.isRunning = true;
      this.startTime = Date.now();

      this.logger.info('MCP server started successfully', {
        transport: 'stdio',
        pid: process.pid,
      });

      this.emit('serverStarted', {
        timestamp: new Date().toISOString(),
        pid: process.pid,
      });

      // Log server status to stderr for debugging
      console.error(
        `${this.config.name} v${this.config.version} running on stdio (PID: ${process.pid})`
      );
    } catch (error) {
      this.logger.error('Failed to start MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('startupError', error);
      throw new ServerError(
        `Failed to start server: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Shutdown the MCP server gracefully
   */
  async shutdown(exitCode = 0): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Shutting down MCP server', { exitCode });

    try {
      // Close transport if available
      if (this.transport) {
        // The SDK doesn't expose a close method, so we just set it to null
        this.transport = null;
      }

      this.isRunning = false;

      this.logger.info('MCP server shutdown completed', {
        uptime: this.getUptime(),
        totalRequests: this.requestCount,
        totalErrors: this.errorCount,
      });

      this.emit('serverShutdown', {
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        totalRequests: this.requestCount,
        totalErrors: this.errorCount,
      });
    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    process.exit(exitCode);
  }

  /**
   * Get server status and metrics
   */
  getStatus(): {
    isRunning: boolean;
    uptime: number;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    lastErrorTime: number | null;
    registeredTools: string[];
    config: MCPServerConfig;
  } {
    const uptime = this.getUptime();
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    return {
      isRunning: this.isRunning,
      uptime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: Number(errorRate.toFixed(2)),
      lastErrorTime: this.lastErrorTime,
      registeredTools: this.getRegisteredTools(),
      config: this.config,
    };
  }

  /**
   * Get server uptime in milliseconds
   */
  private getUptime(): number {
    return this.isRunning ? Date.now() - this.startTime : 0;
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastErrorTime = null;
    this.logger.debug('Server metrics reset');
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }
}
