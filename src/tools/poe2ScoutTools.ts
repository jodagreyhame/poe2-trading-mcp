/**
 * POE2Scout Tools Implementation - Simplified Version
 *
 * This file now serves as a compatibility layer that redirects to the basic tools.
 * All complex analysis tools have been removed in favor of reliable, direct API access.
 */

import { POE2ScoutClient } from '../api/client.js';
import { ToolHandler } from '../server/toolRegistry.js';
import { Logger } from '../utils/logger.js';
import { createBasicPOE2ScoutTools } from './basicPOE2Tools.js';

/**
 * Create all POE2Scout tool handlers - now uses basic tools only
 */
export function createPOE2ScoutTools(client: POE2ScoutClient, logger: Logger): ToolHandler[] {
  logger.info('Using basic POE2Scout tools for reliability');
  
  // Return the basic, reliable tools instead of complex ones
  return createBasicPOE2ScoutTools(client, logger);
}