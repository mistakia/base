/**
 * File read tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { read_file } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:read')

export function register_file_read_tool() {
  log('Registering file_read tool')

  register_tool({
    tool_name: 'file_read',
    tool_definition: {
      description:
        'Reads the content of a file from a specific branch in a Git repository.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to the repository root.'
          },
          branch: {
            type: 'string',
            description: 'Branch name to read the file from'
          },
          repo_path: {
            type: 'string',
            description: 'Optional: Repository path (for testing)'
          }
        },
        required: ['path', 'branch']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await read_file({
          path: parameters.path,
          branch_name: parameters.branch,
          repo_path: parameters.repo_path,
          context
        })
      } catch (error) {
        log(`Error reading file ${parameters.path}:`, error)
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
