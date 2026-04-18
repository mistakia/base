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
import { generate_thread_id_from_session } from './generate-thread-id-from-session.mjs'
import {
  get_registered_directories,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'
import { write_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

const { THREAD_STATE, validate_thread_state } = thread_constants
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
 * Build thread metadata for both standard and imported/external session threads
 * @param {Object} params - Metadata parameters
 * @param {string} params.thread_id
 * @param {string} params.user_public_key
 * @param {string} params.workflow_base_uri
 * @param {string} params.inference_provider
 * @param {Array<string>} [params.models] - Array of models used in thread
 * @param {string} params.thread_state
 * @param {Object} params.prompt_properties
 * @param {Array<string>} params.tools
 * @param {Object} [params.source] - Optional source info (provider, session_id, etc.)
 * @param {Object} [params.additional_fields] - Any additional fields to merge
 * @param {string} [params.created_at] - Optional override for created_at timestamp (ISO string)
 * @param {string} [params.updated_at] - Optional override for updated_at timestamp (ISO string)
 * @param {string} [params.title] - Optional human-readable title for the thread
 * @param {string} [params.short_description] - Optional brief description of the thread
 * @returns {Object} Thread metadata object
 */
export function build_thread_metadata({
  thread_id,
  user_public_key,
  workflow_base_uri,
  inference_provider,
  models,
  thread_state,
  prompt_properties = {},
  tools = [],
  source = null,
  additional_fields = {},
  created_at = null,
  updated_at = null,
  title = null,
  short_description = null
}) {
  const now = new Date().toISOString()

  const models_array = models && Array.isArray(models) ? models : []

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
    tools_used: [],
    bash_commands_used: [],
    ...additional_fields
  }

  // Set source if provided
  if (source) {
    metadata.source = source
  }

  // Add title and description if provided
  if (title) {
    metadata.title = title
  }
  if (short_description) {
    metadata.short_description = short_description
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
 * @param {Array<string>} [params.models] Models used in the thread
 * @param {string} [params.thread_state=THREAD_STATE.ACTIVE] Thread state
 * @param {Object} [params.initial_timeline_entry] Optional first timeline entry written atomically with thread creation
 * @param {string} [params.prompt_properties] Prompt properties for the workflow
 * @param {Array<string>} [params.tools=[]] Tools available for this thread
 * @param {boolean} [params.create_git_branches=false] Whether to create git branches and worktrees
 * @param {Object} [params.source] Source information (provider, session_id, etc.)
 * @param {Object} [params.additional_metadata={}] Additional metadata fields to include in thread metadata
 * @param {string} [params.created_at] Optional override for created_at timestamp (ISO string)
 * @param {string} [params.updated_at] Optional override for updated_at timestamp (ISO string)
 * @param {string} [params.title] Optional human-readable title for the thread
 * @param {string} [params.short_description] Optional brief description of the thread
 * @param {string} [params.thread_id] Optional explicit thread_id (for pre-created threads). Mutually exclusive with source.session_id.
 * @returns {Promise<Object>} Created thread object
 */
export default async function create_thread({
  user_public_key,
  workflow_base_uri,
  inference_provider,
  models,
  thread_state = THREAD_STATE.ACTIVE,
  initial_timeline_entry = null,
  prompt_properties = {},
  tools = [],
  create_git_branches = false,
  source = null,
  additional_metadata = {},
  created_at = null,
  updated_at = null,
  title = null,
  short_description = null,
  thread_id = null
}) {
  const is_pre_created = !!thread_id

  // Validate mutually exclusive ID strategies
  if (thread_id && source?.session_id) {
    throw new Error(
      'Cannot provide both explicit thread_id and source.session_id -- explicit thread_id is for pre-created threads, source.session_id implies deterministic ID generation'
    )
  }

  // Validate required parameters
  if (!user_public_key) {
    throw new Error('user_public_key is required')
  }

  if (!inference_provider) {
    throw new Error('inference_provider is required')
  }

  // Validate that we have at least one model
  // Allow empty models for external sessions (in-progress import before model responds)
  if ((!models || models.length === 0) && !source && !is_pre_created) {
    throw new Error('At least one model is required (pass models array)')
  }

  // Validate thread_state using shared function
  validate_thread_state(thread_state)

  // Validate title format and length constraints
  if (title !== null) {
    if (typeof title !== 'string') {
      throw new Error('title must be a string')
    }
    if (title.length === 0) {
      throw new Error('title cannot be empty')
    }
  }

  // Validate description format and length constraints
  if (short_description !== null) {
    if (typeof short_description !== 'string') {
      throw new Error('short_description must be a string')
    }
    if (short_description.length === 0) {
      throw new Error('short_description cannot be empty')
    }
  }

  // For external/imported sessions, workflow_base_uri can be undefined
  const is_external_session = !!source
  if (!is_external_session && !workflow_base_uri && !is_pre_created) {
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

  // Generate thread ID -- three mutually exclusive strategies:
  // 1. Explicit thread_id from caller (pre-created threads)
  // 2. Deterministic UUIDv5 from source.session_id (external session import)
  // 3. Random UUIDv4 (native workflow threads)
  if (thread_id) {
    log(
      `Creating pre-created thread ${thread_id} for user ${user_public_key}`
    )
  } else if (is_external_session) {
    thread_id = generate_thread_id_from_session({
      session_id: source.session_id,
      session_provider: source.provider
    })
    log(
      `Creating thread ${thread_id} from ${source.provider} session ${source.session_id}`
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
  const raw_data_dir = path.join(thread_dir, 'raw-data')
  const metadata_path = path.join(thread_dir, 'metadata.json')

  // Generate timestamps
  const now = new Date().toISOString()

  // Determine final tools list
  // If workflow defines tools, use those, otherwise use provided tools
  const final_tools = workflow_tools.length > 0 ? workflow_tools : tools

  // Build metadata up front so it can be written as the first filesystem
  // artifact inside thread_dir. metadata.json is the atomic lifecycle anchor
  // for the directory -- no other files (raw-data/, timeline.jsonl) may exist
  // without it, and its absence is the cross-machine deletion signal.
  const metadata = build_thread_metadata({
    thread_id,
    user_public_key,
    workflow_base_uri,
    inference_provider,
    models,
    thread_state,
    prompt_properties,
    tools: final_tools,
    source,
    additional_fields: additional_metadata,
    created_at,
    updated_at,
    title,
    short_description
  })

  await fs.mkdir(thread_dir, { recursive: true })

  try {
    await fs.writeFile(
      metadata_path,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    )
  } catch (error) {
    // Tear down the freshly-created directory so no metadata-less shell survives
    await fs.rm(thread_dir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  // Create raw-data directory for external sessions (after metadata.json)
  if (source) {
    await fs.mkdir(raw_data_dir, { recursive: true })
  }

  // Write the initial timeline entry atomically with thread creation when
  // provided. The file is otherwise created on first append by the caller;
  // external sessions get their timeline from the import pipeline.
  const timeline = initial_timeline_entry
    ? [
        {
          ...initial_timeline_entry,
          id: initial_timeline_entry.id || `msg_${uuid().split('-')[0]}`,
          timestamp: initial_timeline_entry.timestamp || now,
          schema_version: TIMELINE_SCHEMA_VERSION
        }
      ]
    : []
  if (timeline.length > 0) {
    await write_timeline_jsonl({
      timeline_path: path.join(thread_dir, 'timeline.jsonl'),
      entries: timeline
    })
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

      // Rewrite metadata.json with the worktree paths now populated
      await fs.writeFile(
        metadata_path,
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )
    } catch (error) {
      log(`Failed to create git branches or worktrees: ${error.message}`)
      // Continue thread creation even if branch creation fails
    }
  }

  // Return thread information
  const result = {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }

  // Add raw_data_dir for external sessions
  if (source) {
    result.raw_data_dir = raw_data_dir
  }

  return result
}
