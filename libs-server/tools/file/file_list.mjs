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
      description:
        'Lists files within a specific directory of a thread branch or change request branch.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Optional: Directory path relative to the repository root to list files from. Defaults to root.',
            default: ''
          },
          pattern: {
            type: 'string',
            description:
              "Optional: Glob pattern to filter files (e.g., '*.md', 'data/tasks/*'). Defaults to all files ('*').",
            default: '*'
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
        }
        // No required properties, path and pattern have defaults
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await list_files({
          path: parameters.path || '',
          pattern: parameters.pattern || '*',
          thread_id: parameters.thread_id,
          branch_name: parameters.branch_name,
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
