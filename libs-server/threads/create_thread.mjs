import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import {
  get_thread_base_directory,
  THREAD_DEFAULT_ACTIVITY_ID
} from './threads_constants.mjs'
import { thread_constants } from '#libs-shared'
import git_operations from '#libs-server/git/index.mjs'
import { create_change_request } from '#libs-server/change_requests/index.mjs'
import { activity_exists } from '#libs-server/activities/index.mjs'

const { THREAD_STATUS, validate_thread_state } = thread_constants
const log = debug('threads:create')

/**
 * Create a thread branch in the knowledge base repositories
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID
 * @param {string} params.system_base_directory - Path to system knowledge base repo
 * @param {string} params.user_base_directory - Path to user knowledge base repo
 * @returns {Promise<void>}
 */
async function create_thread_branch({
  thread_id,
  system_base_directory,
  user_base_directory
}) {
  const branch_name = `thread/${thread_id}`

  // Create branch in system knowledge base
  log(`Creating branch ${branch_name} in system repo`)
  await git_operations.checkout_branch({
    repo_path: system_base_directory,
    branch_name: 'main'
  })
  await git_operations.create_branch({
    repo_path: system_base_directory,
    branch_name,
    base_branch: 'main'
  })

  // Create branch in user knowledge base
  log(`Creating branch ${branch_name} in user repo`)
  await git_operations.checkout_branch({
    repo_path: user_base_directory,
    branch_name: 'main'
  })
  await git_operations.create_branch({
    repo_path: user_base_directory,
    branch_name,
    base_branch: 'main'
  })
}

/**
 * Initialize a git repository in the memory directory
 *
 * @param {Object} params - Parameters
 * @param {string} params.memory_dir - Path to memory directory
 * @returns {Promise<void>}
 */
async function initialize_memory_repository({ memory_dir }) {
  log(`Initializing git repository in ${memory_dir}`)

  // Initialize git repository using git_operations
  await git_operations.git_init({
    directory: memory_dir
  })

  // Create .gitignore file
  const gitignore_content = `
# Temporary files
*.tmp
*.temp
.DS_Store

# Large binary files
*.bin
*.dat
`
  await fs.writeFile(
    path.join(memory_dir, '.gitignore'),
    gitignore_content.trim(),
    'utf-8'
  )

  // Initial commit
  await git_operations.add_files({
    worktree_path: memory_dir,
    files_to_add: '.gitignore'
  })
  await git_operations.commit_changes({
    worktree_path: memory_dir,
    commit_message: 'Initialize thread memory repository'
  })
}

/**
 * Create a new thread with proper structure
 *
 * @param {Object} params Thread creation parameters
 * @param {string} params.user_id ID of the user who owns the thread
 * @param {string} params.activity_id Activity ID in format [system|user]/<file_path>.md (e.g., system/create_activity.md)
 * @param {string} params.inference_provider Name of inference provider (e.g., 'ollama')
 * @param {string} params.model Model to use from the provider
 * @param {string} [params.state=THREAD_STATUS.ACTIVE] Thread state
 * @param {string} [params.initial_message] Initial user message to add to timeline
 * @param {Array<string>} [params.tools=[]] Tools available for this thread
 * @param {string} [params.system_base_directory] Path to system knowledge base repository
 * @param {string} [params.user_base_directory] Path to user knowledge base repository
 * @param {Object} [params.metadata={}] Additional metadata
 * @returns {Promise<Object>} Created thread object
 */
export default async function create_thread({
  user_id,
  activity_id = THREAD_DEFAULT_ACTIVITY_ID,
  inference_provider,
  model,
  state = THREAD_STATUS.ACTIVE,
  initial_message,
  tools = [],
  user_base_directory,
  system_base_directory,
  // TODO cleanup
  ...additional_metadata
}) {
  // Validate required parameters
  if (!user_id) {
    throw new Error('user_id is required')
  }

  if (!activity_id) {
    throw new Error('activity_id is required')
  }

  if (!inference_provider) {
    throw new Error('inference_provider is required')
  }

  if (!model) {
    throw new Error('model is required')
  }

  // Validate state using shared function
  validate_thread_state(state)

  // Validate that the activity exists
  const activity_file_exists = await activity_exists({
    activity_id,
    system_base_directory,
    user_base_directory
  })

  if (!activity_file_exists) {
    throw new Error(`Activity '${activity_id}' does not exist`)
  }

  // Generate thread ID
  const thread_id = uuid()
  log(
    `Creating thread ${thread_id} for user ${user_id} with activity ${activity_id}`
  )

  // Create thread directory structure
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const thread_dir = path.join(thread_base_directory, thread_id)
  const memory_dir = path.join(thread_dir, 'memory')

  await fs.mkdir(thread_dir, { recursive: true })
  await fs.mkdir(memory_dir, { recursive: true })

  // Generate timestamps
  const now = new Date().toISOString()

  // Create metadata
  const metadata = {
    thread_id,
    user_id,
    activity_id,
    inference_provider,
    model,
    state,
    created_at: now,
    updated_at: now,
    current_stage: null,
    ...additional_metadata
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    metadata.tools = tools
  }

  // Initialize timeline
  const timeline = []

  // Add initial message if provided
  if (initial_message) {
    timeline.push({
      id: `msg_${uuid().split('-')[0]}`,
      timestamp: now,
      type: 'message',
      role: 'user',
      content: initial_message
    })
  }

  // Write timeline to file
  await fs.writeFile(
    path.join(thread_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

  // Create git branches if requested and paths provided
  if (system_base_directory && user_base_directory) {
    try {
      await create_thread_branch({
        thread_id,
        system_base_directory,
        user_base_directory
      })

      // Add branch information to metadata
      metadata.git_branch = `thread/${thread_id}`

      // Create a default change request for this thread if requested
      try {
        const change_request_id = await create_change_request({
          title: `Thread ${thread_id} changes`,
          description: `Default change request for thread ${thread_id}. Contains all changes made in this thread relative to main.`,
          creator_id: user_id,
          target_branch: 'main',
          feature_branch: `thread/${thread_id}`,
          thread_id,
          tags: ['thread-changes', 'auto-generated'],
          repo_path: user_base_directory
        })

        // Add change request information to metadata
        metadata.thread_change_request_id = change_request_id
        log(
          `Created default change request ${change_request_id} for thread ${thread_id}`
        )
      } catch (error) {
        log(`Failed to create default change request: ${error.message}`)
        // Continue thread creation even if change request creation fails
      }
    } catch (error) {
      log(`Failed to create git branches: ${error.message}`)
      // Continue thread creation even if branch creation fails
    }
  }

  // Write metadata to file
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )

  // Initialize git repository in memory directory if requested
  try {
    await initialize_memory_repository({
      memory_dir
    })

    // Add memory repo information to metadata
    metadata.memory_repo_initialized = true
  } catch (error) {
    log(`Failed to initialize memory repository: ${error.message}`)
    // Continue thread creation even if repo initialization fails
  }

  // Return thread information
  return {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }
}
