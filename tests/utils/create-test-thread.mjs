import { create_test_user } from './index.mjs'
import create_temp_test_repo from './create-temp-test-repo.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATUS } = thread_constants

/**
 * Creates a test thread with specified parameters
 *
 * @param {Object} options Thread options
 * @param {string} [options.user_id] User ID (creates test user if not provided)
 * @param {string} [options.inference_provider='ollama'] Inference provider name
 * @param {string} [options.model='llama2'] Model name
 * @param {string} [options.state=THREAD_STATUS.ACTIVE] Thread state (active, paused, terminated)
 * @param {string} [options.system_base_directory] System knowledge base directory
 * @param {string} [options.user_base_directory] User knowledge base directory
 * @param {Array} [options.initial_timeline=[]] Initial timeline entries
 * @param {string} [options.thread_main_request] Main request for the thread
 * @returns {Promise<Object>} Created thread info including thread_id, context_dir, and user
 */
export default async function create_test_thread({
  user_id,
  inference_provider = 'ollama',
  model = 'llama2',
  state = THREAD_STATUS.ACTIVE,
  system_base_directory,
  user_base_directory,
  initial_timeline,
  thread_main_request
}) {
  // Create test user if not provided
  const user = user_id ? { user_id } : await create_test_user()

  // Create temporary repos if not provided
  let system_repo
  let user_repo

  if (!system_base_directory) {
    system_repo = await create_temp_test_repo({ prefix: 'system-repo-' })
    system_base_directory = system_repo.path
  }

  if (!user_base_directory) {
    user_repo = await create_temp_test_repo({ prefix: 'user-repo-' })
    user_base_directory = user_repo.path
  }

  // Extract thread_main_request from initial_timeline if provided and no explicit thread_main_request
  if (!thread_main_request && initial_timeline && initial_timeline.length > 0) {
    thread_main_request = initial_timeline.find(
      (entry) => entry.type === 'thread_main_request'
    )?.content
  }

  // Create the thread using the actual implementation
  const thread = await create_thread({
    user_id: user.user_id,
    inference_provider,
    model,
    state,
    thread_main_request,
    system_base_directory,
    user_base_directory
  })

  const cleanup = () => {
    if (system_repo) {
      system_repo.cleanup()
    }
    if (user_repo) {
      user_repo.cleanup()
    }
  }

  return {
    thread_id: thread.thread_id,
    user,
    context_dir: thread.context_dir,
    system_base_directory,
    user_base_directory,
    thread,
    cleanup
  }
}
