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
      description:
        'Deletes a file within a specific thread branch or change request branch. Creates a new change request if one is not specified.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to the repository root.'
          },
          change_request_id: {
            type: 'string',
            description:
              "Optional: Explicitly target this change request's feature branch. If provided, the file change will be added as a new commit to this existing branch. If omitted, a new change request and branch will be created."
          },
          thread_id: {
            type: 'string',
            description:
              "Optional: Explicitly target this thread's branch when creating a *new* change request. Overrides context thread_id. Ignored if change_request_id is provided."
          },
          commit_message: {
            type: 'string',
            description:
              'Optional: Custom commit message. Defaults to an automatic message. Used only when modifying an existing change_request_id.'
          },
          change_request_title: {
            type: 'string',
            description:
              'Optional: Title for the new change request if one is created. Defaults to an automatic title.'
          },
          change_request_description: {
            type: 'string',
            description:
              'Optional: Description for the new change request if one is created.'
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
        return await delete_file({
          path: parameters.path,
          change_request_id: parameters.change_request_id,
          thread_id: parameters.thread_id,
          commit_message: parameters.commit_message,
          change_request_title: parameters.change_request_title,
          change_request_description: parameters.change_request_description,
          repo_path: parameters.repo_path,
          context
        })
      } catch (error) {
        log(`Error deleting file ${parameters.path}:`, error)
        throw error // Pass through the error from the base implementation
      }
    }
  })
}
