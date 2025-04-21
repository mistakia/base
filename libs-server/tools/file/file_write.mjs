/**
 * File write tool implementation
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { write_file } from '#libs-server/base-files/index.mjs'

// Setup logger
const log = debug('tools:file:write')

export function register_file_write_tool() {
  log('Registering file_write tool')

  register_tool({
    tool_name: 'file_write',
    tool_definition: {
      description:
        'Writes content to a file within a Git repository branch. Supports creating new files, updating existing files, or applying patches.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path relative to the repository root'
          },
          content: {
            type: 'string',
            description:
              'The full content of the file (for new files or complete replacements)'
          },
          patch_content: {
            type: 'string',
            description: 'Git patch content to apply (for partial updates)'
          },
          operation: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description:
              "Operation type: 'create', 'update', or 'delete'. Defaults to 'update'",
            default: 'update'
          },
          repo_path: {
            type: 'string',
            description: 'The path to the repository'
          },
          thread_id: {
            type: 'string',
            description: 'Thread ID to infer branch if branch_name not provided'
          },
          branch_name: {
            type: 'string',
            description: 'Explicit branch name to use'
          },
          commit_message: {
            type: 'string',
            description: 'Commit message for the change'
          }
        },
        required: ['path']
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await write_file({
          path: parameters.path,
          content: parameters.content,
          patch_content: parameters.patch_content,
          operation: parameters.operation,
          repo_path: parameters.repo_path,
          thread_id: parameters.thread_id,
          branch_name: parameters.branch_name,
          commit_message: parameters.commit_message,
          context
        })
      } catch (error) {
        log(`Error writing file ${parameters.path}:`, error)
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
