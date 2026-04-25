/**
 * @fileoverview Unit tests for the thread-sync IPC per-request file format.
 *
 * Each enqueue is its own file under thread-sync-queue/. The consumer reads
 * all .req files, parses, dedupes by thread_id (last-write-wins), and applies
 * DELETE precedence. A legacy single-file .thread-sync-queue is drained once.
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

const { parse_request_payload, read_pending_requests, drain_legacy_queue } =
  __test__

describe('thread-sync IPC', function () {
  this.timeout(5000)

  describe('parse_request_payload', () => {
    it('parses a bare thread_id as a sync request with null metadata', () => {
      expect(parse_request_payload('abc-123')).to.deep.equal({
        kind: 'sync',
        thread_id: 'abc-123',
        metadata: null
      })
    })

    it('parses a JSON sync request with metadata', () => {
      const payload = JSON.stringify({
        thread_id: 'xyz',
        metadata: { thread_state: 'archived' }
      })
      expect(parse_request_payload(payload)).to.deep.equal({
        kind: 'sync',
        thread_id: 'xyz',
        metadata: { thread_state: 'archived' }
      })
    })

    it('parses a DELETE request', () => {
      expect(parse_request_payload('DELETE:foo')).to.deep.equal({
        kind: 'delete',
        thread_id: 'foo'
      })
    })

    it('returns null on empty payload', () => {
      expect(parse_request_payload('')).to.equal(null)
      expect(parse_request_payload('   \n')).to.equal(null)
    })

    it('returns null on malformed JSON', () => {
      expect(parse_request_payload('{not json')).to.equal(null)
    })

    it('returns null on JSON without thread_id', () => {
      expect(parse_request_payload('{"foo":"bar"}')).to.equal(null)
    })
  })

  describe('end-to-end via write/read', () => {
    let tmpdir
    let original_user_base

    before(() => {
      original_user_base = config.user_base_directory
    })

    beforeEach(async () => {
      tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-ipc-'))
      config.user_base_directory = tmpdir
    })

    afterEach(async () => {
      try {
        await fs.rm(tmpdir, { recursive: true, force: true })
      } catch {
        // best effort
      }
      config.user_base_directory = original_user_base
    })

    async function pending() {
      return read_pending_requests([])
    }

    it('writes a bare thread_id when no metadata is given', async () => {
      await write_thread_sync_request({ thread_id: 'abc' })
      const result = await pending()
      expect(result.syncs).to.deep.equal([
        { thread_id: 'abc', metadata: null }
      ])
      expect(result.deletes).to.deep.equal([])
      expect(result.processed_files).to.have.lengthOf(1)
    })

    it('writes a JSON payload when metadata is given', async () => {
      await write_thread_sync_request({
        thread_id: 'abc',
        metadata: { v: 1 }
      })
      const result = await pending()
      expect(result.syncs).to.deep.equal([
        { thread_id: 'abc', metadata: { v: 1 } }
      ])
    })

    it('writes a DELETE request', async () => {
      await write_thread_delete_request({ thread_id: 'abc' })
      const result = await pending()
      expect(result.deletes).to.deep.equal(['abc'])
    })

    it('dedupes by thread_id with last-write-wins (chronological)', async () => {
      await write_thread_sync_request({
        thread_id: 'a',
        metadata: { v: 1 }
      })
      // Force ordering: filenames embed Date.now(); ensure separation.
      await new Promise((resolve) => setTimeout(resolve, 2))
      await write_thread_sync_request({
        thread_id: 'a',
        metadata: { v: 2 }
      })
      await new Promise((resolve) => setTimeout(resolve, 2))
      await write_thread_sync_request({
        thread_id: 'a',
        metadata: { v: 3 }
      })
      const result = await pending()
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 3 } }
      ])
      expect(result.processed_files).to.have.lengthOf(3)
    })

    it('DELETE removes a previously-seen sync entry', async () => {
      await write_thread_sync_request({
        thread_id: 'a',
        metadata: { v: 1 }
      })
      await new Promise((resolve) => setTimeout(resolve, 2))
      await write_thread_delete_request({ thread_id: 'a' })
      const result = await pending()
      expect(result.syncs).to.have.lengthOf(0)
      expect(result.deletes).to.deep.equal(['a'])
    })

    it('sync after delete in same batch resurrects (file order canonical)', async () => {
      await write_thread_delete_request({ thread_id: 'a' })
      await new Promise((resolve) => setTimeout(resolve, 2))
      await write_thread_sync_request({
        thread_id: 'a',
        metadata: { v: 7 }
      })
      const result = await pending()
      expect(result.syncs).to.deep.equal([
        { thread_id: 'a', metadata: { v: 7 } }
      ])
      expect(result.deletes).to.deep.equal([])
    })

    it('returns empty result when queue dir does not exist', async () => {
      const result = await pending()
      expect(result).to.deep.equal({
        syncs: [],
        deletes: [],
        processed_files: [],
        has_overflow: false
      })
    })

    it('drains legacy single-file queue and combines with per-file requests', async () => {
      const legacy_path = path.join(
        tmpdir,
        'embedded-database-index',
        '.thread-sync-queue'
      )
      await fs.mkdir(path.dirname(legacy_path), { recursive: true })
      await fs.writeFile(
        legacy_path,
        ['legacy-a', 'DELETE:legacy-b', 'legacy-c'].join('\n') + '\n'
      )

      await write_thread_sync_request({
        thread_id: 'new-d',
        metadata: { v: 1 }
      })

      const legacy = await drain_legacy_queue()
      expect(legacy).to.have.lengthOf(3)

      // Legacy file should be unlinked
      let exists = true
      try {
        await fs.access(legacy_path)
      } catch {
        exists = false
      }
      expect(exists).to.equal(false)

      // Combine legacy + per-file
      const combined = await read_pending_requests(legacy)
      const sync_ids = combined.syncs.map((s) => s.thread_id).sort()
      expect(sync_ids).to.deep.equal(['legacy-a', 'legacy-c', 'new-d'])
      expect(combined.deletes).to.deep.equal(['legacy-b'])
    })
  })
})
