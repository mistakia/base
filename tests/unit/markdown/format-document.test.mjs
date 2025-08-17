import { expect } from 'chai'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import fs from 'fs/promises'

describe('Markdown Document Formatter', () => {
  describe('format_document_from_file_content', () => {
    it('should parse markdown with frontmatter correctly', async () => {
      const file_path = 'system/schema/task.md'

      // Read file content
      const content = await fs.readFile(file_path, 'utf-8')

      // Call function with content and file_path
      const result = await format_document_from_file_content({
        file_content: content,
        file_path
      })

      // Verify results
      expect(result.document_properties.title).to.equal('Task Schema')
      expect(result.document_properties.type).to.equal('type_definition')
      expect(result.document_properties.extends).to.equal('entity')
      expect(result.document_content).to.include('# Task')
      expect(result.document_content).to.include(
        'Tasks represent discrete units of work'
      )
      expect(result.tokens).to.be.an('array')
    })

    it('should throw error if file content is not provided', async () => {
      try {
        await format_document_from_file_content({
          file_path: 'some/file.md'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('File content is required')
      }
    })

    it('should throw error if file path is not provided', async () => {
      try {
        await format_document_from_file_content({
          file_content: 'Some content'
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('File path is required')
      }
    })

    it('should extract document properties correctly from schema files', async () => {
      const file_path = 'system/schema/person.md'

      // Read file content
      const content = await fs.readFile(file_path, 'utf-8')

      // Call function with content and file_path
      const result = await format_document_from_file_content({
        file_content: content,
        file_path
      })

      // Verify results
      expect(result.document_properties.type).to.equal('type_definition')
      expect(result.document_properties.title).to.equal('Person Schema')
    })

    it('should clean invisible characters from content', async () => {
      const file_path = 'test-file.md'
      const content = `---
title: Test
type: test
---
\u200B\u200C\u200D\u200E\u200F\uFEFF
# Test Document
`

      const result = await format_document_from_file_content({
        file_content: content,
        file_path
      })

      expect(result.document_content).to.equal('# Test Document')
    })

    it('should handle empty frontmatter gracefully', async () => {
      const file_path = 'test-file.md'
      const content = `---
---

# Just Content
No frontmatter properties.
`

      const result = await format_document_from_file_content({
        file_content: content,
        file_path
      })

      expect(result.document_properties).to.be.an('object')
      expect(Object.keys(result.document_properties).length).to.equal(0)
      expect(result.document_content).to.include('# Just Content')
    })

    it('should generate markdown tokens for the document content', async () => {
      const file_path = 'test-file.md'
      const content = `---
title: Test Tokens
---

# Heading 1
## Heading 2

- List item 1
- List item 2

Paragraph with **bold** and *italic* text.
`

      const result = await format_document_from_file_content({
        file_content: content,
        file_path
      })

      expect(result.tokens).to.be.an('array')
      expect(result.tokens.length).to.be.greaterThan(0)

      // Find heading tokens
      const heading1Token = result.tokens.find(
        (token) => token.type === 'heading_open' && token.tag === 'h1'
      )
      const heading2Token = result.tokens.find(
        (token) => token.type === 'heading_open' && token.tag === 'h2'
      )

      expect(heading1Token).to.exist
      expect(heading2Token).to.exist
    })
  })
})
