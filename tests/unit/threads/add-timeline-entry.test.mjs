import { expect } from 'chai'
import path from 'path'

import add_timeline_entry from '#libs-server/threads/add-timeline-entry.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
import timeline_fixtures from '#tests/fixtures/threads/timeline-entries.json' with { type: 'json' }
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { read_and_reset_timeline_backstop_counter } from '#libs-server/threads/timeline-backstop-counter.mjs'

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
      user_public_key: test_user.user_public_key
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
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

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
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

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
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(tool_call.id)
    expect(added_entry.type).to.equal('tool_call')
    expect(added_entry.content.tool_name).to.equal(tool_call.content.tool_name)
    expect(added_entry.content.tool_parameters).to.deep.equal(
      tool_call.content.tool_parameters
    )
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
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)

    const added_entry = timeline[0]
    expect(added_entry.id).to.equal(tool_result.id)
    expect(added_entry.type).to.equal('tool_result')
    expect(added_entry.content.tool_call_id).to.equal(
      tool_result.content.tool_call_id
    )
    expect(added_entry.content.result).to.deep.equal(tool_result.content.result)
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
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

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

  it('should increment the backstop counter when schema_version is missing', async () => {
    read_and_reset_timeline_backstop_counter()

    const assistant_message = timeline_fixtures.find(
      (f) => f.name === 'assistant_message'
    ).entry
    expect(assistant_message.schema_version).to.be.undefined

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: assistant_message
    })

    expect(read_and_reset_timeline_backstop_counter()).to.equal(1)

    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })
    expect(timeline[0].schema_version).to.equal(2)
  })

  it('should not increment the backstop counter when schema_version is provided', async () => {
    read_and_reset_timeline_backstop_counter()

    const user_message = timeline_fixtures.find(
      (f) => f.name === 'user_message'
    ).entry
    expect(user_message.schema_version).to.equal(2)

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: user_message
    })

    expect(read_and_reset_timeline_backstop_counter()).to.equal(0)
  })

  it('should stamp context_* tokens from metadata.usage on the same entry', async () => {
    const assistant_entry = {
      id: 'ctx_msg_001',
      timestamp: '2023-05-10T14:30:00Z',
      type: 'message',
      role: 'assistant',
      content: 'hello',
      schema_version: 2,
      metadata: {
        usage: {
          input_tokens: 1234,
          cache_creation_input_tokens: 56,
          cache_read_input_tokens: 78,
          output_tokens: 9
        }
      }
    }

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: assistant_entry
    })

    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })
    expect(timeline[0].metadata.context_input_tokens).to.equal(1234)
    expect(timeline[0].metadata.context_cache_creation_input_tokens).to.equal(
      56
    )
    expect(timeline[0].metadata.context_cache_read_input_tokens).to.equal(78)
  })

  it('should carry forward context_* tokens onto entries without usage', async () => {
    const timeline_path = path.join(test_thread.context_dir, 'timeline.jsonl')

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: {
        id: 'ctx_assistant_001',
        timestamp: '2023-05-10T14:30:00Z',
        type: 'message',
        role: 'assistant',
        content: 'first',
        schema_version: 2,
        metadata: {
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 5,
            output_tokens: 1
          }
        }
      }
    })

    await add_timeline_entry({
      thread_id: test_thread.thread_id,
      entry: {
        id: 'ctx_tool_001',
        timestamp: '2023-05-10T14:30:01Z',
        type: 'tool_call',
        content: {
          tool_name: 'web_search',
          tool_parameters: { query: 'foo' }
        },
        schema_version: 2
      }
    })

    const timeline = await read_timeline_jsonl({ timeline_path })
    expect(timeline[1].metadata.context_input_tokens).to.equal(100)
    expect(timeline[1].metadata.context_cache_creation_input_tokens).to.equal(
      10
    )
    expect(timeline[1].metadata.context_cache_read_input_tokens).to.equal(5)
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
