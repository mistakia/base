/**
 * File manipulation tools for the centralized tool registry
 */

import debug from 'debug'
import { register_tool } from '#libs-server/tools/index.mjs'
import * as git_ops from '#libs-server/git/git_operations.mjs'
import fs from 'fs/promises'
import path from 'path'
import { get_change_request } from '#libs-server/change_requests/index.mjs'
// TODO: Need a way to get thread branch name from thread_id

// Setup logger
const log = debug('tools:file')

log('Registering file tools')

// Helper function to determine the target branch
async function get_target_branch({ thread_id, change_request_id, context }) {
  const repo_path = '.' // Assuming operations run from the root of the repo

  if (change_request_id) {
    log(`Using change_request_id ${change_request_id} to find branch`)
    const cr = await get_change_request({ change_request_id })
    if (!cr || !cr.feature_branch) {
      throw new Error(
        `Change request ${change_request_id} not found or has no feature branch.`
      )
    }
    return { branch_name: cr.feature_branch, repo_path }
  }

  const target_thread_id = thread_id || context?.thread_id
  if (target_thread_id) {
    log(`Using thread_id ${target_thread_id} to determine branch`)
    // TODO: Replace this placeholder with actual logic to get thread branch name
    const thread_branch_name = `thread/${target_thread_id}` // Placeholder
    // Verify branch exists? Maybe not necessary for read operations.
    return { branch_name: thread_branch_name, repo_path }
  }

  throw new Error(
    'Cannot determine target branch: No change_request_id, thread_id, or context.thread_id provided.'
  )
}

// 1. File Read
register_tool({
  tool_name: 'file_read',
  tool_definition: {
    description:
      'Reads the content of a file from a specific thread branch or change request branch.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the repository root.'
        },
        thread_id: {
          type: 'string',
          description:
            "Optional: Explicitly target this thread's branch (e.g., thread/{thread_id}). Overrides context thread_id."
        },
        change_request_id: {
          type: 'string',
          description:
            "Optional: Explicitly target this change request's feature branch (e.g., cr/{change_request_id}). Takes precedence over thread_id."
        }
      },
      required: ['path']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const { path: file_path, thread_id, change_request_id } = parameters
      const { branch_name, repo_path } = await get_target_branch({
        thread_id,
        change_request_id,
        context
      })

      log(`Reading file ${file_path} from branch ${branch_name}`)
      const content = await git_ops.read_file_from_ref({
        repo_path,
        ref: branch_name,
        file_path
      })
      return { content }
    } catch (error) {
      log(`Error reading file ${parameters.path}:`, error)
      // Provide a more specific error message if possible
      if (
        error.message.includes('fatal: path') &&
        error.message.includes('does not exist')
      ) {
        throw new Error(
          `File not found at path "${parameters.path}" in the specified branch. ${error.message}`
        )
      }
      throw new Error(`Failed to read file: ${error.message}`)
    }
  }
})

// 2. File List
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
        change_request_id: {
          type: 'string',
          description:
            "Optional: Explicitly target this change request's feature branch (e.g., cr/{change_request_id}). Takes precedence over thread_id."
        }
      }
      // No required properties, path and pattern have defaults
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        path: list_path = '',
        pattern = '*',
        thread_id,
        change_request_id
      } = parameters
      const { branch_name, repo_path } = await get_target_branch({
        thread_id,
        change_request_id,
        context
      })

      // Combine path and pattern for git_ops.list_files if path is provided
      // Ensure no leading/trailing slashes interfere
      const clean_path = list_path.replace(/^\/|\/$/g, '')
      const path_pattern = clean_path ? `${clean_path}/${pattern}` : pattern

      log(
        `Listing files in path "${list_path}" with pattern "${pattern}" (using path_pattern "${path_pattern}") from branch ${branch_name}`
      )

      const files = await git_ops.list_files({
        repo_path,
        ref: branch_name,
        path_pattern
      })
      return { files }
    } catch (error) {
      log(
        `Error listing files for path "${parameters.path}", pattern "${parameters.pattern}":`,
        error
      )
      throw new Error(`Failed to list files: ${error.message}`)
    }
  }
})

