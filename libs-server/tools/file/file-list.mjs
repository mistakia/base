/**
 * File list tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { list_files } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:list')

export function register_file_list_tool() {
  log('Registering file_list tool')

  register_tool({
    tool_name: 'file_list',
    tool_definition: {
      description: 'Lists files within a directory in a specific branch.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional: Directory path to list files from',
            default: ''
          },
          pattern: {
            type: 'string',
            description: 'Optional: Glob pattern to filter files',
            default: '*'
          },
          branch: {
            type: 'string',
            description: 'Branch name to list files from'
          },
          repo_path: {
            type: 'string',
            description: 'Optional: Repository path (for testing)'
          }
        },
        required: ['branch']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await list_files({
          path: parameters.path || '',
          pattern: parameters.pattern || '*',
          branch_name: parameters.branch,
          repo_path: parameters.repo_path,
          context
        })
      } catch (error) {
        log(
          `Error listing files for path "${parameters.path}", pattern "${parameters.pattern}":`,
          error
        )
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
