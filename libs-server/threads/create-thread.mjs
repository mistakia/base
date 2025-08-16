import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import { get_thread_base_directory } from './threads-constants.mjs'
import { thread_constants } from '#libs-shared'
import git_operations from '#libs-server/git/index.mjs'
import { create_worktree } from '#libs-server/git/worktree-operations.mjs'
import {
  workflow_exists_in_filesystem,
  get_workflow_tools
} from '#libs-server/workflow/index.mjs'
import { get_thread_tool_names } from './thread-tools.mjs'
import { generate_thread_id_from_session } from './generate-thread-id-from-session.mjs'
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
 * Build thread metadata for both standard and imported/external session threads
 * @param {Object} params - Metadata parameters
 * @param {string} params.thread_id
 * @param {string} params.user_public_key
 * @param {string} params.workflow_base_uri
 * @param {string} params.inference_provider
 * @param {string|Array<string>} params.model - Single model or array of models (legacy)
 * @param {Array<string>} [params.models] - Array of models used in thread (preferred)
 * @param {string} params.thread_state
 * @param {Object} params.prompt_properties
 * @param {Array<string>} params.tools
 * @param {Object} [params.external_session] - Optional external session info
 * @param {Object} [params.additional_fields] - Any additional fields to merge
 * @param {string} [params.created_at] - Optional override for created_at timestamp (ISO string)
 * @param {string} [params.updated_at] - Optional override for updated_at timestamp (ISO string)
 * @returns {Object} Thread metadata object
 */
export function build_thread_metadata({
  thread_id,
  user_public_key,
  workflow_base_uri,
  inference_provider,
  model,
  models,
  thread_state,
  prompt_properties = {},
  tools = [],
  external_session = null,
  additional_fields = {},
  created_at = null,
  updated_at = null
}) {
  const now = new Date().toISOString()

  // Handle both single model and models array
  let models_array
  if (models && Array.isArray(models)) {
    models_array = models
  } else if (model) {
    // Convert single model to array
    models_array = Array.isArray(model) ? model : [model]
  } else {
    models_array = []
  }

  const metadata = {
    thread_id,
    user_public_key,
    workflow_base_uri,
    inference_provider,
    models: models_array,
    thread_state,
    created_at: created_at || now,
    updated_at: updated_at || now,
    prompt_properties,
    tools,
    ...additional_fields
  }
  if (external_session) {
    metadata.external_session = external_session
  }
  return metadata
}

/**
 * Create a new thread with proper structure
 *
 * @param {Object} params Thread creation parameters
 * @param {string} params.user_public_key Public key of the user who owns the thread
 * @param {string} params.workflow_base_uri Workflow base relative path in format (required for non-external sessions)
 * @param {string} params.inference_provider Name of inference provider (e.g., 'ollama')
 * @param {string} [params.model] Model to use from the provider (legacy, single model)
 * @param {Array<string>} [params.models] Models used in the thread (preferred)
 * @param {string} [params.thread_state=THREAD_STATE.ACTIVE] Thread state
 * @param {string} [params.thread_main_request] Initial user request to add to timeline
 * @param {string} [params.prompt_properties] Prompt properties for the workflow
 * @param {Array<string>} [params.tools=[]] Tools available for this thread
 * @param {boolean} [params.create_git_branches=false] Whether to create git branches and worktrees
 * @param {boolean} [params.create_memory_repository=false] Whether to initialize git repository in memory directory
 * @param {Object} [params.external_session] External session information for imported sessions
 * @param {Object} [params.additional_metadata={}] Additional metadata fields to include in thread metadata
 * @param {string} [params.created_at] Optional override for created_at timestamp (ISO string)
 * @param {string} [params.updated_at] Optional override for updated_at timestamp (ISO string)
 * @returns {Promise<Object>} Created thread object
 */
export default async function create_thread({
  user_public_key,
  workflow_base_uri,
  inference_provider,
  model,
  models,
  thread_state = THREAD_STATE.ACTIVE,
  thread_main_request,
  prompt_properties = {},
  tools = DEFAULT_THREAD_TOOLS,
  create_git_branches = false,
  create_memory_repository = false,
  external_session = null,
  additional_metadata = {},
  created_at = null,
  updated_at = null
}) {
  // Validate required parameters
  if (!user_public_key) {
    throw new Error('user_public_key is required')
  }

  if (!inference_provider) {
    throw new Error('inference_provider is required')
  }

  // Validate that we have at least one model
  if (!model && (!models || models.length === 0)) {
    throw new Error('At least one model is required')
  }

  // Validate thread_state using shared function
  validate_thread_state(thread_state)

  // For external sessions, workflow_base_uri can be undefined
  const is_external_session = !!external_session
  if (!is_external_session && !workflow_base_uri) {
    throw new Error(
      'workflow_base_uri is required for non-external session threads'
    )
  }

  // Validate that the workflow exists (if provided)
  if (workflow_base_uri) {
    // TODO consider using workflow_exists_in_git instead
    const workflow_file_exists = await workflow_exists_in_filesystem({
      base_uri: workflow_base_uri
    })

    if (!workflow_file_exists) {
      throw new Error(`Workflow '${workflow_base_uri}' does not exist`)
    }
  }

  // Get workflow tools list (without registering custom tools yet)
  let workflow_tools = []
  if (workflow_base_uri) {
    try {
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
  }

  // Generate thread ID
  let thread_id
  if (is_external_session) {
    thread_id = generate_thread_id_from_session({
      session_id: external_session.session_id,
      session_provider: external_session.session_provider
    })
    log(
      `Creating thread ${thread_id} from ${external_session.session_provider} session ${external_session.session_id}`
    )
  } else {
    thread_id = uuid()
    log(
      `Creating thread ${thread_id} for user ${user_public_key} with workflow ${workflow_base_uri}`
    )
  }

  // Create thread directory structure using registry
  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const thread_dir = path.join(thread_base_directory, thread_id)
  const memory_dir = path.join(thread_dir, 'memory')
  const raw_data_dir = path.join(thread_dir, 'raw-data')

  await fs.mkdir(thread_dir, { recursive: true })
  await fs.mkdir(memory_dir, { recursive: true })

  // Create raw-data directory for external sessions
  if (external_session) {
    await fs.mkdir(raw_data_dir, { recursive: true })
  }

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

  // Create metadata using shared builder
  const metadata = build_thread_metadata({
    thread_id,
    user_public_key,
    workflow_base_uri,
    inference_provider,
    model,
    models,
    thread_state,
    prompt_properties,
    tools: final_tools,
    external_session,
    additional_fields: additional_metadata,
    created_at,
    updated_at
  })

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

  // Write timeline to file (only if we have timeline content or it's not an external session)
  if (timeline.length > 0 || !external_session) {
    await fs.writeFile(
      path.join(thread_dir, 'timeline.json'),
      JSON.stringify(timeline, null, 2),
      'utf-8'
    )
  }

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
  if (create_memory_repository) {
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
  }

  // Return thread information
  const result = {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }

  // Provide backward compatibility for model field
  if (metadata.models && metadata.models.length > 0 && !metadata.model) {
    result.model = metadata.models[0]
  }

  // Add raw_data_dir for external sessions
  if (external_session) {
    result.raw_data_dir = raw_data_dir
  }

  return result
}
