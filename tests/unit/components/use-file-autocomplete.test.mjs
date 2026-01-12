import { expect } from 'chai'

// Note: Full hook testing requires React testing utilities which are not currently installed.
// This test file focuses on the pure helper function that can be tested without React.
//
// The extract_at_search_term function is re-implemented here because client code uses
// webpack aliases (@core, @components) that aren't available in Node.js test environment.
// The implementation must match use-file-autocomplete.js

/**
 * Extract the @ search term from text at a given cursor position.
 * Returns null if cursor is not in an @ context.
 */
const extract_at_search_term = (text, cursor_position) => {
  if (!text || cursor_position < 1) {
    return null
  }

  let at_position = -1
  for (let i = cursor_position - 1; i >= 0; i--) {
    const char = text[i]
    if (/\s/.test(char)) {
      break
    }
    if (char === '@') {
      at_position = i
      break
    }
  }

  if (at_position === -1) {
    return null
  }

  const search_term = text.slice(at_position + 1, cursor_position)
  return { search_term, at_position }
}

describe('useFileAutocomplete - extract_at_search_term', () => {
  describe('basic @ detection', () => {
    it('should return null for empty text', () => {
      const result = extract_at_search_term('', 0)
      expect(result).to.be.null
    })

    it('should return null for cursor at position 0', () => {
      const result = extract_at_search_term('@test', 0)
      expect(result).to.be.null
    })

    it('should return null when no @ is present', () => {
      const result = extract_at_search_term('hello world', 5)
      expect(result).to.be.null
    })

    it('should detect @ at start of text', () => {
      const result = extract_at_search_term('@', 1)
      expect(result).to.deep.equal({ search_term: '', at_position: 0 })
    })

    it('should extract search term after @', () => {
      const result = extract_at_search_term('@test', 5)
      expect(result).to.deep.equal({ search_term: 'test', at_position: 0 })
    })

    it('should extract partial search term based on cursor', () => {
      const result = extract_at_search_term('@testing', 4)
      expect(result).to.deep.equal({ search_term: 'tes', at_position: 0 })
    })
  })

  describe('@ in middle of text', () => {
    it('should detect @ after space', () => {
      const result = extract_at_search_term('hello @world', 12)
      expect(result).to.deep.equal({ search_term: 'world', at_position: 6 })
    })

    it('should detect @ after newline', () => {
      const result = extract_at_search_term('hello\n@world', 12)
      expect(result).to.deep.equal({ search_term: 'world', at_position: 6 })
    })

    it('should detect @ after tab', () => {
      const result = extract_at_search_term('hello\t@world', 12)
      expect(result).to.deep.equal({ search_term: 'world', at_position: 6 })
    })

    it('should handle cursor in the middle of @ mention', () => {
      const result = extract_at_search_term('hello @filepath.js more', 14)
      expect(result).to.deep.equal({ search_term: 'filepat', at_position: 6 })
    })
  })

  describe('whitespace boundaries', () => {
    it('should return null when cursor is after whitespace following @', () => {
      const result = extract_at_search_term('@test file', 10)
      expect(result).to.be.null
    })

    it('should stop at whitespace before @', () => {
      const result = extract_at_search_term('prefix @suffix', 14)
      expect(result).to.deep.equal({ search_term: 'suffix', at_position: 7 })
    })

    it('should not find @ across whitespace boundary', () => {
      const result = extract_at_search_term('@ test', 6)
      expect(result).to.be.null
    })
  })

  describe('multiple @ characters', () => {
    it('should find the nearest @ to cursor', () => {
      const result = extract_at_search_term('@first @second', 14)
      expect(result).to.deep.equal({ search_term: 'second', at_position: 7 })
    })

    it('should find first @ when cursor is near start', () => {
      const result = extract_at_search_term('@first @second', 5)
      expect(result).to.deep.equal({ search_term: 'firs', at_position: 0 })
    })
  })

  describe('path-like patterns', () => {
    it('should handle path with slashes', () => {
      const result = extract_at_search_term('@src/components/Button.js', 25)
      expect(result).to.deep.equal({
        search_term: 'src/components/Button.js',
        at_position: 0
      })
    })

    it('should handle partial path', () => {
      const result = extract_at_search_term('@src/com', 8)
      expect(result).to.deep.equal({ search_term: 'src/com', at_position: 0 })
    })

    it('should handle path with dots', () => {
      const result = extract_at_search_term('@file.test.js', 13)
      expect(result).to.deep.equal({
        search_term: 'file.test.js',
        at_position: 0
      })
    })

    it('should handle relative paths', () => {
      const result = extract_at_search_term('@../parent/file.js', 18)
      expect(result).to.deep.equal({
        search_term: '../parent/file.js',
        at_position: 0
      })
    })
  })

  describe('real-world usage patterns', () => {
    it('should work in a sentence context', () => {
      const text = 'Please check @config.json for settings'
      const result = extract_at_search_term(text, 25) // cursor after "config.json"
      expect(result).to.deep.equal({
        search_term: 'config.json',
        at_position: 13
      })
    })

    it('should work in multiline input', () => {
      const text = 'First line\nSecond @file.txt line'
      const result = extract_at_search_term(text, 27)
      expect(result).to.deep.equal({
        search_term: 'file.txt',
        at_position: 18
      })
    })

    it('should handle just typing @', () => {
      const text = 'Check the @'
      const result = extract_at_search_term(text, 11)
      expect(result).to.deep.equal({ search_term: '', at_position: 10 })
    })

    it('should handle typing after @', () => {
      const text = 'Check the @s'
      const result = extract_at_search_term(text, 12)
      expect(result).to.deep.equal({ search_term: 's', at_position: 10 })
    })
  })

  describe('edge cases', () => {
    it('should handle null text', () => {
      const result = extract_at_search_term(null, 5)
      expect(result).to.be.null
    })

    it('should handle undefined text', () => {
      const result = extract_at_search_term(undefined, 5)
      expect(result).to.be.null
    })

    it('should handle negative cursor position', () => {
      const result = extract_at_search_term('@test', -1)
      expect(result).to.be.null
    })

    it('should handle cursor beyond text length', () => {
      const result = extract_at_search_term('@test', 100)
      expect(result).to.deep.equal({ search_term: 'test', at_position: 0 })
    })
  })
})
