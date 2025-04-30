import { expect } from 'chai'
import { parse_markdown_content } from '#libs-server/markdown/processor/markdown-parser.mjs'
import { process_markdown_schema_from_file } from '#libs-server/markdown/processor/markdown-processor.mjs'
import path from 'path'
import fs from 'fs/promises'

describe('Markdown Parser', () => {
  describe('parse_markdown_content', () => {
    it('should parse markdown with frontmatter correctly', async () => {
      const file_path = 'system/schema/task.md'

      // Read file content
      const content = await fs.readFile(file_path, 'utf-8')

      // Call function with content and file_path
      const result = await parse_markdown_content({ content, file_path })

      // Verify results
      expect(result.frontmatter.title).to.equal('Task')
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.extends).to.equal('base')
      expect(result.markdown).to.include('# Task')
      expect(result.markdown).to.include(
        'Tasks represent discrete units of work'
      )
      expect(result.type).to.equal('type_definition')
      expect(result.file_path).to.equal(file_path)
    })

    it('should throw error if type is not specified', async () => {
      const file_path = 'tests/fixtures/no-type.md'

      // Read file content
      const content = await fs.readFile(file_path, 'utf-8')

      // Call function and expect it to throw
      try {
        await parse_markdown_content({ content, file_path })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Type not specified in frontmatter')
      }
    })

    it('should infer type for schema files', async () => {
      const file_path = 'system/schema/person.md'

      // Read file content
      const content = await fs.readFile(file_path, 'utf-8')

      // Call function with content and file_path
      const result = await parse_markdown_content({ content, file_path })

      // Verify results
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.title).to.equal('Person')
      expect(result.type).to.equal('type_definition')
    })
  })

  describe('process_markdown_schema_from_file', () => {
    it('should parse a type definition schema file correctly', async () => {
      // Call function
      const result = await process_markdown_schema_from_file({
        absolute_path: path.resolve('system/schema/task.md')
      })

      // Verify results
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.title).to.equal('Task')
      expect(result.frontmatter.extends).to.equal('base')
      expect(result.frontmatter.properties).to.be.an('array')
      expect(
        result.frontmatter.properties.find((prop) => prop.name === 'status')
      ).to.deep.include({
        name: 'status',
        type: 'string',
        required: false
      })
      expect(
        result.frontmatter.properties.find((prop) => prop.name === 'priority')
      ).to.deep.include({
        name: 'priority',
        type: 'string',
        required: false
      })
    })

    it('should handle type extension schema files correctly', async () => {
      // Call function
      const result = await process_markdown_schema_from_file({
        absolute_path: path.resolve('system/schema/type-extension.md')
      })

      // Verify results
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.title).to.equal('Type Extension')
    })
  })
})
