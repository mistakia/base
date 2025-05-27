/**
 * File search tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { search_files } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:search')

export function register_file_search_tool() {
  log('Registering file_search tool')

  register_tool({
    tool_name: 'file_search',
    tool_definition: {
      description: 'Search for content in files within a specific branch',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text to search for'
          },
          repo_path: {
            type: 'string',
            description: 'Repository path to search in'
          },
          path: {
            type: 'string',
            description: 'Optional path within repo to limit search'
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether search is case sensitive',
            default: false
          },
          branch_name: {
            type: 'string',
            description: 'Branch name to use (optional)'
          }
        },
        required: ['query']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        const results = await search_files({
          query: parameters.query,
          repo_path: parameters.repo_path,
          path: parameters.path,
          case_sensitive: parameters.case_sensitive || false,
          branch_name: parameters.branch_name,
          thread_id: parameters.thread_id,
          context
        })

        return {
          results: results.results,
          count: results.results.length
        }
      } catch (error) {
        log(
          `Error searching for "${parameters.query}" in path "${parameters.path}":`,
          error
        )
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
