/* global describe, it */

import { expect } from 'chai'

import {
  format_audit_entry,
  passes_audit_filters
} from '#cli/base/thread-audit.mjs'

describe('thread-audit', () => {
  describe('format_audit_entry', () => {
    it('formats a complete entry with fields and lease token', () => {
      const entry = {
        ts: '2026-04-27T15:00:00.000Z',
        op: 'update_metadata',
        actor: 'macbook',
        fields_changed: { title: 'new', tags: ['x'] },
        lease_token: 1745765400000
      }

      expect(format_audit_entry(entry)).to.equal(
        '2026-04-27T15:00:00.000Z  update_metadata  macbook  fields=[title,tags]  lease_token=1745765400000'
      )
    })

    it('renders missing actor as "-" and empty fields_changed as "(none)"', () => {
      const entry = {
        ts: '2026-04-27T15:00:00.000Z',
        op: 'quarantine',
        fields_changed: {}
      }

      expect(format_audit_entry(entry)).to.equal(
        '2026-04-27T15:00:00.000Z  quarantine  -  fields=[(none)]  lease_token=-'
      )
    })

    it('tolerates missing fields_changed entirely', () => {
      const entry = { ts: '2026-04-27T15:00:00.000Z', op: 'create' }
      expect(format_audit_entry(entry)).to.include('fields=[(none)]')
    })
  })

  describe('passes_audit_filters', () => {
    const base_entry = {
      ts: '2026-04-27T15:00:00.000Z',
      op: 'update_metadata',
      actor: 'macbook',
      fields_changed: { title: 'a' }
    }

    it('returns true when no filters are supplied', () => {
      expect(passes_audit_filters(base_entry, {})).to.be.true
    })

    it('filters by actor (mismatch rejected)', () => {
      expect(passes_audit_filters(base_entry, { actor: 'storage' })).to.be.false
      expect(passes_audit_filters(base_entry, { actor: 'macbook' })).to.be.true
    })

    it('filters by field presence in fields_changed', () => {
      expect(passes_audit_filters(base_entry, { field: 'tags' })).to.be.false
      expect(passes_audit_filters(base_entry, { field: 'title' })).to.be.true
    })

    it('filters by since (entries earlier than since are rejected)', () => {
      const since = new Date('2026-04-27T16:00:00.000Z')
      expect(passes_audit_filters(base_entry, { since })).to.be.false
    })

    it('accepts entries with ts >= since', () => {
      const since = new Date('2026-04-27T15:00:00.000Z')
      expect(passes_audit_filters(base_entry, { since })).to.be.true
    })

    it('rejects entries with malformed ts when since is set', () => {
      const malformed = { ...base_entry, ts: 'not-a-date' }
      const since = new Date('2026-04-27T00:00:00.000Z')
      expect(passes_audit_filters(malformed, { since })).to.be.false
    })

    it('combines all filters (all must pass)', () => {
      const since = new Date('2026-04-27T00:00:00.000Z')
      expect(
        passes_audit_filters(base_entry, {
          actor: 'macbook',
          field: 'title',
          since
        })
      ).to.be.true
      expect(
        passes_audit_filters(base_entry, {
          actor: 'macbook',
          field: 'nonexistent',
          since
        })
      ).to.be.false
    })

    it('treats missing fields_changed as no fields present', () => {
      const no_fields = { ts: base_entry.ts, op: 'create' }
      expect(passes_audit_filters(no_fields, { field: 'title' })).to.be.false
      expect(passes_audit_filters(no_fields, {})).to.be.true
    })
  })
})