// 3. File Write
register_tool({
  tool_name: 'file_write',
  tool_definition: {
    description:
      'Writes content to a file within a specific thread branch or change request branch. Creates a new change request if one is not specified.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the repository root.'
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file.'
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
        }
      },
      required: ['path', 'content']
    }
  },
  implementation: async (parameters, context = {}) => {
    const {
      path: file_path,
      content,
      change_request_id,
      thread_id,
      commit_message,
      change_request_title,
      change_request_description
    } = parameters

    const repo_path = '.' // Assuming operations run from the root of the repo
    const implicit_thread_id = context?.thread_id

    if (change_request_id) {
      // --- Modify Existing Change Request ---
      log(
        `Modifying existing change request ${change_request_id} for file ${file_path}`
      )
      let worktree_path = null
      try {
        const cr = await get_change_request({ change_request_id })
        if (!cr || !cr.feature_branch) {
          throw new Error(
            `Change request ${change_request_id} not found or has no feature branch.`
          )
        }
        const branch_name = cr.feature_branch

        worktree_path = await git_ops.create_worktree({
          repo_path,
          branch_name
        })
        log(`Using worktree ${worktree_path} for branch ${branch_name}`)

        const full_file_path = path.resolve(worktree_path, file_path)
        const dir_name = path.dirname(full_file_path)

        await fs.mkdir(dir_name, { recursive: true })
        await fs.writeFile(full_file_path, content)
        log(`Wrote file ${file_path} in worktree`)

        await git_ops.add_files({ worktree_path, files_to_add: [file_path] })
        log(`Staged file ${file_path}`)

        const final_commit_message =
          commit_message || `Update file ${file_path}`
        await git_ops.commit_changes({
          worktree_path,
          commit_message: final_commit_message
        })
        log(`Committed changes to branch ${branch_name}`)

        // TODO: Should we update the CR's updated_at timestamp here?

        return {
          success: true,
          message: `File ${file_path} updated in change request ${change_request_id}.`,
          change_request_id
        }
      } catch (error) {
        log(`Error modifying change request ${change_request_id}:`, error)
        throw new Error(`Failed to modify change request: ${error.message}`)
      } finally {
        if (worktree_path && worktree_path !== repo_path) {
          log(`Cleaning up worktree ${worktree_path}`)
          await git_ops.remove_worktree({ repo_path, worktree_path })
        }
      }
    } else {
      // --- Create New Change Request ---
      const target_thread_id = thread_id || implicit_thread_id
      if (!target_thread_id) {
        throw new Error(
          'Cannot create change request: No explicit thread_id provided and no thread_id found in context.'
        )
      }

      log(
        `Creating new change request for file ${file_path} in thread ${target_thread_id}`
      )

      try {
        const final_cr_title = change_request_title || `Write file ${file_path}`
        const final_cr_description =
          change_request_description ||
          `Automated change request to write content to ${file_path}.`

        // create_change_request handles branch creation, commit, db record, etc.
        const new_cr_id = await create_change_request({
          title: final_cr_title,
          description: final_cr_description,
          creator_id: context?.user_id || 'system:tool', // Get creator from context if possible
          target_branch: 'main', // Assuming main is the ultimate target
          file_changes: [{ path: file_path, content }],
          related_thread_id: target_thread_id,
          // create_github_pr: false, // Default behavior
          tags: ['tool-generated', 'file-write'] // Add some default tags
        })

        log(`Created new change request ${new_cr_id}`)
        return {
          success: true,
          message: `File ${file_path} written and new change request ${new_cr_id} created.`,
          change_request_id: new_cr_id
        }
      } catch (error) {
        log(`Error creating change request for file ${file_path}:`, error)
        throw new Error(`Failed to create change request: ${error.message}`)
      }
    }
  }
})

