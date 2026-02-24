import { expect } from 'chai'

import { chunk_markdown_content } from '#libs-server/search/embedding-pipeline.mjs'

describe('Embedding Pipeline', function () {
  describe('chunk_markdown_content', () => {
    it('should split content by h1 headers', () => {
      const content = '# Section One\nContent one\n# Section Two\nContent two'
      const chunks = chunk_markdown_content({
        content,
        title: 'Test',
        description: 'A test entity'
      })

      expect(chunks).to.have.lengthOf(2)
      expect(chunks[0].chunk_index).to.equal(0)
      expect(chunks[1].chunk_index).to.equal(1)
      expect(chunks[0].chunk_text).to.include('Section One')
      expect(chunks[1].chunk_text).to.include('Section Two')
    })

    it('should split content by h2 headers', () => {
      const content =
        '## Overview\nSome overview\n## Details\nSome details\n## Notes\nSome notes'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks).to.have.lengthOf(3)
    })

    it('should split content by h3 headers', () => {
      const content = '### Sub One\nText\n### Sub Two\nText'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks).to.have.lengthOf(2)
    })

    it('should not split on h4 or deeper headers', () => {
      const content = '#### Deep One\nText\n#### Deep Two\nText'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks).to.have.lengthOf(1)
    })

    it('should prepend title and description to each chunk', () => {
      const content = '# Section\nBody text'
      const chunks = chunk_markdown_content({
        content,
        title: 'My Title',
        description: 'My description'
      })

      expect(chunks[0].chunk_text).to.include('Title: My Title')
      expect(chunks[0].chunk_text).to.include('Description: My description')
    })

    it('should not prepend empty title or description', () => {
      const content = '# Section\nBody text'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks[0].chunk_text).to.not.include('Title:')
      expect(chunks[0].chunk_text).to.not.include('Description:')
    })

    it('should treat content without headers as a single chunk', () => {
      const content = 'Just some plain text\nwith multiple lines\nand no headers'
      const chunks = chunk_markdown_content({
        content,
        title: 'Test',
        description: ''
      })

      expect(chunks).to.have.lengthOf(1)
      expect(chunks[0].chunk_text).to.include('Just some plain text')
    })

    it('should compute content_hash for each chunk', () => {
      const content = '# Section\nBody'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks[0].content_hash).to.be.a('string')
      expect(chunks[0].content_hash).to.have.lengthOf(16)
    })

    it('should produce stable hashes for same content', () => {
      const content = '# Section\nBody'
      const chunks_a = chunk_markdown_content({
        content,
        title: 'Test',
        description: ''
      })
      const chunks_b = chunk_markdown_content({
        content,
        title: 'Test',
        description: ''
      })

      expect(chunks_a[0].content_hash).to.equal(chunks_b[0].content_hash)
    })

    it('should produce different hashes for different content', () => {
      const chunks_a = chunk_markdown_content({
        content: '# Section\nBody A',
        title: 'Test',
        description: ''
      })
      const chunks_b = chunk_markdown_content({
        content: '# Section\nBody B',
        title: 'Test',
        description: ''
      })

      expect(chunks_a[0].content_hash).to.not.equal(chunks_b[0].content_hash)
    })

    it('should handle empty content', () => {
      const chunks = chunk_markdown_content({
        content: '',
        title: 'Test',
        description: ''
      })

      expect(chunks).to.have.lengthOf(0)
    })

    it('should handle whitespace-only content', () => {
      const chunks = chunk_markdown_content({
        content: '   \n  \n  ',
        title: 'Test',
        description: ''
      })

      expect(chunks).to.have.lengthOf(0)
    })

    it('should handle content before first header', () => {
      const content =
        'Intro text before any header\n# First Section\nSection content'
      const chunks = chunk_markdown_content({
        content,
        title: '',
        description: ''
      })

      expect(chunks).to.have.lengthOf(2)
      expect(chunks[0].chunk_text).to.include('Intro text')
      expect(chunks[1].chunk_text).to.include('First Section')
    })
  })
})
