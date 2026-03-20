import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  read_timeline_jsonl_from_offset,
  append_timeline_entries
} from '#libs-server/threads/timeline/index.mjs'

describe('timeline-jsonl', function () {
  let tmp_dir

  beforeEach(async () => {
    tmp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmp_dir, { recursive: true, force: true })
  })

  describe('read_timeline_jsonl_from_offset - inode tracking', () => {
    it('should return ino in result object', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      await fs.writeFile(timeline_path, JSON.stringify({ type: 'message', timestamp: '2026-01-01T00:00:00Z' }) + '\n')

      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0
      })

      expect(result).to.have.property('ino')
      expect(result.ino).to.be.a('number')
      expect(result.ino).to.be.greaterThan(0)
    })

    it('should return entries normally when expected_ino matches', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      const entry = { type: 'message', timestamp: '2026-01-01T00:00:00Z' }
      await fs.writeFile(timeline_path, JSON.stringify(entry) + '\n')

      const stat = await fs.stat(timeline_path)

      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0,
        expected_ino: stat.ino
      })

      expect(result).to.not.be.null
      expect(result.entries).to.have.lengthOf(1)
      expect(result.entries[0].type).to.equal('message')
      expect(result.ino).to.equal(stat.ino)
    })

    it('should return null when expected_ino differs from actual inode', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      await fs.writeFile(timeline_path, JSON.stringify({ type: 'message' }) + '\n')

      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0,
        expected_ino: 999999999
      })

      expect(result).to.be.null
    })

    it('should work without expected_ino parameter (backward compatible)', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      const entry = { type: 'message', timestamp: '2026-01-01T00:00:00Z' }
      await fs.writeFile(timeline_path, JSON.stringify(entry) + '\n')

      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0
      })

      expect(result).to.not.be.null
      expect(result.entries).to.have.lengthOf(1)
      expect(result.ino).to.be.a('number')
    })

    it('should detect atomic rewrite via inode change', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      const entry1 = { type: 'message', content: 'original' }
      await fs.writeFile(timeline_path, JSON.stringify(entry1) + '\n')

      // Capture original inode
      const original_stat = await fs.stat(timeline_path)
      const original_ino = original_stat.ino

      // Simulate atomic rewrite (temp file + rename, which changes inode)
      const entry2 = { type: 'message', content: 'rewritten with more data to be larger' }
      const temp_path = timeline_path + '.tmp'
      await fs.writeFile(temp_path, JSON.stringify(entry2) + '\n')
      await fs.rename(temp_path, timeline_path)

      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0,
        expected_ino: original_ino
      })

      // Should return null because inode changed
      expect(result).to.be.null
    })
  })

  describe('append_timeline_entries', () => {
    it('should append entries to existing file without rewriting', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      const original = { type: 'message', content: 'first' }
      await fs.writeFile(timeline_path, JSON.stringify(original) + '\n')

      const stat_before = await fs.stat(timeline_path)

      await append_timeline_entries({
        timeline_path,
        entries: [
          { type: 'message', content: 'second' },
          { type: 'message', content: 'third' }
        ]
      })

      const content = await fs.readFile(timeline_path, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).to.have.lengthOf(3)
      expect(JSON.parse(lines[0]).content).to.equal('first')
      expect(JSON.parse(lines[1]).content).to.equal('second')
      expect(JSON.parse(lines[2]).content).to.equal('third')

      // Inode should remain the same (append, not rewrite)
      const stat_after = await fs.stat(timeline_path)
      expect(stat_after.ino).to.equal(stat_before.ino)
    })

    it('should create file if it does not exist', async () => {
      const timeline_path = path.join(tmp_dir, 'new-dir', 'timeline.jsonl')

      await append_timeline_entries({
        timeline_path,
        entries: [{ type: 'message', content: 'created' }]
      })

      const content = await fs.readFile(timeline_path, 'utf-8')
      const parsed = JSON.parse(content.trim())
      expect(parsed.content).to.equal('created')
    })

    it('should preserve existing content (byte-level verification)', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      const original_line = JSON.stringify({ type: 'message', content: 'original' }) + '\n'
      await fs.writeFile(timeline_path, original_line)

      const bytes_before = await fs.readFile(timeline_path)

      await append_timeline_entries({
        timeline_path,
        entries: [{ type: 'message', content: 'appended' }]
      })

      const bytes_after = await fs.readFile(timeline_path)
      // Original bytes should be preserved exactly
      const original_portion = bytes_after.subarray(0, bytes_before.length)
      expect(Buffer.compare(original_portion, bytes_before)).to.equal(0)
    })

    it('should be a no-op for empty entries array', async () => {
      const timeline_path = path.join(tmp_dir, 'timeline.jsonl')
      await fs.writeFile(timeline_path, '{"type":"message"}\n')

      const stat_before = await fs.stat(timeline_path)

      await append_timeline_entries({
        timeline_path,
        entries: []
      })

      const stat_after = await fs.stat(timeline_path)
      expect(stat_after.size).to.equal(stat_before.size)
    })
  })

  describe('inode tracking integration', () => {
    it('should track inode through initialize and incremental read cycle', async () => {
      const thread_dir = path.join(tmp_dir, 'test-thread-001')
      await fs.mkdir(thread_dir, { recursive: true })

      const timeline_path = path.join(thread_dir, 'timeline.jsonl')
      const entry = { type: 'message', role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00Z' }
      await fs.writeFile(timeline_path, JSON.stringify(entry) + '\n')

      const initial = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0
      })

      expect(initial.ino).to.be.a('number')
      expect(initial.ino).to.be.greaterThan(0)
      expect(initial.entries).to.have.lengthOf(1)

      // Append more data (preserves inode)
      const entry2 = { type: 'message', role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:01:00Z' }
      await fs.appendFile(timeline_path, JSON.stringify(entry2) + '\n')

      // Read from previous offset with matching inode -- should succeed
      const incremental = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: initial.new_byte_offset,
        expected_ino: initial.ino
      })

      expect(incremental).to.not.be.null
      expect(incremental.entries).to.have.lengthOf(1)
      expect(incremental.entries[0].role).to.equal('assistant')
      expect(incremental.ino).to.equal(initial.ino)
    })

    it('should detect atomic rewrite through offset reader', async () => {
      const thread_dir = path.join(tmp_dir, 'test-thread-002')
      await fs.mkdir(thread_dir, { recursive: true })

      const timeline_path = path.join(thread_dir, 'timeline.jsonl')
      const entry = { type: 'message', content: 'original', timestamp: '2026-01-01T00:00:00Z' }
      await fs.writeFile(timeline_path, JSON.stringify(entry) + '\n')

      const initial = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: 0
      })

      // Atomic rewrite via temp + rename
      const new_entry = { type: 'message', content: 'rewritten with longer content to exceed original size', timestamp: '2026-01-01T00:02:00Z' }
      const temp_path = timeline_path + '.tmp.' + Date.now()
      await fs.writeFile(temp_path, JSON.stringify(new_entry) + '\n')
      await fs.rename(temp_path, timeline_path)

      // Read with old inode -- should return null
      const result = await read_timeline_jsonl_from_offset({
        timeline_path,
        byte_offset: initial.new_byte_offset,
        expected_ino: initial.ino
      })

      expect(result).to.be.null
    })
  })
})
