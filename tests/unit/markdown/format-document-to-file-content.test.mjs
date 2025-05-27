import { expect } from 'chai'
import { format_document_to_file_content } from '#libs-server/markdown/format-document-to-file-content.mjs'

describe('Document Content Formatting', () => {
  describe('format_document_to_file_content', () => {
    it('should format frontmatter and content correctly', () => {
      const document_properties = {
        title: 'Test Document',
        type: 'test',
        description: 'Test description',
        tags: ['tag1', 'tag2']
      }
      const document_content = 'This is the content'

      const result = format_document_to_file_content({
        document_properties,
        document_content
      })

      expect(result).to.include('---')
      expect(result).to.include("title: 'Test Document'")
      expect(result).to.include("type: 'test'")
      expect(result).to.include('description: |')
      expect(result).to.include('  Test description')
      expect(result).to.include('tags:')
      expect(result).to.include("  - 'tag1'")
      expect(result).to.include("  - 'tag2'")
      expect(result).to.include('This is the content')
    })

    it('should handle empty content', () => {
      const document_properties = {
        title: 'Test Document',
        type: 'test',
        description: 'Test description'
      }

      const result = format_document_to_file_content({
        document_properties,
        document_content: ''
      })

      expect(result).to.include('---')
      expect(result).to.include("title: 'Test Document'")
      expect(result).to.match(/---\n\n$/m) // Should end with --- followed by blank line
    })

    it('should handle arrays and objects in frontmatter', () => {
      const document_properties = {
        title: 'Test Document',
        type: 'test',
        description: 'Test description',
        tags: ['tag1', 'tag2'],
        metadata: { key1: 'value1', key2: 'value2' }
      }

      const result = format_document_to_file_content({
        document_properties,
        document_content: 'Content'
      })

      expect(result).to.include('tags:')
      expect(result).to.include("  - 'tag1'")
      expect(result).to.include("  - 'tag2'")
      expect(result).to.include('metadata:')
      expect(result).to.include("  key1: 'value1'")
      expect(result).to.include("  key2: 'value2'")
    })

    it('should handle status field without quotes', () => {
      const document_properties = {
        title: 'Test Document',
        type: 'test',
        description: 'Test description',
        status: 'In Progress'
      }

      const result = format_document_to_file_content({
        document_properties,
        document_content: 'Content'
      })

      expect(result).to.include('status: In Progress') // No quotes
      expect(result).to.include("title: 'Test Document'") // With single quotes
    })

    it('should throw error if document properties is invalid', () => {
      expect(() =>
        format_document_to_file_content({
          document_properties: null,
          document_content: 'Content'
        })
      ).to.throw('Document properties must be a valid object')

      expect(() =>
        format_document_to_file_content({
          document_properties: 'not an object',
          document_content: 'Content'
        })
      ).to.throw('Document properties must be a valid object')
    })
  })
})
