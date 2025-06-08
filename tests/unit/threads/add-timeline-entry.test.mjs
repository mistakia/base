import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import add_timeline_entry from '#libs-server/threads/add-timeline-entry.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
import timeline_fixtures from '#tests/fixtures/threads/timeline-entries.json' with { type: 'json' }

describe('add_timeline_entry', () => {
  let test_user
  let test_thread

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  beforeEach(async () => {
    // Create a fresh thread for each test
    test_thread = await create_test_thread({
      user_id: test_user.user_id
    })
  })

  afterEach(async () => {
    test_thread.cleanup()
  })

  after(async () => {
    await reset_all_tables()
  })

  it('should add a user message to the timeline', async () => {
    const user_message = timeline_fixtures.find(
      (f) => f.name === 'user_message'
    ).entry

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: user_message
    })

    // Verify entry was added to timeline
    const timeline_path = path.join(test_thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(user_message.id)
    expect(added_entry.type).to.equal('message')
    expect(added_entry.role).to.equal('user')
    expect(added_entry.content).to.equal(user_message.content)
  })

  it('should add an assistant message to the timeline', async () => {
    const assistant_message = timeline_fixtures.find(
      (f) => f.name === 'assistant_message'
    ).entry

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: assistant_message
    })

    // Verify entry was added to timeline
    const timeline_path = path.join(test_thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(assistant_message.id)
    expect(added_entry.type).to.equal('message')
    expect(added_entry.role).to.equal('assistant')
    expect(added_entry.content).to.equal(assistant_message.content)
  })

  it('should add a tool call entry to the timeline', async () => {
    const tool_call = timeline_fixtures.find(
      (f) => f.name === 'tool_call'
    ).entry

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: tool_call
    })

    // Verify entry was added to timeline
    const timeline_path = path.join(test_thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(tool_call.id)
    expect(added_entry.type).to.equal('tool_call')
    expect(added_entry.tool_name).to.equal(tool_call.tool_name)
    expect(added_entry.parameters).to.deep.equal(tool_call.parameters)
  })

  it('should add a tool result entry to the timeline', async () => {
    const tool_result = timeline_fixtures.find(
      (f) => f.name === 'tool_result'
    ).entry

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: tool_result
    })

    // Verify entry was added to timeline
    const timeline_path = path.join(test_thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(tool_result.id)
    expect(added_entry.type).to.equal('tool_result')
    expect(added_entry.tool_call_id).to.equal(tool_result.tool_call_id)
    expect(added_entry.result).to.deep.equal(tool_result.result)
  })

  it('should add multiple entries in order', async () => {
    const entries = timeline_fixtures.find(
      (f) => f.name === 'conversation_sample'
    ).entries

    // Add each entry in sequence
    for (const entry of entries) {
      await add_timeline_entry({
        thread_id: test_thread.thread_id,
        entry
      })
    }

    // Verify all entries were added in order
    const timeline_path = path.join(test_thread.context_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(entries.length)

    // Check entries were added in correct order
    for (let i = 0; i < entries.length; i++) {
      expect(timeline[i].id).to.equal(entries[i].id)
      expect(timeline[i].type).to.equal(entries[i].type)
    }
  })

  it('should reject entries with invalid type', async () => {
    const invalid_entry = {
      id: 'invalid_001',
      timestamp: new Date().toISOString(),
      type: 'invalid_type',
      content: 'This is an invalid entry type'
    }

    try {
      await add_timeline_entry({
        thread_id: test_thread.thread_id,
        entry: invalid_entry
      })
      // Should not reach here
      expect.fail('Should have thrown an error for invalid entry type')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('type')
    }
  })

  it('should reject entries missing required fields', async () => {
    const incomplete_entry = {
      id: 'incomplete_001',
      timestamp: new Date().toISOString(),
      type: 'message'
      // Missing role and content for message type
    }

    try {
      await add_timeline_entry({
        thread_id: test_thread.thread_id,
        entry: incomplete_entry
      })
      // Should not reach here
      expect.fail('Should have thrown an error for missing required fields')
    } catch (error) {
      expect(error).to.be.an('error')
    }
  })

  it('should handle non-existent thread gracefully', async () => {
    const user_message = timeline_fixtures.find(
      (f) => f.name === 'user_message'
    ).entry

    try {
      await add_timeline_entry({
        thread_id: 'non-existent-thread-id',
        entry: user_message
      })
      // Should not reach here
      expect.fail('Should have thrown an error for non-existent thread')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('thread')
    }
  })
})
