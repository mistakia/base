/**
 * File diff tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { get_file_diff } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:diff')

export function register_file_diff_tool() {
  log('Registering file_diff tool')

  register_tool({
    tool_name: 'file_diff',
    tool_definition: {
      description: 'Gets the diff for a file or directory between branches',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Path to get diff for (if omitted, shows diff for entire branch)'
          },
          compare_with: {
            type: 'string',
            description: 'The base branch to compare against',
            default: 'main'
          },
          format: {
            type: 'string',
            enum: ['unified', 'name-only', 'stat'],
            description: 'Diff format (unified, name-only, stat)',
            default: 'unified'
          },
          branch: {
            type: 'string',
            description: 'Branch name to get diff from'
          },
          repo_path: {
            type: 'string',
            description: 'Repository path (for testing)'
          }
        },
        required: ['branch']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await get_file_diff({
          path: parameters.path,
          compare_with: parameters.compare_with || 'main',
          format: parameters.format || 'unified',
          branch_name: parameters.branch,
          repo_path: parameters.repo_path,
          context
        })
      } catch (error) {
        log(
          `Error getting diff for path "${parameters.path}" compared to "${parameters.compare_with}":`,
          error
        )
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
