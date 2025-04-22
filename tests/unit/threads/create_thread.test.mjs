import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import create_thread from '#libs-server/threads/create_thread.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import { thread_constants } from '#libs-shared'
import git_operations from '#libs-server/git/index.mjs'

const { THREAD_STATUS } = thread_constants

describe('create_thread', () => {
  let test_user
  let system_repo
  let user_repo

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create test git repositories
    system_repo = await create_temp_test_repo({
      prefix: 'system-repo-test-'
    })

    user_repo = await create_temp_test_repo({
      prefix: 'user-repo-test-'
    })
  })

  after(async () => {
    await reset_all_tables()

    // Clean up git repositories
    if (system_repo) {
      system_repo.cleanup()
    }

    if (user_repo) {
      user_repo.cleanup()
    }
  })

  it('should create a thread with minimal required parameters', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created with proper structure
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')
    expect(thread.git_branch).to.equal(`thread/${thread.thread_id}`)

    // Check that thread context directory exists
    const thread_dir = path.join(thread.context_dir)
    const dir_exists = await fs
      .access(thread_dir)
      .then(() => true)
      .catch(() => false)
    expect(dir_exists).to.be.true

    // Check metadata file
    const metadata_path = path.join(thread_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.thread_id).to.equal(thread.thread_id)
    expect(metadata.user_id).to.equal(test_user.user_id)
    expect(metadata.inference_provider).to.equal('ollama')
    expect(metadata.model).to.equal('llama2')
    expect(metadata.state).to.equal(THREAD_STATUS.ACTIVE)
    expect(metadata.created_at).to.be.a('string')
    expect(metadata.git_branch).to.equal(`thread/${thread.thread_id}`)

    // Check timeline file
    const timeline_path = path.join(thread_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.be.empty

    // Check memory directory
    const memory_dir = path.join(thread_dir, 'memory')
    const memory_dir_exists = await fs
      .access(memory_dir)
      .then(() => true)
      .catch(() => false)
    expect(memory_dir_exists).to.be.true

    // Verify git branches were created in both repos
    const branch_name = `thread/${thread.thread_id}`

    // Check system repo branch
    await git_operations.checkout_branch({
      repo_path: system_repo.path,
      branch_name
    })

    // Check user repo branch
    await git_operations.checkout_branch({
      repo_path: user_repo.path,
      branch_name
    })
  })

  it('should create a thread with a main request', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      thread_main_request: 'Hello, this is my first message',
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    const thread = await create_thread(thread_data)

    // Check timeline file
    const timeline_path = path.join(thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)
    expect(timeline[0].type).to.equal('thread_main_request')
    expect(timeline[0].content).to.equal('Hello, this is my first message')
  })

  it('should create a thread with custom tools', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      tools: ['web_search', 'calculator'],
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.tools).to.be.an('array')
    expect(metadata.tools).to.have.members(['web_search', 'calculator'])
  })

  it('should create a thread with a specified state', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      state: THREAD_STATUS.PAUSED,
      pause_reason: 'waiting_for_user_input',
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.state).to.equal(THREAD_STATUS.PAUSED)
    expect(metadata.pause_reason).to.equal('waiting_for_user_input')
  })

  it('should reject invalid thread parameters', async () => {
    const invalid_thread_data = {
      // Missing user_id
      inference_provider: 'ollama',
      model: 'llama2',
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    try {
      await create_thread(invalid_thread_data)
      // Should not reach here
      expect.fail('Should have thrown an error for missing user_id')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('user_id')
    }
  })

  it('should reject invalid state transitions', async () => {
    const invalid_state_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      state: 'invalid_state', // Invalid state value
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path
    }

    try {
      await create_thread(invalid_state_data)
      // Should not reach here
      expect.fail('Should have thrown an error for invalid state')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('state')
    }
  })
})