// 4. File Delete
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
        }
      },
      required: ['path']
    }
  },
  implementation: async (parameters, context = {}) => {
    const {
      path: file_path,
      change_request_id,
      thread_id,
      commit_message,
      change_request_title,
      change_request_description
    } = parameters

    const repo_path = '.' // Assuming operations run from the root of the repo
    const implicit_thread_id = context?.thread_id

    if (change_request_id) {
      // --- Modify Existing Change Request ---
      log(
        `Modifying existing change request ${change_request_id} to delete file ${file_path}`
      )
      let worktree_path = null
      try {
        const cr = await get_change_request({ change_request_id })
        if (!cr || !cr.feature_branch) {
          throw new Error(
            `Change request ${change_request_id} not found or has no feature branch.`
          )
        }
        const branch_name = cr.feature_branch

        worktree_path = await git_ops.create_worktree({
          repo_path,
          branch_name
        })
        log(`Using worktree ${worktree_path} for branch ${branch_name}`)

        const full_file_path = path.resolve(worktree_path, file_path)

        // Check if the file exists before attempting to delete
        try {
          await fs.access(full_file_path)
        } catch (accessError) {
          log(
            `File ${file_path} does not exist in change request ${change_request_id}`
          )
          return {
            success: true,
            message: `File ${file_path} does not exist in change request ${change_request_id}, skipping deletion.`,
            change_request_id
          }
        }

        await fs.unlink(full_file_path)
        log(`Deleted file ${file_path} in worktree`)

        await git_ops.add_files({ worktree_path, files_to_add: [file_path] })
        log(`Staged file deletion ${file_path}`)

        const final_commit_message =
          commit_message || `Delete file ${file_path}`
        await git_ops.commit_changes({
          worktree_path,
          commit_message: final_commit_message
        })
        log(`Committed deletion to branch ${branch_name}`)

        // TODO: Should we update the CR's updated_at timestamp here?

        return {
          success: true,
          message: `File ${file_path} deleted in change request ${change_request_id}.`,
          change_request_id
        }
      } catch (error) {
        log(
          `Error modifying change request ${change_request_id} to delete file ${file_path}:`,
          error
        )
        throw new Error(`Failed to modify change request: ${error.message}`)
      } finally {
        if (worktree_path && worktree_path !== repo_path) {
          log(`Cleaning up worktree ${worktree_path}`)
          await git_ops.remove_worktree({ repo_path, worktree_path })
        }
      }
    } else {
      // --- Create New Change Request ---
      const target_thread_id = thread_id || implicit_thread_id
      if (!target_thread_id) {
        throw new Error(
          'Cannot create change request: No explicit thread_id provided and no thread_id found in context.'
        )
      }

      log(
        `Creating new change request to delete file ${file_path} in thread ${target_thread_id}`
      )

      try {
        const final_cr_title =
          change_request_title || `Delete file ${file_path}`
        const final_cr_description =
          change_request_description ||
          `Automated change request to delete file ${file_path}.`

        // create_change_request handles branch creation, commit, db record, etc.
        const new_cr_id = await create_change_request({
          title: final_cr_title,
          description: final_cr_description,
          creator_id: context?.user_id || 'system:tool', // Get creator from context if possible
          target_branch: 'main', // Assuming main is the ultimate target
          file_changes: [
            { path: file_path, content: null, operation: 'delete' }
          ], // content: null signals deletion
          related_thread_id: target_thread_id,
          // create_github_pr: false, // Default behavior
          tags: ['tool-generated', 'file-delete'] // Add some default tags
        })

        log(
          `Created new change request ${new_cr_id} to delete file ${file_path}`
        )
        return {
          success: true,
          message: `File ${file_path} deletion requested and new change request ${new_cr_id} created.`,
          change_request_id: new_cr_id
        }
      } catch (error) {
        log(`Error creating change request to delete file ${file_path}:`, error)
        throw new Error(`Failed to create change request: ${error.message}`)
      }
    }
  }
})

// 4. File Diff
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
        change_request_id: {
          type: 'string',
          description:
            "Optional: Explicitly target this change request's feature branch (e.g., cr/{change_request_id}). Takes precedence over thread_id."
        }
      }
      // No required properties
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        path: diff_path, // Rename to avoid conflict
        compare_with = 'main',
        format = 'unified',
        thread_id,
        change_request_id
      } = parameters
      const { branch_name, repo_path } = await get_target_branch({
        thread_id,
        change_request_id,
        context
      })

      log(
        `Getting diff for path "${diff_path || 'branch'}" in branch ${branch_name} compared to ${compare_with}`
      )

      const diff = await git_ops.get_diff({
        repo_path,
        from_ref: compare_with,
        to_ref: branch_name,
        path: diff_path,
        format
      })
      return { diff }
    } catch (error) {
      log(
        `Error getting diff for path "${parameters.path}" in branch compared to "${parameters.compare_with}":`,
        error
      )
      throw new Error(`Failed to get diff: ${error.message}`)
    }
  }
})

// 4. File Search
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
        change_request_id: {
          type: 'string',
          description:
            "Optional: Explicitly target this change request's feature branch (e.g., cr/{change_request_id}). Takes precedence over thread_id."
        }
      },
      required: ['query']
    }
  },
  implementation: async (parameters, context = {}) => {
    try {
      const {
        query,
        path: search_path, // Rename to avoid conflict with node 'path' module
        case_sensitive = false,
        thread_id,
        change_request_id
      } = parameters
      const { branch_name, repo_path } = await get_target_branch({
        thread_id,
        change_request_id,
        context
      })

      log(
        `Searching for "${query}" in path "${search_path || 'root'}" within branch ${branch_name}`
      )

      const results = await git_ops.search_repository({
        repo_path,
        query,
        ref: branch_name,
        path: search_path,
        case_sensitive
      })
      return { results, count: results.length }
    } catch (error) {
      log(
        `Error searching for "${parameters.query}" in path "${parameters.path}":`,
        error
      )
      // Git grep returns non-zero exit code if no matches are found, which git_ops handles.
      // Re-throw other errors.
      if (error.message.includes('Failed to search')) {
        throw new Error(`Failed to search files: ${error.message}`)
      }
      // If git_ops didn't throw but something else did
      throw new Error(
        `An unexpected error occurred during search: ${error.message}`
      )
    }
  }
})
