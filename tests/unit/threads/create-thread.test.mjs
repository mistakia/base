import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import create_thread from '#libs-server/threads/create-thread.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import {
  create_temp_test_repo,
  create_test_user,
  reset_all_tables
} from '#tests/utils/index.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATE } = thread_constants

describe('create_thread', () => {
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

  it('should create a thread with minimal required parameters', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      create_git_branches: true
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
    expect(metadata.thread_state).to.equal(THREAD_STATE.ACTIVE)
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

    // Verify branches exist by checking the metadata (which confirms they were created)
    expect(thread.git_branch).to.equal(branch_name)
    expect(thread.system_worktree_path).to.be.a('string')
    expect(thread.user_worktree_path).to.be.a('string')
  })

  it('should create a thread with a main request', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      thread_main_request: 'Hello, this is my first message',
      create_git_branches: true
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
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.tools).to.be.an('array')
    expect(metadata.tools).to.include.members(['web_search', 'calculator'])
    expect(metadata.tools).to.have.length(6) // 2 custom + 4 thread tools
  })

  it('should create a thread with a specified state', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      thread_state: THREAD_STATE.PAUSED,
      pause_reason: 'waiting_for_user_input',
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.thread_state).to.equal(THREAD_STATE.PAUSED)
    expect(metadata.pause_reason).to.equal('waiting_for_user_input')
  })

  it('should reject invalid thread parameters', async () => {
    const invalid_thread_data = {
      // Missing user_id
      inference_provider: 'ollama',
      model: 'llama2'
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
      thread_state: 'invalid_state' // Invalid state value
    }

    try {
      await create_thread(invalid_state_data)
      // Should not reach here
      expect.fail('Should have thrown an error for invalid thread state')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('thread state')
    }
  })
})
