import { describe, it, before, after } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  parse_claude_jsonl_file,
  parse_claude_jsonl_from_offset
} from '#libs-server/integrations/claude/parse-jsonl.mjs'
import {
  load_sync_state,
  save_sync_state,
  clear_sync_state,
  state_path_for_session
} from '#libs-server/integrations/claude/sync-state.mjs'

describe('Incremental JSONL Parse', function () {
  this.timeout(10000)

  let test_dir

  before(async () => {
    test_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'claude-incremental-test-')
    )
  })

  after(async () => {
    if (test_dir) {
      await fs.rm(test_dir, { recursive: true, force: true })
    }
  })

  // Helper to write JSONL entries to a file
  const write_jsonl = async (file_path, entries) => {
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    await fs.writeFile(file_path, content)
    return content
  }

  const make_entry = (type, index) => ({
    uuid: `uuid-${index}`,
    timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    type,
    ...(type === 'assistant'
      ? {
          message: {
            content: [{ type: 'text', text: `Response ${index}` }],
            model: 'claude-sonnet-4-6',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 10,
              cache_read_input_tokens: 5
            }
          }
        }
      : { message: { content: `Message ${index}` } })
  })

  describe('parse_claude_jsonl_from_offset', () => {
    it('should return only entries after byte offset', async () => {
      const file_path = path.join(test_dir, 'offset-test.jsonl')
      const initial_entries = [
        make_entry('user', 1),
        make_entry('assistant', 2)
      ]
      const initial_content = await write_jsonl(file_path, initial_entries)
      const offset = Buffer.byteLength(initial_content)

      // Append more entries
      const new_entries = [make_entry('user', 3), make_entry('assistant', 4)]
      await fs.appendFile(
        file_path,
        new_entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
      )

      const result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: offset
      })

      expect(result).to.not.be.null
      expect(result.entries).to.have.lengthOf(2)
      expect(result.entries[0].uuid).to.equal('uuid-3')
      expect(result.entries[1].uuid).to.equal('uuid-4')
      expect(result.new_byte_offset).to.be.greaterThan(offset)
    })

    it('should return empty when offset equals file size', async () => {
      const file_path = path.join(test_dir, 'no-new-data.jsonl')
      const content = await write_jsonl(file_path, [make_entry('user', 1)])
      const offset = Buffer.byteLength(content)

      const result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: offset
      })

      expect(result).to.not.be.null
      expect(result.entries).to.have.lengthOf(0)
      expect(result.new_byte_offset).to.equal(offset)
    })

    it('should return null when file is smaller than offset', async () => {
      const file_path = path.join(test_dir, 'replaced.jsonl')
      await write_jsonl(file_path, [make_entry('user', 1)])

      const result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: 999999
      })

      expect(result).to.be.null
    })

    it('should return null when file does not exist', async () => {
      const result = await parse_claude_jsonl_from_offset({
        file_path: path.join(test_dir, 'nonexistent.jsonl'),
        byte_offset: 0
      })

      expect(result).to.be.null
    })

    it('should extract summaries from new entries', async () => {
      const file_path = path.join(test_dir, 'summaries.jsonl')
      const entries = [
        make_entry('user', 1),
        { type: 'summary', summary: 'Session summary text' }
      ]
      const content = await write_jsonl(file_path, entries.slice(0, 1))
      const offset = Buffer.byteLength(content)

      // Append summary entry
      await fs.appendFile(file_path, JSON.stringify(entries[1]) + '\n')

      const result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: offset
      })

      expect(result.summaries).to.have.lengthOf(1)
      expect(result.summaries[0]).to.equal('Session summary text')
      // Summary entries are not included in entries array
      expect(result.entries).to.have.lengthOf(0)
    })

    it('should apply MAX_PROGRESS_FULL_OUTPUT_CHARS truncation', async () => {
      const file_path = path.join(test_dir, 'progress-truncate.jsonl')
      const large_output = 'x'.repeat(20 * 1024)
      const entries = [
        {
          uuid: 'prog-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'progress',
          data: { fullOutput: large_output }
        }
      ]

      await write_jsonl(file_path, entries)

      const result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: 0
      })

      expect(result.entries).to.have.lengthOf(1)
      expect(result.entries[0].data.fullOutput.length).to.be.lessThan(
        large_output.length
      )
      expect(result.entries[0].data.fullOutput).to.include('[truncated]')
    })
  })

  describe('sync state helpers', () => {
    const test_session_id = 'test-sync-state-' + Date.now()

    after(async () => {
      await clear_sync_state({ session_id: test_session_id })
    })

    it('should return null for missing state file', async () => {
      const result = await load_sync_state({
        session_id: 'nonexistent-session-id'
      })
      expect(result).to.be.null
    })

    it('should round-trip save and load', async () => {
      const state = {
        byte_offset: 12345,
        subagent_offsets: { 'agent-abc.jsonl': { byte_offset: 100 } },
        working_directory: '/tmp/project'
      }

      await save_sync_state({ session_id: test_session_id, state })
      const loaded = await load_sync_state({ session_id: test_session_id })

      expect(loaded).to.deep.equal(state)
    })

    it('should return null for malformed state file', async () => {
      const malformed_id = 'malformed-' + Date.now()
      const state_path = state_path_for_session(malformed_id)
      await fs.writeFile(state_path, 'not valid json')

      const result = await load_sync_state({ session_id: malformed_id })
      expect(result).to.be.null

      await fs.unlink(state_path).catch(() => {})
    })

    it('should return null for state missing byte_offset', async () => {
      const bad_id = 'bad-shape-' + Date.now()
      const state_path = state_path_for_session(bad_id)
      await fs.writeFile(state_path, JSON.stringify({ counts: {} }))

      const result = await load_sync_state({ session_id: bad_id })
      expect(result).to.be.null

      await fs.unlink(state_path).catch(() => {})
    })

    it('should clear state file', async () => {
      const clear_id = 'clear-test-' + Date.now()
      await save_sync_state({
        session_id: clear_id,
        state: { byte_offset: 100 }
      })

      await clear_sync_state({ session_id: clear_id })
      const loaded = await load_sync_state({ session_id: clear_id })
      expect(loaded).to.be.null
    })
  })

  describe('end-to-end equivalence', () => {
    it('should produce same entry set via full parse and incremental parse', async () => {
      const session_id = 'equivalence-test'
      const file_path = path.join(test_dir, `${session_id}.jsonl`)

      // Write initial entries
      const initial = [make_entry('user', 1), make_entry('assistant', 2)]
      const initial_content = await write_jsonl(file_path, initial)
      const offset = Buffer.byteLength(initial_content)

      // Append new entries
      const appended = [make_entry('user', 3), make_entry('assistant', 4)]
      await fs.appendFile(
        file_path,
        appended.map((e) => JSON.stringify(e)).join('\n') + '\n'
      )

      // Full parse
      const full_result = await parse_claude_jsonl_file(file_path)
      const full_entries = full_result[0].entries

      // Incremental parse
      const incr_result = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: offset
      })

      // Initial entries (from full parse)
      const initial_parsed = await parse_claude_jsonl_from_offset({
        file_path,
        byte_offset: 0
      })

      // Combine initial + incremental should equal full
      const combined = [
        ...initial_parsed.entries.slice(0, initial.length),
        ...incr_result.entries
      ]

      expect(combined).to.have.lengthOf(full_entries.length)
      for (let i = 0; i < full_entries.length; i++) {
        expect(combined[i].uuid).to.equal(full_entries[i].uuid)
        expect(combined[i].type).to.equal(full_entries[i].type)
      }
    })
  })
})
