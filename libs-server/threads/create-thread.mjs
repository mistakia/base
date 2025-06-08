import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import {
  get_thread_base_directory,
  THREAD_DEFAULT_WORKFLOW_BASE_URI
} from './threads-constants.mjs'
import { thread_constants } from '#libs-shared'
import git_operations from '#libs-server/git/index.mjs'
import { create_worktree } from '#libs-server/git/worktree-operations.mjs'
import { create_change_request } from '#libs-server/change-requests/index.mjs'
import { workflow_exists_in_filesystem } from '#libs-server/workflow/index.mjs'
import { get_thread_tool_names } from './thread-tools.mjs'
import {
  get_registered_directories,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

const { THREAD_STATE, validate_thread_state, DEFAULT_THREAD_TOOLS } =
  thread_constants
const log = debug('threads:create')

/**
 * Create a thread branch in the knowledge base repositories and set up worktrees
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID
 * @returns {Promise<Object>} Worktree paths for system and user repos
 */
async function create_thread_branch({ thread_id }) {
  const branch_name = `thread/${thread_id}`
  const worktree_paths = {}

  // Get directories from registry
  const { system_base_directory, user_base_directory } =
    get_registered_directories()

  // Create branch in system knowledge base without checking out
  log(`Creating branch ${branch_name} in system repo`)
  await git_operations.create_branch({
    repo_path: system_base_directory,
    branch_name,
    base_branch: 'main',
    checkout: false
  })

  // Create worktree for system repo
  log(`Creating worktree for branch ${branch_name} in system repo`)
  worktree_paths.system = await create_worktree({
    repo_path: system_base_directory,
    branch_name
  })

  // Create branch in user knowledge base without checking out
  log(`Creating branch ${branch_name} in user repo`)
  await git_operations.create_branch({
    repo_path: user_base_directory,
    branch_name,
    base_branch: 'main',
    checkout: false
  })

  // Create worktree for user repo
  log(`Creating worktree for branch ${branch_name} in user repo`)
  worktree_paths.user = await create_worktree({
    repo_path: user_base_directory,
    branch_name
  })

  return worktree_paths
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
 * @param {string} params.workflow_base_uri Workflow base relative path in format
 * @param {string} params.inference_provider Name of inference provider (e.g., 'ollama')
 * @param {string} params.model Model to use from the provider
 * @param {string} [params.thread_state=THREAD_STATE.ACTIVE] Thread state
 * @param {string} [params.thread_main_request] Initial user request to add to timeline
 * @param {string} [params.prompt_properties] Prompt properties for the workflow
 * @param {Array<string>} [params.tools=[]] Tools available for this thread
 * @param {boolean} [params.create_git_branches=true] Whether to create git branches and worktrees
 * @param {Object} [params.metadata={}] Additional metadata
 * @returns {Promise<Object>} Created thread object
 */
export default async function create_thread({
  user_id,
  workflow_base_uri = THREAD_DEFAULT_WORKFLOW_BASE_URI,
  inference_provider,
  model,
  thread_state = THREAD_STATE.ACTIVE,
  thread_main_request,
  prompt_properties = {},
  tools = DEFAULT_THREAD_TOOLS,
  create_git_branches = true,
  // TODO cleanup
  ...additional_metadata
}) {
  // Validate required parameters
  if (!user_id) {
    throw new Error('user_id is required')
  }

  if (!workflow_base_uri) {
    throw new Error('workflow_base_uri is required')
  }

  if (!inference_provider) {
    throw new Error('inference_provider is required')
  }

  if (!model) {
    throw new Error('model is required')
  }

  // Validate thread_state using shared function
  validate_thread_state(thread_state)

  // Validate that the workflow exists
  // TODO consider using workflow_exists_in_git instead
  const workflow_file_exists = await workflow_exists_in_filesystem({
    base_uri: workflow_base_uri
  })

  if (!workflow_file_exists) {
    throw new Error(`Workflow '${workflow_base_uri}' does not exist`)
  }

  // Get workflow tools list (without registering custom tools yet)
  let workflow_tools = []
  try {
    const { get_workflow_tools } = await import(
      '#libs-server/workflow/index.mjs'
    )

    workflow_tools = await get_workflow_tools({
      workflow_base_uri
    })

    if (workflow_tools.length > 0) {
      log(`Extracted workflow tools: ${workflow_tools.join(', ')}`)
    }
  } catch (error) {
    log(
      `Warning: Could not extract tools from workflow ${workflow_base_uri}: ${error.message}`
    )
    // Continue thread creation even if tool extraction fails
  }

  // Generate thread ID
  const thread_id = uuid()
  log(
    `Creating thread ${thread_id} for user ${user_id} with workflow ${workflow_base_uri}`
  )

  // Create thread directory structure using registry
  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const thread_dir = path.join(thread_base_directory, thread_id)
  const memory_dir = path.join(thread_dir, 'memory')

  await fs.mkdir(thread_dir, { recursive: true })
  await fs.mkdir(memory_dir, { recursive: true })

  // Generate timestamps
  const now = new Date().toISOString()

  // Add thread-specific tools
  const thread_tool_names = get_thread_tool_names()

  // Determine final tools list
  // If workflow defines tools, use those + thread tools, otherwise use provided tools + thread tools
  const final_tools =
    workflow_tools.length > 0
      ? [...workflow_tools, ...thread_tool_names]
      : [...tools, ...thread_tool_names]

  // Create metadata
  const metadata = {
    thread_id,
    user_id,
    workflow_base_uri,
    inference_provider,
    model,
    thread_state,
    created_at: now,
    updated_at: now,
    current_stage: null,
    prompt_properties,
    tools: final_tools,
    ...additional_metadata
  }

  // Initialize timeline
  const timeline = []

  // Add thread main request if provided (optional, now treated as a universal property)
  if (thread_main_request) {
    timeline.push({
      id: `req_${uuid().split('-')[0]}`,
      timestamp: now,
      type: 'thread_main_request',
      content: thread_main_request
    })
    metadata.prompt_properties.main_request = thread_main_request
  }

  // Write timeline to file
  await fs.writeFile(
    path.join(thread_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

  // Create git branches and worktrees if requested
  if (create_git_branches) {
    try {
      const worktree_paths = await create_thread_branch({
        thread_id
      })

      // Add branch and worktree information to metadata
      metadata.git_branch = `thread/${thread_id}`
      metadata.system_worktree_path = worktree_paths.system
      metadata.user_worktree_path = worktree_paths.user

      // Create a default change request for this thread if requested
      try {
        const change_request_id = await create_change_request({
          title: `Thread ${thread_id} changes`,
          description: `Default change request for thread ${thread_id}. Contains all changes made in this thread relative to main.`,
          user_id,
          target_branch: 'main',
          feature_branch: `thread/${thread_id}`,
          thread_id
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
      log(`Failed to create git branches or worktrees: ${error.message}`)
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
