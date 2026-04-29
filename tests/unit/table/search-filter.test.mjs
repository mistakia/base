import { expect } from 'chai'

import { resolve_table_search } from '#libs-server/table/search-filter.mjs'

const make_filter_mode_stub = ({ uri_set = new Set(), highlights = new Map() } = {}) => {
  const calls = []
  const fn = async (args) => {
    calls.push(args)
    return {
      uri_set,
      highlights_by_uri: highlights
    }
  }
  fn.calls = calls
  return fn
}

const sample_highlight = (matched_field = 'title') => ({
  matched_field,
  cell_ranges: { title: [{ offset: 0, length: 3 }] },
  snippet: null
})

describe('resolve_table_search', () => {
  describe('query length guards', () => {
    it('returns null for missing q', async () => {
      const result = await resolve_table_search({
        entity_type: 'thread',
        filter_mode_fn: make_filter_mode_stub()
      })
      expect(result).to.be.null
    })

    it('returns null for non-string q', async () => {
      const result = await resolve_table_search({
        q: 42,
        entity_type: 'thread',
        filter_mode_fn: make_filter_mode_stub()
      })
      expect(result).to.be.null
    })

    it('returns null for empty q', async () => {
      const result = await resolve_table_search({
        q: '   ',
        entity_type: 'thread',
        filter_mode_fn: make_filter_mode_stub()
      })
      expect(result).to.be.null
    })

    it('returns null for sub-3-character q', async () => {
      const stub = make_filter_mode_stub()
      const result = await resolve_table_search({
        q: 'ab',
        entity_type: 'thread',
        filter_mode_fn: stub
      })
      expect(result).to.be.null
      expect(stub.calls).to.have.lengthOf(0)
    })

    it('passes through q of exactly 3 characters', async () => {
      const stub = make_filter_mode_stub()
      await resolve_table_search({
        q: 'abc',
        entity_type: 'thread',
        filter_mode_fn: stub
      })
      expect(stub.calls).to.have.lengthOf(1)
      expect(stub.calls[0].query).to.equal('abc')
    })

    it('trims whitespace before applying length check', async () => {
      const stub = make_filter_mode_stub()
      await resolve_table_search({
        q: '  abc  ',
        entity_type: 'thread',
        filter_mode_fn: stub
      })
      expect(stub.calls[0].query).to.equal('abc')
    })
  })

  describe('rekeying for thread entity_type', () => {
    it('extracts thread_id from user:thread/{id} URIs', async () => {
      const uri_set = new Set([
        'user:thread/aaa-111',
        'user:thread/bbb-222'
      ])
      const highlights = new Map([
        ['user:thread/aaa-111', sample_highlight()],
        ['user:thread/bbb-222', sample_highlight('body')]
      ])
      const stub = make_filter_mode_stub({ uri_set, highlights })

      const result = await resolve_table_search({
        q: 'foobar',
        entity_type: 'thread',
        filter_mode_fn: stub
      })

      expect(result.row_key).to.equal('thread_id')
      expect(result.uri_set_as_row_keys).to.deep.equal(['aaa-111', 'bbb-222'])
      expect(result.row_highlights.get('aaa-111')).to.deep.equal(
        sample_highlight()
      )
      expect(result.row_highlights.get('bbb-222').matched_field).to.equal(
        'body'
      )
    })

    it('skips URIs that do not match the thread URI prefix', async () => {
      const uri_set = new Set([
        'user:thread/keep-me',
        'user:tag/skip-me' // not a thread URI
      ])
      const stub = make_filter_mode_stub({ uri_set })
      const result = await resolve_table_search({
        q: 'query',
        entity_type: 'thread',
        filter_mode_fn: stub
      })
      expect(result.uri_set_as_row_keys).to.deep.equal(['keep-me'])
    })
  })

  describe('rekeying for task entity_type', () => {
    it('passes URIs through as base_uri', async () => {
      const uri_set = new Set([
        'user:task/foo.md',
        'user:task/bar.md'
      ])
      const highlights = new Map([
        ['user:task/foo.md', sample_highlight()],
        ['user:task/bar.md', sample_highlight('body')]
      ])
      const stub = make_filter_mode_stub({ uri_set, highlights })

      const result = await resolve_table_search({
        q: 'query',
        entity_type: 'task',
        filter_mode_fn: stub
      })

      expect(result.row_key).to.equal('base_uri')
      expect(result.uri_set_as_row_keys).to.deep.equal([
        'user:task/foo.md',
        'user:task/bar.md'
      ])
      expect(result.row_highlights.get('user:task/foo.md')).to.deep.equal(
        sample_highlight()
      )
    })
  })

  describe('error handling', () => {
    it('throws on unsupported entity_type', async () => {
      let caught
      try {
        await resolve_table_search({
          q: 'query',
          entity_type: 'unsupported',
          filter_mode_fn: make_filter_mode_stub()
        })
      } catch (err) {
        caught = err
      }
      expect(caught).to.not.be.undefined
      expect(caught.message).to.match(/unsupported entity_type/)
    })
  })

  describe('filter mode arguments', () => {
    it('forwards entity_type as type_filter and user key as user_public_key', async () => {
      const stub = make_filter_mode_stub()
      await resolve_table_search({
        q: 'searchterm',
        entity_type: 'task',
        requesting_user_public_key: 'pubkey',
        filter_mode_fn: stub
      })
      expect(stub.calls[0]).to.deep.equal({
        query: 'searchterm',
        type_filter: 'task',
        user_public_key: 'pubkey'
      })
    })
  })
})
