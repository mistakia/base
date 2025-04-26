/**
 * File manipulation tools for the centralized tool registry
 */

import debug from 'debug'

// Import individual tool implementations
import { register_file_read_tool } from './file-read.mjs'
import { register_file_list_tool } from './file-list.mjs'
import { register_file_write_tool } from './file-write.mjs'
import { register_file_delete_tool } from './file-delete.mjs'
import { register_file_diff_tool } from './file-diff.mjs'
import { register_file_search_tool } from './file-search.mjs'

// Setup logger
const log = debug('tools:file')

log('Registering file tools')

// Register all tools
register_file_read_tool()
register_file_list_tool()
register_file_write_tool()
register_file_delete_tool()
register_file_diff_tool()
register_file_search_tool()
