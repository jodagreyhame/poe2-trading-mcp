/**
 * Enhanced POE2Scout MCP Server Entry Point
 *
 * Integrates all components: enhanced MCP server, tool registry,
 * POE2Scout client, logging, and comprehensive error handling.
 */

import { EnhancedMCPServer, MCPServerConfig } from './mcpServer.js';
import { ToolRegistry, ToolRegistryConfig } from './toolRegistry.js';
import { POE2ScoutClient } from '../api/client.js';
import { ConfigManager, POE2ScoutConfig } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { createPOE2ScoutTools } from '../tools/poe2ScoutTools.js';
import { ServerError, ConfigurationError } from '../types/errors.js';

export interface ServerOptions {
  // Server configuration
  name?: string;
  version?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics?: boolean;

  // Circuit breaker configuration
  enableCircuitBreaker?: boolean;
  circuitBreakerConfig?: {
    failureThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };

  // POE2Scout API configuration
  apiConfig?: {
    contactEmail?: string;
    baseURL?: string;
    timeout?: number;
    retries?: number;
    rateLimit?: {
      requestsPerSecond?: number;
      burstSize?: number;
    };
  };

  // Environment-specific settings
  environment?: 'development' | 'production' | 'testing';
}

export class POE2ScoutMCPServer {
  private mcpServer: EnhancedMCPServer;
  private toolRegistry: ToolRegistry;
  private apiClient: POE2ScoutClient;
  private logger: Logger;
  private isInitialized = false;

