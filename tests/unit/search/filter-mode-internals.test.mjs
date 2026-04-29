import { expect } from 'chai'

import {
  SENTINELS,
  _internal
} from '#libs-server/search/filter-mode.mjs'

const { parse_sentinel_snippet, build_row_highlights, SOURCE_PRIORITY } =
  _internal

describe('filter-mode internals', () => {
  describe('parse_sentinel_snippet', () => {
    it('extracts ranges from a single sentinel pair', () => {
      const text = `hello ${SENTINELS.open}world${SENTINELS.close}!`
      const result = parse_sentinel_snippet(text)
      expect(result.text).to.equal('hello world!')
      expect(result.ranges).to.deep.equal([{ offset: 6, length: 5 }])
    })

    it('extracts ranges across multiple sentinel pairs', () => {
      const text = `${SENTINELS.open}foo${SENTINELS.close} bar ${SENTINELS.open}baz${SENTINELS.close}`
      const result = parse_sentinel_snippet(text)
      expect(result.text).to.equal('foo bar baz')
      expect(result.ranges).to.deep.equal([
        { offset: 0, length: 3 },
        { offset: 8, length: 3 }
      ])
    })

    it('returns empty ranges for plain text', () => {
      const result = parse_sentinel_snippet('plain text')
      expect(result.text).to.equal('plain text')
      expect(result.ranges).to.deep.equal([])
    })

    it('drops unclosed sentinels gracefully', () => {
      const text = `foo ${SENTINELS.open}bar baz`
      const result = parse_sentinel_snippet(text)
      // Open sentinel without matching close gets stripped, content preserved.
      expect(result.text).to.equal('foo bar baz')
      expect(result.ranges).to.deep.equal([])
    })

    it('handles non-string input', () => {
      expect(parse_sentinel_snippet(null)).to.deep.equal({
        text: '',
        ranges: []
      })
      expect(parse_sentinel_snippet(undefined)).to.deep.equal({
        text: '',
        ranges: []
      })
    })
  })

  describe('build_row_highlights', () => {
    it('places title-field ranges in cell_ranges.title', () => {
      const parsed = { text: 'foo', ranges: [{ offset: 0, length: 3 }] }
      const result = build_row_highlights({ matched_field: 'title', parsed })
      expect(result).to.deep.equal({
        matched_field: 'title',
        cell_ranges: { title: [{ offset: 0, length: 3 }] },
        snippet: null
      })
    })

    it('places short_description ranges in cell_ranges.title', () => {
      const parsed = { text: 'foo', ranges: [{ offset: 0, length: 3 }] }
      const result = build_row_highlights({
        matched_field: 'short_description',
        parsed
      })
      expect(result.cell_ranges.title).to.deep.equal([
        { offset: 0, length: 3 }
      ])
      expect(result.snippet).to.be.null
    })

    it('places body matches in snippet, empty cell_ranges', () => {
      const parsed = { text: 'foo bar', ranges: [{ offset: 4, length: 3 }] }
      const result = build_row_highlights({ matched_field: 'body', parsed })
      expect(result.cell_ranges).to.deep.equal({})
      expect(result.snippet).to.deep.equal({
        text: 'foo bar',
        ranges: [{ offset: 4, length: 3 }]
      })
    })

    it('places turn_text matches in snippet', () => {
      const parsed = { text: 'turn body', ranges: [{ offset: 5, length: 4 }] }
      const result = build_row_highlights({
        matched_field: 'turn_text',
        parsed
      })
      expect(result.snippet.text).to.equal('turn body')
    })

    it('returns null snippet when body has no ranges', () => {
      const parsed = { text: 'foo', ranges: [] }
      const result = build_row_highlights({ matched_field: 'body', parsed })
      expect(result.snippet).to.be.null
    })
  })

  describe('SOURCE_PRIORITY', () => {
    it('orders entity > thread_metadata > thread_timeline', () => {
      expect(SOURCE_PRIORITY.entity).to.be.lessThan(
        SOURCE_PRIORITY.thread_metadata
      )
      expect(SOURCE_PRIORITY.thread_metadata).to.be.lessThan(
        SOURCE_PRIORITY.thread_timeline
      )
    })
  })
})
