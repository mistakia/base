import { expect } from 'chai'

import {
  score_match,
  score_and_rank_results
} from '#libs-server/search/fuzzy-scorer.mjs'

describe('Fuzzy Scorer', () => {
  describe('score_match', () => {
    describe('basic character matching', () => {
      it('should return 0 for empty query', () => {
        const score = score_match({ query: '', target: 'some/path/file.js' })
        expect(score).to.equal(0)
      })

      it('should return 0 for empty target', () => {
        const score = score_match({ query: 'test', target: '' })
        expect(score).to.equal(0)
      })

      it('should return 0 for null query', () => {
        const score = score_match({ query: null, target: 'some/path' })
        expect(score).to.equal(0)
      })

      it('should return 0 for null target', () => {
        const score = score_match({ query: 'test', target: null })
        expect(score).to.equal(0)
      })

      it('should return positive score for matching characters', () => {
        const score = score_match({ query: 'abc', target: 'abc' })
        expect(score).to.be.greaterThan(0)
      })

      it('should return 0 when query characters are not found', () => {
        const score = score_match({ query: 'xyz', target: 'abc' })
        expect(score).to.equal(0)
      })

      it('should match characters in order', () => {
        const score = score_match({ query: 'ac', target: 'abc' })
        expect(score).to.be.greaterThan(0)
      })

      it('should return 0 when characters are out of order', () => {
        const score = score_match({ query: 'ca', target: 'abc' })
        expect(score).to.equal(0)
      })
    })

    describe('consecutive match bonus', () => {
      it('should score consecutive matches higher than non-consecutive', () => {
        const consecutive_score = score_match({
          query: 'abc',
          target: 'abcdef'
        })
        const non_consecutive_score = score_match({
          query: 'acd',
          target: 'abcdef'
        })
        expect(consecutive_score).to.be.greaterThan(non_consecutive_score)
      })
    })

    describe('word boundary bonuses', () => {
      it('should give bonus for match at start of string', () => {
        const start_match = score_match({ query: 'a', target: 'abc' })
        const mid_match = score_match({ query: 'b', target: 'abc' })
        expect(start_match).to.be.greaterThan(mid_match)
      })

      it('should give bonus for match after path separator', () => {
        const after_slash = score_match({ query: 'f', target: 'path/file' })
        const mid_word = score_match({ query: 'i', target: 'path/file' })
        expect(after_slash).to.be.greaterThan(mid_word)
      })

      it('should give bonus for match after underscore', () => {
        const after_underscore = score_match({ query: 'b', target: 'some_bar' })
        const mid_word = score_match({ query: 'o', target: 'some_bar' })
        expect(after_underscore).to.be.greaterThan(mid_word)
      })

      it('should give bonus for match after hyphen', () => {
        const after_hyphen = score_match({ query: 'b', target: 'some-bar' })
        const mid_word = score_match({ query: 'o', target: 'some-bar' })
        expect(after_hyphen).to.be.greaterThan(mid_word)
      })

      it('should give bonus for match after dot', () => {
        const after_dot = score_match({ query: 'j', target: 'file.js' })
        const mid_word = score_match({ query: 'i', target: 'file.js' })
        expect(after_dot).to.be.greaterThan(mid_word)
      })
    })

    describe('camelCase bonus', () => {
      it('should give bonus for uppercase after lowercase (camelCase)', () => {
        const camel_match = score_match({ query: 'B', target: 'someBar' })
        const regular_match = score_match({ query: 'a', target: 'someBar' })
        expect(camel_match).to.be.greaterThan(regular_match)
      })
    })

    describe('case match bonus', () => {
      it('should score exact case matches higher', () => {
        const exact_case = score_match({ query: 'ABC', target: 'ABC' })
        const different_case = score_match({ query: 'abc', target: 'ABC' })
        expect(exact_case).to.be.greaterThan(different_case)
      })

      it('should still match case-insensitively', () => {
        const score = score_match({ query: 'abc', target: 'ABC' })
        expect(score).to.be.greaterThan(0)
      })
    })

    describe('path length penalty', () => {
      it('should prefer shorter paths', () => {
        const short_path = score_match({ query: 'file', target: 'file.js' })
        const long_path = score_match({
          query: 'file',
          target: 'very/long/path/to/file.js'
        })
        expect(short_path).to.be.greaterThan(long_path)
      })
    })

    describe('multi-word queries', () => {
      it('should match all words in query', () => {
        const score = score_match({
          query: 'league readme',
          target: 'repository/active/league/README.md'
        })
        expect(score).to.be.greaterThan(0)
      })

      it('should return 0 if any word does not match', () => {
        const score = score_match({
          query: 'league xyz',
          target: 'repository/active/league/README.md'
        })
        expect(score).to.equal(0)
      })

      it('should sum scores from all words', () => {
        const single_word = score_match({
          query: 'league',
          target: 'repository/active/league/README.md'
        })
        const two_words = score_match({
          query: 'league read',
          target: 'repository/active/league/README.md'
        })
        expect(two_words).to.be.greaterThan(single_word)
      })

      it('should handle multiple spaces between words', () => {
        const score = score_match({
          query: 'league   readme',
          target: 'repository/active/league/README.md'
        })
        expect(score).to.be.greaterThan(0)
      })
    })
  })

  describe('score_and_rank_results', () => {
    const test_results = [
      { file_path: 'repository/active/league/README.md', type: 'file' },
      { file_path: 'repository/archive/old-league/README.md', type: 'file' },
      { file_path: 'task/league-feature.md', type: 'file' },
      { file_path: 'text/some-document.md', type: 'file' }
    ]

    it('should return empty array for empty query', () => {
      const results = score_and_rank_results({
        query: '',
        results: test_results
      })
      expect(results).to.have.lengthOf(0)
    })

    it('should return empty array for null results', () => {
      const results = score_and_rank_results({
        query: 'test',
        results: null
      })
      expect(results).to.have.lengthOf(0)
    })

    it('should return empty array for empty results', () => {
      const results = score_and_rank_results({
        query: 'test',
        results: []
      })
      expect(results).to.have.lengthOf(0)
    })

    it('should filter out non-matching results', () => {
      const results = score_and_rank_results({
        query: 'league',
        results: test_results
      })
      expect(results.every((r) => r.file_path.includes('league'))).to.be.true
    })

    it('should add score property to results', () => {
      const results = score_and_rank_results({
        query: 'league',
        results: test_results
      })
      expect(results.every((r) => typeof r.score === 'number')).to.be.true
    })

    it('should sort results by score descending', () => {
      const results = score_and_rank_results({
        query: 'league',
        results: test_results
      })
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).to.be.at.least(results[i].score)
      }
    })

    it('should respect limit parameter', () => {
      const results = score_and_rank_results({
        query: 'md',
        results: test_results,
        limit: 2
      })
      expect(results).to.have.lengthOf(2)
    })

    it('should use custom rank_field', () => {
      const custom_results = [
        { name: 'league-task', file_path: 'task/something.md' },
        { name: 'other-thing', file_path: 'task/league.md' }
      ]
      const results = score_and_rank_results({
        query: 'league',
        results: custom_results,
        rank_field: 'name'
      })
      expect(results[0].name).to.equal('league-task')
    })

    it('should handle multi-word queries', () => {
      const results = score_and_rank_results({
        query: 'league read',
        results: test_results
      })
      // Should only match paths containing both 'league' and 'read'
      expect(results.length).to.be.at.least(1)
      expect(results[0].file_path).to.include('league')
      expect(results[0].file_path.toLowerCase()).to.include('read')
    })
  })
})
