import { v5 as uuidv5 } from 'uuid'
import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import { execSync } from 'child_process'

const log = debug('integrations:thread:create-from-session')

// Namespace UUID for generating deterministic thread IDs from session IDs
const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

export const generate_thread_id_from_session = (session_id, provider = 'unknown') => {
  // Create deterministic UUID from session ID and provider
  const session_key = `${provider}:${session_id}`
  return uuidv5(session_key, SESSION_NAMESPACE)
}

export const create_thread_from_session = async (normalized_session, {
  user_id = '40503950-32bc-11f0-80a5-7c10c941e0a3', // Default user ID from task
  user_base_directory = process.env.USER_BASE_DIRECTORY || '/Users/trashman/user-base',
  system_base_directory = process.env.SYSTEM_BASE_DIRECTORY,
  inference_provider = 'anthropic',
  model = 'claude-sonnet-4-20250514'
} = {}) => {
  try {
    const thread_id = generate_thread_id_from_session(normalized_session.session_id, normalized_session.provider)

    log(`Creating thread ${thread_id} from ${normalized_session.provider} session ${normalized_session.session_id}`)

    // Create thread directory structure
    const thread_dir = path.join(user_base_directory, 'thread', thread_id)
    const memory_dir = path.join(thread_dir, 'memory')

    await fs.mkdir(thread_dir, { recursive: true })
    await fs.mkdir(memory_dir, { recursive: true })

    // Initialize git repository in memory directory
    await init_thread_git_repository(memory_dir)

    // Create thread metadata
    const metadata = create_thread_metadata({
      thread_id,
      user_id,
      normalized_session,
      inference_provider,
      model
    })

    // Write metadata.json
    const metadata_path = path.join(thread_dir, 'metadata.json')
    await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

    log(`Created thread metadata at ${metadata_path}`)

    return {
      thread_id,
      thread_dir,
      memory_dir,
      metadata_path,
      metadata
    }
  } catch (error) {
    log(`Error creating thread from session: ${error.message}`)
    throw error
  }
}

const init_thread_git_repository = async (memory_dir) => {
  try {
    log(`Initializing git repository in ${memory_dir}`)

    // Initialize git repository
    execSync('git init', { cwd: memory_dir, stdio: 'pipe' })

    // Create .gitignore file
    const gitignore_content = `# Thread memory gitignore
*.tmp
*.temp
*.log
.DS_Store
node_modules/
*.sqlite
*.db
`

    const gitignore_path = path.join(memory_dir, '.gitignore')
    await fs.writeFile(gitignore_path, gitignore_content)

    // Initial commit
    execSync('git add .gitignore', { cwd: memory_dir, stdio: 'pipe' })
    execSync('git commit -m "Initial thread memory setup"', { cwd: memory_dir, stdio: 'pipe' })

    log(`Git repository initialized in ${memory_dir}`)
  } catch (error) {
    log(`Error initializing git repository: ${error.message}`)
    // Don't throw - git initialization is nice to have but not critical
  }
}

const create_thread_metadata = ({
  thread_id,
  user_id,
  normalized_session,
  inference_provider,
  model
}) => {
  const now = new Date().toISOString()

  return {
    thread_id,
    user_id,
    workflow_base_uri: 'sys:system/workflow/external-session-import.md', // We'll need to create this workflow
    inference_provider,
    model,
    thread_state: 'terminated', // Sessions are already complete
    created_at: normalized_session.metadata.start_time || now,
    updated_at: normalized_session.metadata.end_time || now,
    terminated_at: normalized_session.metadata.end_time || now,
    termination_reason: 'session_import_complete',
    tools: [], // External sessions don't have active tools
    thread_change_request_id: null, // No change request for imports
    system_worktree_path: null, // No active worktree for completed sessions
    user_worktree_path: null,
    external_session: {
      provider: normalized_session.provider,
      session_id: normalized_session.session_id,
      imported_at: now,
      source_metadata: normalized_session.metadata
    }
  }
}

export const check_thread_exists = async (session_id, provider, user_base_directory) => {
  try {
    const thread_id = generate_thread_id_from_session(session_id, provider)
    const thread_dir = path.join(user_base_directory, 'thread', thread_id)

    const stats = await fs.stat(thread_dir)
    return {
      exists: stats.isDirectory(),
      thread_id,
      thread_dir
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        thread_id: generate_thread_id_from_session(session_id, provider),
        thread_dir: null
      }
    }
    throw error
  }
}

export const create_threads_from_sessions = async (normalized_sessions, options = {}) => {
  log(`Creating threads from ${normalized_sessions.length} sessions`)

  const results = {
    created: [],
    skipped: [],
    failed: []
  }

  for (const session of normalized_sessions) {
    try {
      // Check if thread already exists
      const { exists, thread_id } = await check_thread_exists(
        session.session_id,
        session.provider,
        options.user_base_directory || process.env.USER_BASE_DIRECTORY || '/Users/trashman/user-base'
      )

      if (exists) {
        log(`Thread ${thread_id} already exists for session ${session.session_id}, skipping`)
        results.skipped.push({
          session_id: session.session_id,
          thread_id,
          reason: 'thread_already_exists'
        })
        continue
      }

      // Create thread
      const thread_result = await create_thread_from_session(session, options)
      results.created.push({
        session_id: session.session_id,
        thread_id: thread_result.thread_id,
        thread_dir: thread_result.thread_dir
      })

      log(`Successfully created thread ${thread_result.thread_id} for session ${session.session_id}`)
    } catch (error) {
      log(`Failed to create thread for session ${session.session_id}: ${error.message}`)
      results.failed.push({
        session_id: session.session_id,
        error: error.message
      })
    }
  }

  log(`Thread creation complete: ${results.created.length} created, ${results.skipped.length} skipped, ${results.failed.length} failed`)
  return results
}
