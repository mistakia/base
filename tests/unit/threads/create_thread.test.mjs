import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import create_thread from '#libs-server/threads/create_thread.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_directory
} from '#tests/utils/index.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATUS } = thread_constants

// set up temp directory for threads
const temp_dir = create_temp_test_directory('create_thread_test_')

describe('create_thread', () => {
  let test_user

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()

    if (temp_dir) {
      temp_dir.cleanup()
    }
  })

  it('should create a thread with minimal required parameters', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      thread_base_directory: temp_dir.path
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created with proper structure
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')

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
  })

  it('should create a thread with an initial message', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      initial_message: 'Hello, this is my first message',
      thread_base_directory: temp_dir.path
    }

    const thread = await create_thread(thread_data)

    // Check timeline file
    const timeline_path = path.join(thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)
    expect(timeline[0].type).to.equal('message')
    expect(timeline[0].role).to.equal('user')
    expect(timeline[0].content).to.equal('Hello, this is my first message')
  })

  it('should create a thread with custom tools', async () => {
    const thread_data = {
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2',
      tools: ['web_search', 'calculator'],
      thread_base_directory: temp_dir.path
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
      thread_base_directory: temp_dir.path
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
      thread_base_directory: temp_dir.path
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
      thread_base_directory: temp_dir.path
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
