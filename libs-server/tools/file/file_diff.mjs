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
      description:
        'Gets the diff for a specific path within a thread branch or change request branch, compared to a base branch (defaults to main).',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Optional: Path relative to the repository root to get the diff for. If omitted, shows diff for the entire branch.'
          },
          compare_with: {
            type: 'string',
            description:
              'Optional: The base branch or commit to compare against.',
            default: 'main'
          },
          format: {
            type: 'string',
            enum: ['unified', 'name-only', 'stat'],
            description: 'Diff format to return.',
            default: 'unified'
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
        // No required properties
      }
    },
    implementation: async (parameters, context = {}) => {
      try {
        // Delegate to the base-files implementation
        return await get_file_diff({
          path: parameters.path,
          compare_with: parameters.compare_with || 'main',
          format: parameters.format || 'unified',
          thread_id: parameters.thread_id,
          branch_name: parameters.branch_name,
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
