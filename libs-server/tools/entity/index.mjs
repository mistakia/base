/**
 * Entity tools for the centralized tool registry
 */

import debug from 'debug'

// Import individual tool implementations
import { register_entity_create_tool } from './create-entity.mjs'

// Setup logger
const log = debug('tools:entity')

log('Registering entity tools')

// Register all tools
register_entity_create_tool()
