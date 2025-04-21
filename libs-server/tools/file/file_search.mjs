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
      description:
        'Searches for content within files in a specific thread branch or change request branch.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text or regex pattern to search for.'
          },
          path: {
            type: 'string',
            description:
              'Optional: Restrict the search to files within this path relative to the repository root.'
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether the search should be case-sensitive.',
            default: false
          },
          thread_id: {
            type: 'string',
            description:
              "Optional: Explicitly target this thread's branch (e.g., thread/{thread_id}). Overrides context thread_id."
          },
          branch_name: {
            type: 'string',
            description:
              'Optional: Explicitly target this branch by name. Takes precedence over thread_id.'
          },
          repo_path: {
            type: 'string',
            description:
              'Optional: Path to the repository root. Used in testing to specify a different repository.'
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
          path: parameters.path,
          case_sensitive: parameters.case_sensitive || false,
          thread_id: parameters.thread_id,
          branch_name: parameters.branch_name,
          repo_path: parameters.repo_path,
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
