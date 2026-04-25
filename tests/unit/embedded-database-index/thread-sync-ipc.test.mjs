/**
 * @fileoverview Unit tests for the thread-sync IPC queue parser and writer.
 *
 * Covers the JSON-payload path added to support metadata-in-IPC, and the
 * backward-compatible bare-thread-id path used by callers that don't have
 * metadata in scope.
 */

import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import config from '#config'
import {
  __test__,
  write_thread_sync_request,
  write_thread_delete_request
} from '#libs-server/embedded-database-index/sync/thread-sync-ipc.mjs'

const { parse_sync_line, read_and_parse_queue } = __test__

describe('thread-sync IPC queue', function () {
  this.timeout(5000)

  describe('parse_sync_line', () => {
    it('parses a bare thread_id as { thread_id, metadata: null }', () => {
      const result = parse_sync_line('abc-123')
      expect(result).to.deep.equal({ thread_id: 'abc-123', metadata: null })
    })

    it('parses a JSON object with metadata', () => {
      const line = JSON.stringify({
        thread_id: 'xyz',
        metadata: { thread_state: 'archived', updated_at: 'now' }
      })
      const result = parse_sync_line(line)
      expect(result.thread_id).to.equal('xyz')
      expect(result.metadata).to.deep.equal({
        thread_state: 'archived',
        updated_at: 'now'
      })
    })

    it('parses a JSON object without metadata as metadata: null', () => {
      const result = parse_sync_line(JSON.stringify({ thread_id: 'xyz' }))
      expect(result).to.deep.equal({ thread_id: 'xyz', metadata: null })
    })

    it('returns null on malformed JSON', () => {
      expect(parse_sync_line('{not json')).to.equal(null)
    })

    it('returns null on JSON without thread_id', () => {
      expect(parse_sync_line('{"foo":"bar"}')).to.equal(null)
    })
  })

  describe('read_and_parse_queue', () => {
    let tmpfile

    beforeEach(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-ipc-'))
      tmpfile = path.join(dir, 'queue')
    })

    afterEach(async () => {
      try {
        await fs.rm(path.dirname(tmpfile), { recursive: true, force: true })
      } catch {
        // best effort
      }
    })

    async function write_lines(lines) {
      await fs.writeFile(tmpfile, lines.join('\n') + '\n', 'utf-8')
    }

    it('returns empty result for missing file', async () => {
      const result = await read_and_parse_queue(
        path.join(os.tmpdir(), 'definitely-not-a-real-file-' + Date.now())
      )
      expect(result).to.deep.equal({
        syncs: [],
        deletes: [],
        has_overflow: false
      })
    })

    it('parses all bare ids', async () => {
      await write_lines(['a', 'b', 'c'])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.have.lengthOf(3)
      expect(result.syncs.map((s) => s.thread_id)).to.deep.equal([
        'a',
        'b',
        'c'
      ])
      expect(result.syncs.every((s) => s.metadata === null)).to.equal(true)
    })

    it('parses JSON lines and preserves metadata', async () => {
      await write_lines([
        JSON.stringify({ thread_id: 'a', metadata: { v: 1 } }),
        JSON.stringify({ thread_id: 'b', metadata: { v: 2 } })
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 1 } },
        { thread_id: 'b', metadata: { v: 2 } }
      ])
    })

    it('handles mixed bare and JSON lines', async () => {
      await write_lines([
        'a',
        JSON.stringify({ thread_id: 'b', metadata: { v: 2 } }),
        'c'
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs.map((s) => s.thread_id)).to.deep.equal([
        'a',
        'b',
        'c'
      ])
      expect(result.syncs[1].metadata).to.deep.equal({ v: 2 })
    })

    it('dedupes by thread_id with last-write-wins', async () => {
      await write_lines([
        JSON.stringify({ thread_id: 'a', metadata: { v: 1 } }),
        JSON.stringify({ thread_id: 'a', metadata: { v: 2 } }),
        JSON.stringify({ thread_id: 'a', metadata: { v: 3 } })
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 3 } }
      ])
    })

    it('JSON line wins over preceding bare line for same thread_id', async () => {
      await write_lines([
        'a',
        JSON.stringify({ thread_id: 'a', metadata: { v: 9 } })
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 9 } }
      ])
    })

    it('DELETE removes a previously-seen sync entry', async () => {
      await write_lines([
        JSON.stringify({ thread_id: 'a', metadata: { v: 1 } }),
        'DELETE:a'
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.have.lengthOf(0)
      expect(result.deletes).to.deep.equal(['a'])
    })

    it('sync after delete in same batch resurrects (file order canonical)', async () => {
      await write_lines([
        'DELETE:a',
        JSON.stringify({ thread_id: 'a', metadata: { v: 7 } })
      ])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 7 } }
      ])
      expect(result.deletes).to.deep.equal([])
    })

    it('detects overflow marker', async () => {
      await write_lines(['a', `OVERFLOW:${Date.now()}`, 'b'])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.has_overflow).to.equal(true)
      expect(result.syncs.map((s) => s.thread_id)).to.deep.equal(['a', 'b'])
    })

    it('skips malformed JSON lines without failing the batch', async () => {
      await write_lines(['a', '{not-json', 'b'])
      const result = await read_and_parse_queue(tmpfile)
      expect(result.syncs.map((s) => s.thread_id)).to.deep.equal(['a', 'b'])
    })
  })

  describe('write_thread_sync_request', () => {
    let queue_path
    let original_user_base

    before(() => {
      original_user_base = config.user_base_directory
    })

    beforeEach(async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-ipc-write-'))
      // Override config to point at the temp dir's parent so the queue path
      // becomes <tmp>/embedded-database-index/.thread-sync-queue
      config.user_base_directory = dir
      queue_path = path.join(
        dir,
        'embedded-database-index',
        '.thread-sync-queue'
      )
    })

    afterEach(async () => {
      try {
        await fs.rm(config.user_base_directory, {
          recursive: true,
          force: true
        })
      } catch {
        // best effort
      }
      config.user_base_directory = original_user_base
    })

    it('writes a bare thread_id when no metadata is given', async () => {
      await write_thread_sync_request({ thread_id: 'abc' })
      const content = await fs.readFile(queue_path, 'utf-8')
      expect(content).to.equal('abc\n')
    })

    it('writes a JSON line when metadata is given', async () => {
      await write_thread_sync_request({
        thread_id: 'abc',
        metadata: { thread_state: 'archived' }
      })
      const content = await fs.readFile(queue_path, 'utf-8')
      const parsed = JSON.parse(content.trim())
      expect(parsed.thread_id).to.equal('abc')
      expect(parsed.metadata).to.deep.equal({ thread_state: 'archived' })
    })

    it('writes a delete line', async () => {
      await write_thread_delete_request({ thread_id: 'abc' })
      const content = await fs.readFile(queue_path, 'utf-8')
      expect(content).to.equal('DELETE:abc\n')
    })

    it('round-trips through read_and_parse_queue', async () => {
      await write_thread_sync_request({
        thread_id: 'abc',
        metadata: { v: 1 }
      })
      await write_thread_sync_request({ thread_id: 'def' })
      await write_thread_delete_request({ thread_id: 'ghi' })

      const result = await read_and_parse_queue(queue_path)
      expect(result.syncs).to.deep.equal([
        { thread_id: 'abc', metadata: { v: 1 } },
        { thread_id: 'def', metadata: null }
      ])
      expect(result.deletes).to.deep.equal(['ghi'])
    })
  })
})
