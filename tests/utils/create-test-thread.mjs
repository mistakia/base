import path from 'path'

import { create_test_user, create_temp_test_repo } from './index.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { thread_constants } from '#libs-shared'
import { write_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'
import { is_sqlite_initialized } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { upsert_thread_to_sqlite } from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'

const { THREAD_STATE } = thread_constants

/**
 * Creates a test thread with specified parameters
 *
 * @param {Object} options Thread options
 * @param {string} [options.user_public_key] User public key (creates test user if not provided)
 * @param {string} [options.workflow_base_uri='sys:system/workflow/test-workflow.md'] Workflow to use
 * @param {string} [options.inference_provider='ollama'] Inference provider name
 * @param {Array<string>} [options.models=['llama2']] Model names
 * @param {string} [options.thread_state=THREAD_STATE.ACTIVE] Thread state (active, archived)
 * @param {string} [options.archive_reason] Archive reason if thread_state is archived
 * @param {Object} [options.test_directories] Test directories object with system and user paths
 * @param {Array} [options.initial_timeline=[]] Initial timeline entries
 * @param {boolean} [options.create_git_branches=false] Whether to create git branches (default false for tests)
 * @returns {Promise<Object>} Created thread info including thread_id, context_dir, and user
 */
export default async function create_test_thread({
  user_public_key,
  workflow_base_uri = 'sys:system/workflow/test-workflow.md',
  inference_provider = 'ollama',
  models = ['llama2'],
  thread_state = THREAD_STATE.ACTIVE,
  archive_reason,
  test_directories,
  initial_timeline,
  create_git_branches = false
}) {
  // Create test user if not provided
  const user = user_public_key ? { user_public_key } : await create_test_user()

  // Setup test directories if not provided
  let temp_repo
  if (!test_directories) {
    // Use create_temp_test_repo to ensure workflow files are present
    temp_repo = await create_temp_test_repo({
      prefix: 'thread-system-',
      register_directories: true
    })
    test_directories = {
      system_path: temp_repo.system_path,
      user_path: temp_repo.user_path
    }
  } else {
    // If directories are provided, register them
    register_base_directories({
      system_base_directory: test_directories.system_path,
      user_base_directory: test_directories.user_path
    })
  }

  // Create the thread using the actual implementation
  const thread = await create_thread({
    user_public_key: user.user_public_key,
    workflow_base_uri,
    inference_provider,
    models,
    thread_state,
    archive_reason,
    create_git_branches
  })

  // Write initial_timeline entries to the timeline.jsonl file if provided.
  // Stamp schema_version on any entry that does not already carry one so
  // tests mirror the production backstop in add-timeline-entry.
  if (initial_timeline && initial_timeline.length > 0) {
    const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')
    const stamped = initial_timeline.map((entry) =>
      entry.schema_version === undefined
        ? { ...entry, schema_version: TIMELINE_SCHEMA_VERSION }
        : entry
    )
    await write_timeline_jsonl({ timeline_path, entries: stamped })
  }

  // When a test initializes the SQLite module-level handle (via
  // initialize_sqlite_client), mirror the thread row into SQLite so route
  // handlers that query via embedded_index_manager observe the test thread.
  // Tests that do not initialize SQLite are unaffected.
  if (is_sqlite_initialized()) {
    const now = new Date().toISOString()
    try {
      await upsert_thread_to_sqlite({
        thread_data: {
          thread_id: thread.thread_id,
          title: thread.title || null,
          short_description: null,
          thread_state,
          archived_at: archive_reason ? now : null,
          archive_reason: archive_reason || null,
          created_at: now,
          updated_at: now,
          user_public_key: user.user_public_key,
          inference_provider,
          primary_model: models?.[0] || null,
          message_count: 0,
          user_message_count: 0,
          assistant_message_count: 0,
          tool_call_count: 0
        }
      })
    } catch {
      // Test may not have created the sqlite schema; leave it to the test.
    }
  }

  const cleanup = () => {
    if (temp_repo) {
      temp_repo.cleanup()
    }
  }

  return {
    thread_id: thread.thread_id,
    user,
    context_dir: thread.context_dir,
    system_base_directory: test_directories.system_path,
    user_base_directory: test_directories.user_path,
    thread,
    cleanup
  }
}
