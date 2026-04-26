import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect } from 'chai'

import {
  append_audit_entry,
  compute_field_diff,
  _drain_for_tests
} from '#libs-server/threads/audit-log.mjs'

describe('libs-server/threads/audit-log', () => {
  let tmp_dir

  beforeEach(async () => {
    tmp_dir = await mkdtemp(join(tmpdir(), 'audit-log-test-'))
  })

  afterEach(async () => {
    await _drain_for_tests()
    await rm(tmp_dir, { recursive: true, force: true })
  })

  describe('compute_field_diff', () => {
    it('returns empty diff when objects are identical', () => {
      expect(compute_field_diff({ before: { a: 1 }, after: { a: 1 } })).to.deep.equal({})
    })

    it('captures additions, removals, and modifications', () => {
      const diff = compute_field_diff({
        before: { a: 1, b: 2 },
        after: { a: 1, b: 3, c: 4 }
      })
      expect(diff).to.deep.equal({
        b: { before: 2, after: 3 },
        c: { before: null, after: 4 }
      })
    })

    it('treats null and undefined as null for both sides', () => {
      expect(
        compute_field_diff({ before: { a: undefined }, after: { a: null } })
      ).to.deep.equal({})
    })

    it('handles nested objects via deep equality', () => {
      expect(
        compute_field_diff({
          before: { meta: { x: 1 } },
          after: { meta: { x: 1 } }
        })
      ).to.deep.equal({})
      const diff = compute_field_diff({
        before: { meta: { x: 1 } },
        after: { meta: { x: 2 } }
      })
      expect(diff.meta.before).to.deep.equal({ x: 1 })
      expect(diff.meta.after).to.deep.equal({ x: 2 })
    })

    it('handles arrays element-wise', () => {
      expect(
        compute_field_diff({
          before: { tags: ['a', 'b'] },
          after: { tags: ['a', 'b'] }
        })
      ).to.deep.equal({})
      const diff = compute_field_diff({
        before: { tags: ['a'] },
        after: { tags: ['a', 'b'] }
      })
      expect(diff.tags).to.exist
    })
  })

  describe('append_audit_entry', () => {
    it('writes a single JSON line per call', async () => {
      await append_audit_entry({
        thread_dir: tmp_dir,
        thread_id: 't-1',
        machine_id: 'macbook',
        session_id: 's-1',
        actor: 'user-key',
        op: 'patch',
        fields_changed: { x: { before: 1, after: 2 } },
        lease_holder: 'macbook',
        lease_mode: 'session',
        lease_token: 5
      })
      const text = await readFile(join(tmp_dir, 'audit.jsonl'), 'utf8')
      const lines = text.split('\n').filter(Boolean)
      expect(lines).to.have.lengthOf(1)
      const entry = JSON.parse(lines[0])
      expect(entry).to.include({
        machine_id: 'macbook',
        session_id: 's-1',
        op: 'patch',
        lease_token: 5
      })
      expect(entry.fields_changed).to.deep.equal({
        x: { before: 1, after: 2 }
      })
    })

    it('serializes concurrent appends per thread without interleaving', async () => {
      const ops = []
      for (let i = 0; i < 50; i += 1) {
        ops.push(
          append_audit_entry({
            thread_dir: tmp_dir,
            thread_id: 't-concurrent',
            machine_id: 'macbook',
            op: 'patch',
            fields_changed: { i: { before: null, after: i } },
            lease_token: i
          })
        )
      }
      await Promise.all(ops)
      const text = await readFile(join(tmp_dir, 'audit.jsonl'), 'utf8')
      const lines = text.split('\n').filter(Boolean)
      expect(lines).to.have.lengthOf(50)
      const tokens = lines.map((l) => JSON.parse(l).lease_token)
      // Order matches enqueue order (FIFO within the per-thread queue)
      expect(tokens).to.deep.equal([...Array(50).keys()])
    })

    it('throws when required fields are missing', async () => {
      let err
      try {
        await append_audit_entry({ thread_dir: tmp_dir, op: 'patch' })
      } catch (e) {
        err = e
      }
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.match(/thread_id/)
    })
  })
})
