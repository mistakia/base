import { expect } from 'chai'
import {
  is_valid_base_uri,
  get_validation_error,
  VALIDATION_ERRORS,
  VALID_BASE_URI_PREFIXES,
  INVALID_PSEUDO_SCHEMES
} from '#libs-shared/relation-validator.mjs'

describe('Relation Validator', () => {
  describe('is_valid_base_uri', () => {
    describe('valid base_uris', () => {
      it('should return true for user: scheme', () => {
        expect(
          is_valid_base_uri({ base_uri: 'user:task/base/improve-relations.md' })
        ).to.be.true
      })

      it('should return true for sys: scheme', () => {
        expect(
          is_valid_base_uri({
            base_uri: 'sys:system/guideline/write-javascript.md'
          })
        ).to.be.true
      })

      it('should return true for https:// scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'https://example.com/path' })).to
          .be.true
      })

      it('should return true for http:// scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'http://example.com/path' })).to.be
          .true
      })

      it('should return true for ssh:// scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'ssh://server/path' })).to.be.true
      })

      it('should return true for git:// scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'git://github.com/repo' })).to.be
          .true
      })
    })

    describe('invalid base_uris - missing valid prefix', () => {
      it('should return false for bare path without scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'task/my-task.md' })).to.be.false
      })

      it('should return false for relative path', () => {
        expect(is_valid_base_uri({ base_uri: './path/to/file.md' })).to.be.false
      })
    })

    describe('invalid base_uris - pseudo-schemes', () => {
      it('should return false for thread: pseudo-scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'thread:abc123' })).to.be.false
      })

      it('should return false for entity: pseudo-scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'entity:some-id' })).to.be.false
      })

      it('should return false for scheme: pseudo-scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'scheme:path' })).to.be.false
      })

      it('should return false for github: pseudo-scheme', () => {
        expect(is_valid_base_uri({ base_uri: 'github:owner/repo' })).to.be.false
      })
    })

    describe('invalid base_uris - template syntax', () => {
      // eslint-disable-next-line no-template-curly-in-string
      it('should return false for ${...} template syntax', () => {
        // eslint-disable-next-line no-template-curly-in-string
        expect(is_valid_base_uri({ base_uri: 'user:task/${taskId}.md' })).to.be
          .false
      })

      it('should return false for $var template syntax', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/$taskName.md' })).to.be
          .false
      })

      it('should return false for {{...}} template syntax', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/{{name}}.md' })).to.be
          .false
      })
    })

    describe('invalid base_uris - ellipsis patterns', () => {
      it('should return false for ellipsis in path', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/.../file.md' })).to.be
          .false
      })

      it('should return false for trailing ellipsis', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/path...' })).to.be.false
      })
    })

    describe('invalid base_uris - bare words', () => {
      it('should return false for single bare word', () => {
        expect(is_valid_base_uri({ base_uri: 'filename' })).to.be.false
      })

      it('should return false for bare word with underscore', () => {
        expect(is_valid_base_uri({ base_uri: 'some_identifier' })).to.be.false
      })

      it('should return false for bare word with hyphen', () => {
        expect(is_valid_base_uri({ base_uri: 'my-task' })).to.be.false
      })
    })

    describe('invalid base_uris - code expressions', () => {
      it('should return false for comma in path', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/a,b.md' })).to.be.false
      })

      it('should return false for curly braces', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/{name}.md' })).to.be
          .false
      })

      it('should return false for square brackets', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/[0].md' })).to.be.false
      })
    })

    describe('invalid base_uris - redacted content', () => {
      it('should return false for fully redacted base_uri', () => {
        expect(is_valid_base_uri({ base_uri: '████████████████' })).to.be.false
      })

      it('should return false for partially redacted base_uri', () => {
        expect(is_valid_base_uri({ base_uri: 'user:████/task.md' })).to.be.false
      })
    })

    describe('invalid base_uris - placeholder names', () => {
      it('should return false for task-name placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/task-name.md' })).to.be
          .false
      })

      it('should return false for example placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'sys:guideline/example.md' })).to
          .be.false
      })

      it('should return false for foo placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/foo.md' })).to.be.false
      })

      it('should return false for bar placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/bar.md' })).to.be.false
      })

      it('should return false for my-task placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/my-task.md' })).to.be
          .false
      })

      it('should return false for new-task placeholder', () => {
        expect(is_valid_base_uri({ base_uri: 'user:task/new-task.md' })).to.be
          .false
      })

      it('should return true for real task names', () => {
        expect(
          is_valid_base_uri({ base_uri: 'user:task/base/improve-relations.md' })
        ).to.be.true
      })
    })

    describe('invalid base_uris - empty or invalid', () => {
      it('should return false for empty string', () => {
        expect(is_valid_base_uri({ base_uri: '' })).to.be.false
      })

      it('should return false for whitespace only', () => {
        expect(is_valid_base_uri({ base_uri: '   ' })).to.be.false
      })

      it('should return false for null', () => {
        expect(is_valid_base_uri({ base_uri: null })).to.be.false
      })

      it('should return false for undefined', () => {
        expect(is_valid_base_uri({ base_uri: undefined })).to.be.false
      })

      it('should return false for non-string', () => {
        expect(is_valid_base_uri({ base_uri: 123 })).to.be.false
      })
    })
  })

  describe('get_validation_error', () => {
    it('should return null for valid base_uri', () => {
      expect(
        get_validation_error({
          base_uri: 'user:task/base/improve-relations.md'
        })
      ).to.be.null
    })

    it('should return EMPTY_OR_INVALID for null', () => {
      expect(get_validation_error({ base_uri: null })).to.equal(
        VALIDATION_ERRORS.EMPTY_OR_INVALID
      )
    })

    it('should return MISSING_PREFIX for bare path', () => {
      expect(get_validation_error({ base_uri: 'task/file.md' })).to.equal(
        VALIDATION_ERRORS.MISSING_PREFIX
      )
    })

    it('should return INVALID_PSEUDO_SCHEME for thread:', () => {
      expect(get_validation_error({ base_uri: 'thread:abc123' })).to.equal(
        VALIDATION_ERRORS.INVALID_PSEUDO_SCHEME
      )
    })

    // eslint-disable-next-line no-template-curly-in-string
    it('should return TEMPLATE_SYNTAX for ${...}', () => {
      expect(
        // eslint-disable-next-line no-template-curly-in-string
        get_validation_error({ base_uri: 'user:task/${name}.md' })
      ).to.equal(VALIDATION_ERRORS.TEMPLATE_SYNTAX)
    })

    it('should return ELLIPSIS_PATTERN for ...', () => {
      expect(
        get_validation_error({ base_uri: 'user:task/.../file.md' })
      ).to.equal(VALIDATION_ERRORS.ELLIPSIS_PATTERN)
    })

    it('should return BARE_WORD for single word', () => {
      expect(get_validation_error({ base_uri: 'filename' })).to.equal(
        VALIDATION_ERRORS.BARE_WORD
      )
    })

    it('should return CODE_EXPRESSION for comma', () => {
      expect(get_validation_error({ base_uri: 'user:task/a,b.md' })).to.equal(
        VALIDATION_ERRORS.CODE_EXPRESSION
      )
    })

    it('should return REDACTED_CONTENT for block characters', () => {
      expect(get_validation_error({ base_uri: 'user:████/file.md' })).to.equal(
        VALIDATION_ERRORS.REDACTED_CONTENT
      )
    })

    it('should return PLACEHOLDER_NAME for example', () => {
      expect(
        get_validation_error({ base_uri: 'user:task/example.md' })
      ).to.equal(VALIDATION_ERRORS.PLACEHOLDER_NAME)
    })
  })

  describe('constants', () => {
    it('should export VALID_BASE_URI_PREFIXES', () => {
      expect(VALID_BASE_URI_PREFIXES).to.be.an('array')
      expect(VALID_BASE_URI_PREFIXES).to.include('user:')
      expect(VALID_BASE_URI_PREFIXES).to.include('sys:')
      expect(VALID_BASE_URI_PREFIXES).to.include('https://')
    })

    it('should export INVALID_PSEUDO_SCHEMES', () => {
      expect(INVALID_PSEUDO_SCHEMES).to.be.an('array')
      expect(INVALID_PSEUDO_SCHEMES).to.include('thread:')
      expect(INVALID_PSEUDO_SCHEMES).to.include('entity:')
    })

    it('should export VALIDATION_ERRORS', () => {
      expect(VALIDATION_ERRORS).to.be.an('object')
      expect(VALIDATION_ERRORS.MISSING_PREFIX).to.equal('missing_valid_prefix')
      expect(VALIDATION_ERRORS.TEMPLATE_SYNTAX).to.equal('template_syntax')
    })
  })
})