  constructor(options: ServerOptions = {}) {
    // Initialize logger first
    this.logger = new Logger({
      level: options.logLevel || 'info',
      enableMetrics: options.enableMetrics ?? true,
      format: 'json',
      includeHostname: false,
    });

    this.logger.info('Initializing POE2Scout MCP Server', {
      version: options.version || '1.0.0',
      environment: options.environment || 'production',
    });

    try {
      // Initialize API client
      this.apiClient = this.createApiClient(options);

      // Initialize tool registry
      this.toolRegistry = this.createToolRegistry(options);

      // Initialize MCP server
      this.mcpServer = this.createMCPServer(options);

      this.logger.info('POE2Scout MCP Server components initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize POE2Scout MCP Server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ServerError(
        `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Initialize and start the server
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Server already initialized, skipping');
      return;
    }

    try {
      this.logger.info('Starting server initialization');

      // Register POE2Scout tools
      const tools = createPOE2ScoutTools(this.apiClient, this.logger);
      await this.toolRegistry.registerTools(tools);

      // Register tools with MCP server
      for (const tool of tools) {
        this.mcpServer.registerTool({
          name: tool.definition.name,
          description: tool.definition.description,
          inputSchema: tool.definition.inputSchema,
          handler: async (args: any) => {
            return this.toolRegistry.executeTool(tool.definition.name, args);
          },
          ...(tool.validation && { validation: tool.validation }),
        });
      }

      this.isInitialized = true;
      this.logger.info('Server initialization completed', {
        registeredTools: this.toolRegistry.getStatistics().totalTools,
      });
    } catch (error) {
      this.logger.error('Server initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ServerError(
        `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.mcpServer.start();

      // Log startup information
      this.logStartupInfo();
    } catch (error) {
      this.logger.error('Failed to start MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down POE2Scout MCP Server');

    try {
      await this.mcpServer.shutdown();
    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get server status and metrics
   */
  getStatus(): {
    server: ReturnType<EnhancedMCPServer['getStatus']>;
    tools: ReturnType<ToolRegistry['getStatistics']>;
    apiClient: ReturnType<POE2ScoutClient['getStatus']>;
  } {
    return {
      server: this.mcpServer.getStatus(),
      tools: this.toolRegistry.getStatistics(),
      apiClient: this.apiClient.getStatus(),
    };
  }

  /**
   * Create API client with configuration
   */
  private createApiClient(options: ServerOptions): POE2ScoutClient {
    try {
      // Create config manager based on environment
      const configManager = options.environment
        ? ConfigManager.createForEnvironment(options.environment)
        : new ConfigManager();

      // Apply API configuration overrides
      if (options.apiConfig) {
        const cleanApiConfig: Partial<POE2ScoutConfig> = {};

        if (options.apiConfig.contactEmail) {
          cleanApiConfig.contactEmail = options.apiConfig.contactEmail;
        }
        if (options.apiConfig.baseURL) {
          cleanApiConfig.baseURL = options.apiConfig.baseURL;
        }
        if (options.apiConfig.timeout) {
          cleanApiConfig.timeout = options.apiConfig.timeout;
        }
        if (options.apiConfig.retries) {
          cleanApiConfig.retries = options.apiConfig.retries;
        }
        if (options.apiConfig.rateLimit) {
          cleanApiConfig.rateLimit = {
            requestsPerSecond: options.apiConfig.rateLimit.requestsPerSecond ?? 2,
            burstSize: options.apiConfig.rateLimit.burstSize ?? 5,
          };
        }
        configManager.updateConfig(cleanApiConfig);
      }

      // Ensure contact email is provided
      const config = configManager.getConfig();
      if (!config.contactEmail) {
        const envEmail = process.env['POE2SCOUT_CONTACT_EMAIL'];
        if (!envEmail) {
          throw new ConfigurationError(
            'Contact email is required. Set POE2SCOUT_CONTACT_EMAIL environment variable or provide in apiConfig.contactEmail'
          );
        }
      }

      return new POE2ScoutClient(config);
    } catch (error) {
      throw new ConfigurationError(
        `Failed to create API client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create tool registry with configuration
   */
  private createToolRegistry(options: ServerOptions): ToolRegistry {
    const config: ToolRegistryConfig = {
      enableValidation: true,
      enableCircuitBreaker: options.enableCircuitBreaker ?? false,
      ...(options.circuitBreakerConfig && { circuitBreakerConfig: options.circuitBreakerConfig }),
      logger: this.logger,
    };

    return new ToolRegistry(config);
  }

  /**
   * Create MCP server with configuration
   */
  private createMCPServer(options: ServerOptions): EnhancedMCPServer {
    const config: MCPServerConfig = {
      name: options.name || 'poe2scout-mcp',
      version: options.version || '1.0.0',
      capabilities: {
        tools: {},
      },
      ...(options.enableCircuitBreaker &&
        options.circuitBreakerConfig && {
          circuitBreaker: options.circuitBreakerConfig,
        }),
      logging: {
        level: options.logLevel || 'info',
        enableMetrics: options.enableMetrics ?? true,
      },
    };

    return new EnhancedMCPServer(config);
  }

  /**
   * Log startup information
   */
  private logStartupInfo(): void {
    const status = this.getStatus();

    this.logger.info('POE2Scout MCP Server started successfully', {
      server: {
        name: status.server.config.name,
        version: status.server.config.version,
        pid: process.pid,
      },
      tools: {
        total: status.tools.totalTools,
        categories: status.tools.totalCategories,
        byCategory: status.tools.toolsByCategory,
      },
      apiClient: {
        baseURL: status.apiClient.config.baseURL,
        rateLimit: status.apiClient.config.rateLimit,
        userAgent: status.apiClient.config.userAgent || 'not-set',
      },
    });

    // Log available tools to stderr for debugging
    const toolsList = this.toolRegistry
      .getAllToolDefinitions()
      .map((tool) => `  - ${tool.name}: ${tool.description}`)
      .join('\n');

    console.error(`\n=== POE2Scout MCP Server ===`);
    console.error(`Version: ${status.server.config.version}`);
    console.error(`PID: ${process.pid}`);
    console.error(`Tools available (${status.tools.totalTools}):`);
    console.error(toolsList);
    console.error(`================================\n`);
  }
}

/**
 * Create and start the server with default configuration
 */
export async function createServer(options: ServerOptions = {}): Promise<POE2ScoutMCPServer> {
  const server = new POE2ScoutMCPServer(options);
  await server.start();
  return server;
}

/**
 * Factory function for different environments
 */
export function createServerForEnvironment(
  environment: 'development' | 'production' | 'testing',
  overrides: Partial<ServerOptions> = {}
): POE2ScoutMCPServer {
  const baseOptions: ServerOptions = {
    environment,
    ...overrides,
  };

  // Environment-specific defaults
  switch (environment) {
    case 'development':
      return new POE2ScoutMCPServer({
        logLevel: 'debug',
        enableMetrics: true,
        enableCircuitBreaker: false,
        ...baseOptions,
      });

    case 'production':
      return new POE2ScoutMCPServer({
        logLevel: 'info',
        enableMetrics: true,
        enableCircuitBreaker: true,
        circuitBreakerConfig: {
          failureThreshold: 5,
          timeout: 10000,
          resetTimeout: 60000,
        },
        ...baseOptions,
      });

    case 'testing':
      return new POE2ScoutMCPServer({
        logLevel: 'warn',
        enableMetrics: false,
        enableCircuitBreaker: false,
        ...baseOptions,
      });

    default:
      return new POE2ScoutMCPServer(baseOptions);
  }
}
