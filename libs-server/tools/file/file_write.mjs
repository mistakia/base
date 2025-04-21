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
        'Writes content to a file within a specific thread branch. Supports creating new files, updating existing files, or deleting files.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to the repository root.'
          },
          content: {
            type: 'string',
            description:
              'The full content to write to the file. Required for create or update operations.'
          },
          patch_content: {
            type: 'string',
            description:
              'Git patch content to apply for partial updates. Alternative to content for update operations.'
          },
          operation: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description:
              'Operation type. Defaults to "update" if not specified.'
          },
          branch_name: {
            type: 'string',
            description:
              'Optional: Explicitly target this branch. If omitted, will attempt to infer from thread_id.'
          },
          thread_id: {
            type: 'string',
            description:
              'Optional: Thread ID to infer branch if branch_name not provided. Overrides context thread_id.'
          },
          commit_message: {
            type: 'string',
            description: 'Optional: Custom commit message for the change.'
          },
          repo_path: {
            type: 'string',
            description:
              'Optional: Path to the repository root. Used in testing to specify a different repository.'
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
