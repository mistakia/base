import { expect } from 'chai'
import {
  parse_relation_string,
  parse_relations_for_display,
  is_redacted_content,
  is_redacted_base_uri
} from '#libs-shared/relation-parser.mjs'

describe('Relation Parser', () => {
  describe('parse_relation_string', () => {
    it('should parse valid relation string with sys: scheme', () => {
      const result = parse_relation_string({
        relation_string: 'follows [[sys:system/guideline/example.md]]'
      })

      expect(result).to.deep.equal({
        relation_type: 'follows',
        base_uri: 'sys:system/guideline/example.md',
        context: null
      })
    })

    it('should parse valid relation string with user: scheme', () => {
      const result = parse_relation_string({
        relation_string: 'relates_to [[user:task/my-task.md]]'
      })

      expect(result).to.deep.equal({
        relation_type: 'relates_to',
        base_uri: 'user:task/my-task.md',
        context: null
      })
    })

    it('should parse relation string with https: scheme', () => {
      const result = parse_relation_string({
        relation_string: 'implements [[https://example.com/spec]]'
      })

      expect(result).to.deep.equal({
        relation_type: 'implements',
        base_uri: 'https://example.com/spec',
        context: null
      })
    })

    it('should parse relation string with context in parentheses', () => {
      const result = parse_relation_string({
        relation_string: 'blocked_by [[user:task/other.md]] (high priority)'
      })

      expect(result).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'user:task/other.md',
        context: 'high priority'
      })
    })

    it('should parse relation string with empty context as null', () => {
      const result = parse_relation_string({
        relation_string: 'relates_to [[sys:system/schema/task.md]] ()'
      })

      // Empty parentheses are normalized to null (no context)
      expect(result).to.deep.equal({
        relation_type: 'relates_to',
        base_uri: 'sys:system/schema/task.md',
        context: null
      })
    })

    it('should return null for malformed string without brackets', () => {
      const result = parse_relation_string({
        relation_string: 'follows sys:system/guideline/example.md'
      })

      expect(result).to.be.null
    })

    it('should return null for malformed string with single brackets', () => {
      const result = parse_relation_string({
        relation_string: 'follows [sys:system/guideline/example.md]'
      })

      expect(result).to.be.null
    })

    it('should return null for empty string', () => {
      const result = parse_relation_string({ relation_string: '' })

      expect(result).to.be.null
    })

    it('should return null for null input', () => {
      const result = parse_relation_string({ relation_string: null })

      expect(result).to.be.null
    })

    it('should return null for undefined input', () => {
      const result = parse_relation_string({ relation_string: undefined })

      expect(result).to.be.null
    })

    it('should return null for non-string input', () => {
      const result = parse_relation_string({ relation_string: 123 })

      expect(result).to.be.null
    })

    it('should handle relation type with underscore', () => {
      const result = parse_relation_string({
        relation_string: 'subtask_of [[user:task/parent.md]]'
      })

      expect(result).to.deep.equal({
        relation_type: 'subtask_of',
        base_uri: 'user:task/parent.md',
        context: null
      })
    })

    it('should handle relation type with hyphen', () => {
      const result = parse_relation_string({
        relation_string: 'relates-to [[user:task/other.md]]'
      })

      expect(result).to.deep.equal({
        relation_type: 'relates-to',
        base_uri: 'user:task/other.md',
        context: null
      })
    })
  })

  describe('parse_relations_for_display', () => {
    it('should parse array of valid relation strings', () => {
      const relations = [
        'follows [[sys:system/guideline/a.md]]',
        'implements [[user:workflow/b.md]]'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        relation_type: 'follows',
        base_uri: 'sys:system/guideline/a.md',
        title: null,
        context: null
      })
      expect(result[1]).to.deep.equal({
        relation_type: 'implements',
        base_uri: 'user:workflow/b.md',
        title: null,
        context: null
      })
    })

    it('should handle malformed relations with proper structure', () => {
      const relations = [
        'follows [[sys:system/guideline/a.md]]',
        'invalid relation string',
        'implements [[user:workflow/b.md]]'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(3)

      expect(result[0]).to.deep.equal({
        relation_type: 'follows',
        base_uri: 'sys:system/guideline/a.md',
        title: null,
        context: null
      })

      expect(result[1]).to.deep.equal({
        relation_type: null,
        base_uri: null,
        title: null,
        malformed: true,
        raw_string: 'invalid relation string',
        unique_key: 'malformed-1'
      })

      expect(result[2]).to.deep.equal({
        relation_type: 'implements',
        base_uri: 'user:workflow/b.md',
        title: null,
        context: null
      })
    })

    it('should return empty array for null input', () => {
      const result = parse_relations_for_display({ relations: null })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should return empty array for undefined input', () => {
      const result = parse_relations_for_display({ relations: undefined })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should return empty array for non-array input', () => {
      const result = parse_relations_for_display({ relations: 'not an array' })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should return empty array for empty array input', () => {
      const result = parse_relations_for_display({ relations: [] })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should preserve context from relation strings', () => {
      const relations = [
        'blocked_by [[user:task/blocker.md]] (waiting for review)'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        relation_type: 'blocked_by',
        base_uri: 'user:task/blocker.md',
        title: null,
        context: 'waiting for review'
      })
    })

    it('should generate unique keys for multiple malformed relations', () => {
      const relations = ['bad1', 'bad2', 'bad3']

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(3)
      expect(result[0].unique_key).to.equal('malformed-0')
      expect(result[1].unique_key).to.equal('malformed-1')
      expect(result[2].unique_key).to.equal('malformed-2')
    })

    it('should return redacted relations with redacted flag (fully redacted)', () => {
      const relations = [
        'follows [[sys:system/guideline/a.md]]',
        '████████████████████████████████████████████████', // Fully redacted (legacy)
        'implements [[user:workflow/b.md]]'
      ]

      const result = parse_relations_for_display({ relations })

      // Fully redacted relation should be returned with redacted flag
      expect(result).to.have.lengthOf(3)
      expect(result[0].base_uri).to.equal('sys:system/guideline/a.md')
      expect(result[1].redacted).to.equal(true)
      expect(result[1].unique_key).to.equal('redacted-1')
      expect(result[2].base_uri).to.equal('user:workflow/b.md')
    })

    it('should return redacted relations with structure preserved', () => {
      const relations = [
        'follows [[sys:system/guideline/a.md]]',
        'relates_to [[████-████/██-████.██]]', // Redacted with structure
        'implements [[user:workflow/b.md]]'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(3)
      expect(result[0].base_uri).to.equal('sys:system/guideline/a.md')
      expect(result[1].redacted).to.equal(true)
      expect(result[1].relation_type).to.equal('relates_to')
      expect(result[1].base_uri).to.equal('████-████/██-████.██')
      expect(result[1].unique_key).to.equal('redacted-1')
      expect(result[2].base_uri).to.equal('user:workflow/b.md')
    })

    it('should return all redacted relations with redacted flag', () => {
      const relations = [
        'follows [[████-████/████-█.██]]',
        'relates_to [[████-████/██-████.██]]',
        'implements [[████-████████/█.██]]'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)
      expect(result[0].redacted).to.equal(true)
      expect(result[0].relation_type).to.equal('follows')
      expect(result[0].unique_key).to.equal('redacted-0')
      expect(result[1].redacted).to.equal(true)
      expect(result[1].relation_type).to.equal('relates_to')
      expect(result[1].unique_key).to.equal('redacted-1')
      expect(result[2].redacted).to.equal(true)
      expect(result[2].relation_type).to.equal('implements')
      expect(result[2].unique_key).to.equal('redacted-2')
    })

    it('should handle mix of valid, malformed, and redacted relations', () => {
      const relations = [
        'follows [[sys:system/guideline/a.md]]',
        'relates_to [[████-████/██-████.██]]', // Redacted with structure
        'invalid relation string', // Malformed - returned with flag
        'implements [[user:workflow/b.md]]'
      ]

      const result = parse_relations_for_display({ relations })

      expect(result).to.have.lengthOf(4)
      expect(result[0].relation_type).to.equal('follows')
      expect(result[1].redacted).to.equal(true)
      expect(result[1].relation_type).to.equal('relates_to')
      expect(result[1].unique_key).to.equal('redacted-1')
      expect(result[2].malformed).to.equal(true)
      expect(result[2].unique_key).to.equal('malformed-2')
      expect(result[3].relation_type).to.equal('implements')
    })
  })

  describe('is_redacted_content', () => {
    it('should return true for redacted block characters', () => {
      const result = is_redacted_content(
        '████████████████████████████████████████████████'
      )

      expect(result).to.be.true
    })

    it('should return true for single block character', () => {
      const result = is_redacted_content('█')

      expect(result).to.be.true
    })

    it('should return false for normal text', () => {
      const result = is_redacted_content('follows [[sys:path.md]]')

      expect(result).to.be.false
    })

    it('should return false for empty string', () => {
      const result = is_redacted_content('')

      expect(result).to.be.false
    })

    it('should return false for null', () => {
      const result = is_redacted_content(null)

      expect(result).to.be.false
    })

    it('should return false for undefined', () => {
      const result = is_redacted_content(undefined)

      expect(result).to.be.false
    })

    it('should return false for mixed content with blocks', () => {
      const result = is_redacted_content('some ████ text')

      expect(result).to.be.false
    })
  })

  describe('is_redacted_base_uri', () => {
    it('should return true for redacted base_uri with dashes', () => {
      const result = is_redacted_base_uri('████-████/██-████.██')

      expect(result).to.be.true
    })

    it('should return true for redacted base_uri without dashes', () => {
      const result = is_redacted_base_uri('████████████')

      expect(result).to.be.true
    })

    it('should return false for normal base_uri', () => {
      const result = is_redacted_base_uri('user:task/my-task.md')

      expect(result).to.be.false
    })

    it('should return false for empty string', () => {
      const result = is_redacted_base_uri('')

      expect(result).to.be.false
    })

    it('should return false for null', () => {
      const result = is_redacted_base_uri(null)

      expect(result).to.be.false
    })

    it('should return false for mixed content', () => {
      const result = is_redacted_base_uri('user:████/task.md')

      expect(result).to.be.false
    })
  })
})
