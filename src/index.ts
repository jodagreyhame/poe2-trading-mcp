#!/usr/bin/env node

/**
 * POE2Scout MCP Server
 *
 * A Model Context Protocol server that provides access to Path of Exile 2
 * item data through the POE2Scout API.
 * 
 * This enhanced version includes comprehensive tool registration, request processing
 * pipeline, lifecycle management, logging, monitoring, and error handling.
 */

import { createServerForEnvironment } from './server/index.js';
import { Logger } from './utils/logger.js';

// Initialize logger for startup
const startupLogger = new Logger({ 
  level: 'info', 
  enableMetrics: true,
  format: 'json'
});

/**
 * Main server startup function
 */
async function main(): Promise<void> {
  try {
    startupLogger.info('Starting POE2Scout MCP Server', {
      nodeVersion: process.version,
      pid: process.pid,
      platform: process.platform,
    });

    // Determine environment
    const environment = (process.env['NODE_ENV'] as 'development' | 'production' | 'testing') || 'production';
    
    // Validate required environment variables
    if (!process.env['POE2SCOUT_CONTACT_EMAIL']) {
      startupLogger.warn('POE2SCOUT_CONTACT_EMAIL not set, using default');
    }

    // Create and start the enhanced server
    const server = createServerForEnvironment(environment, {
      name: 'poe2scout-mcp',
      version: '1.0.0',
      logLevel: process.env['LOG_LEVEL'] as any || (environment === 'development' ? 'debug' : 'info'),
      enableMetrics: true,
      enableCircuitBreaker: environment === 'production',
      apiConfig: {
        contactEmail: process.env['POE2SCOUT_CONTACT_EMAIL'] || 'mcp-server@example.com',
      },
    });

    await server.start();

    // Set up graceful shutdown handlers
    setupGracefulShutdown(server);

    startupLogger.info('POE2Scout MCP Server startup completed successfully', {
      environment,
      pid: process.pid,
    });

  } catch (error) {
    startupLogger.error('Failed to start POE2Scout MCP Server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    console.error('Fatal startup error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(server: any): void {
  const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  
  shutdownSignals.forEach(signal => {
    process.on(signal, async () => {
      startupLogger.info(`Received ${signal}, initiating graceful shutdown`);
      
      try {
        await server.shutdown();
        startupLogger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        startupLogger.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    startupLogger.error('Uncaught exception, forcing shutdown', {
      error: error.message,
      stack: error.stack,
    });
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    startupLogger.error('Unhandled promise rejection, forcing shutdown', {
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise),
    });
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}

// Start the server if this is the main module
if (require.main === module) {
  main();
}
