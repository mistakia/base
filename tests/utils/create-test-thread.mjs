import fs from 'fs/promises'
import path from 'path'

import { create_test_user, create_temp_test_repo } from './index.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATE } = thread_constants

/**
 * Creates a test thread with specified parameters
 *
 * @param {Object} options Thread options
 * @param {string} [options.user_public_key] User public key (creates test user if not provided)
 * @param {string} [options.workflow_base_uri='sys:system/workflow/test-workflow.md'] Workflow to use
 * @param {string} [options.inference_provider='ollama'] Inference provider name
 * @param {string} [options.model='llama2'] Model name
 * @param {string} [options.thread_state=THREAD_STATE.ACTIVE] Thread state (active, archived)
 * @param {string} [options.archive_reason] Archive reason if thread_state is archived
 * @param {Object} [options.test_directories] Test directories object with system and user paths
 * @param {Array} [options.initial_timeline=[]] Initial timeline entries
 * @param {string} [options.thread_main_request] Main request for the thread
 * @param {boolean} [options.create_git_branches=false] Whether to create git branches (default false for tests)
 * @returns {Promise<Object>} Created thread info including thread_id, context_dir, and user
 */
export default async function create_test_thread({
  user_public_key,
  workflow_base_uri = 'sys:system/workflow/test-workflow.md',
  inference_provider = 'ollama',
  model = 'llama2',
  thread_state = THREAD_STATE.ACTIVE,
  archive_reason,
  test_directories,
  initial_timeline,
  thread_main_request,
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

  // Extract thread_main_request from initial_timeline if provided and no explicit thread_main_request
  if (!thread_main_request && initial_timeline && initial_timeline.length > 0) {
    thread_main_request = initial_timeline.find(
      (entry) => entry.type === 'thread_main_request'
    )?.content
  }

  // Create the thread using the actual implementation
  const thread = await create_thread({
    user_public_key: user.user_public_key,
    workflow_base_uri,
    inference_provider,
    model,
    thread_state,
    archive_reason,
    thread_main_request,
    create_git_branches
  })

  // Write initial_timeline entries to the timeline.json file if provided
  if (initial_timeline && initial_timeline.length > 0) {
    const timeline_path = path.join(thread.context_dir, 'timeline.json')
    await fs.writeFile(timeline_path, JSON.stringify(initial_timeline, null, 2))
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
