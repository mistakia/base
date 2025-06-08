/**
 * File delete tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { delete_file } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:delete')

export function register_file_delete_tool() {
  log('Registering file_delete tool')

  register_tool({
    tool_name: 'file_delete',
    tool_definition: {
      description: 'Deletes a file within a specific branch',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path relative to the repository root'
          },
          repo_path: {
            type: 'string',
            description: 'The path to the repository'
          },
          branch: {
            type: 'string',
            description: 'Branch name to delete the file from'
          },
          commit_message: {
            type: 'string',
            description: 'Commit message for the deletion'
          },
          force: {
            type: 'boolean',
            description: 'Force removal even if file has local modifications',
            default: false
          }
        },
        required: ['path', 'branch']
      }
    },
    implementation: async (parameters) => {
      try {
        // Delegate to the base-files implementation
        return await delete_file({
          path: parameters.path,
          repo_path: parameters.repo_path,
          branch_name: parameters.branch,
          commit_message: parameters.commit_message,
          force: parameters.force
        })
      } catch (error) {
        log(`Error deleting file ${parameters.path}:`, error)
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
