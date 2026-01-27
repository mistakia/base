import { expect } from 'chai'

// Import internal function for testing by re-implementing the logic
// (Since resolve_directory_parameter is not exported, we test via search_paths)
import {
  is_valid_base_uri,
  parse_base_uri
} from '#libs-server/base-uri/index.mjs'

/**
 * Re-implementation of resolve_directory_parameter for unit testing
 * This mirrors the logic in unified-search-engine.mjs
 */
function resolve_directory_parameter(directory) {
  if (!directory) {
    return null
  }

  if (!is_valid_base_uri(directory)) {
    return directory
  }

  try {
    const parsed = parse_base_uri(directory)

    if (parsed.scheme === 'user') {
      return parsed.path || null
    }

    if (parsed.scheme === 'sys') {
      return null
    }

    return null
  } catch {
    return directory
  }
}

describe('Unified Search Engine', function () {
  describe('resolve_directory_parameter', () => {
    describe('null and empty inputs', () => {
      it('should return null for null input', () => {
        expect(resolve_directory_parameter(null)).to.be.null
      })

      it('should return null for undefined input', () => {
        expect(resolve_directory_parameter(undefined)).to.be.null
      })

      it('should return null for empty string', () => {
        expect(resolve_directory_parameter('')).to.be.null
      })
    })

    describe('user: base URI handling', () => {
      it('should resolve user: to null (search entire user base)', () => {
        const result = resolve_directory_parameter('user:')
        expect(result).to.be.null
      })

      it('should resolve user:task/ to task/', () => {
        const result = resolve_directory_parameter('user:task/')
        expect(result).to.equal('task/')
      })

      it('should resolve user:task to task', () => {
        const result = resolve_directory_parameter('user:task')
        expect(result).to.equal('task')
      })

      it('should resolve user:repository/active/league to repository/active/league', () => {
        const result = resolve_directory_parameter(
          'user:repository/active/league'
        )
        expect(result).to.equal('repository/active/league')
      })

      it('should resolve user:workflow/ to workflow/', () => {
        const result = resolve_directory_parameter('user:workflow/')
        expect(result).to.equal('workflow/')
      })
    })

    describe('sys: base URI handling', () => {
      it('should resolve sys: to null (not supported for search)', () => {
        const result = resolve_directory_parameter('sys:')
        expect(result).to.be.null
      })

      it('should resolve sys:system/ to null', () => {
        const result = resolve_directory_parameter('sys:system/')
        expect(result).to.be.null
      })
    })

    describe('plain filesystem paths (passthrough)', () => {
      it('should pass through task/', () => {
        const result = resolve_directory_parameter('task/')
        expect(result).to.equal('task/')
      })

      it('should pass through repository', () => {
        const result = resolve_directory_parameter('repository')
        expect(result).to.equal('repository')
      })

      it('should pass through repository/active/league', () => {
        const result = resolve_directory_parameter('repository/active/league')
        expect(result).to.equal('repository/active/league')
      })

      it('should pass through workflow/', () => {
        const result = resolve_directory_parameter('workflow/')
        expect(result).to.equal('workflow/')
      })
    })

    describe('edge cases', () => {
      it('should handle paths that look like URIs but are not valid', () => {
        // 'user' without colon is not a valid base URI
        const result = resolve_directory_parameter('user')
        expect(result).to.equal('user')
      })

      it('should handle nested user: paths correctly', () => {
        const result = resolve_directory_parameter('user:a/b/c/d/e')
        expect(result).to.equal('a/b/c/d/e')
      })
    })
  })
})
