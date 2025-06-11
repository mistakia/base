import { expect } from 'chai'

import create_thread from '#libs-server/threads/create-thread.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import {
  create_temp_test_repo,
  create_test_user,
  reset_all_tables
} from '#tests/utils/index.mjs'
import { thread_constants } from '#libs-shared'

describe('create_thread - no automatic change requests', () => {
  let test_user
  let test_repo

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create test git repositories (both system and user)
    test_repo = await create_temp_test_repo({
      prefix: 'thread-test-repo-',
      register_directories: false
    })

    // Register test directories with the registry
    register_base_directories({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    await reset_all_tables()

    // Clean up git repositories
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should not create a change request automatically when create_git_branches is true', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created with git branches
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')
    expect(thread.git_branch).to.equal(`thread/${thread.thread_id}`)
    expect(thread.system_worktree_path).to.be.a('string')
    expect(thread.user_worktree_path).to.be.a('string')

    // Verify NO change request was created automatically
    expect(thread.thread_change_request_id).to.be.undefined
  })

  it('should still support creating threads without git branches', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      create_git_branches: false
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created without git branches
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')
    expect(thread.git_branch).to.be.undefined
    expect(thread.system_worktree_path).to.be.undefined
    expect(thread.user_worktree_path).to.be.undefined
    expect(thread.thread_change_request_id).to.be.undefined
  })

  it('should create a change request when explicitly requested', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      create_git_branches: true,
      create_change_request: true
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created with git branches and change request
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')
    expect(thread.git_branch).to.equal(`thread/${thread.thread_id}`)
    expect(thread.system_worktree_path).to.be.a('string')
    expect(thread.user_worktree_path).to.be.a('string')
    expect(thread.thread_change_request_id).to.be.a('string')
  })
})
