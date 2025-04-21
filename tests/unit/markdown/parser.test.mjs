import { expect } from 'chai'
import {
  parse_markdown,
  parse_schema_file
} from '#libs-server/markdown/parser.mjs'
import { get_current_branch } from '#libs-server/git/index.mjs'
import path from 'path'

describe('Markdown Parser', () => {
  // Store current branch
  let current_system_branch

  before(async () => {
    // Get current branch
    current_system_branch = await get_current_branch('.')
  })

  describe('parse_markdown', () => {
    it('should parse markdown with frontmatter correctly', async () => {
      const file_info = {
        repo_path: '.',
        file_path: 'system/schema/task.md',
        git_path: 'system/schema/task.md',
        absolute_path: path.resolve('system/schema/task.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function
      const result = await parse_markdown(file_info)

      // Verify results
      expect(result.frontmatter.title).to.equal('Task')
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.extends).to.equal('base')
      expect(result.markdown).to.include('# Task')
      expect(result.markdown).to.include(
        'Tasks represent discrete units of work'
      )
      expect(result.type).to.equal('type_definition')
      expect(result.file_info).to.equal(file_info)
    })

    it('should throw error if type is not specified', async () => {
      const file_info = {
        repo_path: '.',
        file_path: 'tests/fixtures/no_type.md',
        git_path: 'tests/fixtures/no_type.md',
        absolute_path: path.resolve('tests/fixtures/no_type.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function and expect it to throw
      try {
        await parse_markdown(file_info)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Type not specified in frontmatter')
      }
    })

    it('should infer type for schema files', async () => {
      const file_info = {
        repo_path: '.',
        file_path: 'system/schema/person.md',
        git_path: 'system/schema/person.md',
        absolute_path: path.resolve('system/schema/person.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function
      const result = await parse_markdown(file_info)

      // Verify results
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.title).to.equal('Person')
      expect(result.type).to.equal('type_definition')
    })

    it('should handle errors from file content retrieval', async () => {
      const file_info = {
        repo_path: '.',
        file_path: 'system/non-existent-file.md',
        git_path: 'system/non-existent-file.md',
        absolute_path: path.resolve('system/non-existent-file.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function and expect it to throw
      try {
        await parse_markdown(file_info)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.equal('Failed to get file content')
      }
    })
  })

  describe('parse_schema_file', () => {
    it('should parse a type definition schema file correctly', async () => {
      const file_info = {
        repo_path: '.',
        file_path: 'system/schema/task.md',
        git_path: 'system/schema/task.md',
        absolute_path: path.resolve('system/schema/task.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function
      const result = await parse_schema_file(file_info)

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
      const file_info = {
        repo_path: '.',
        file_path: 'system/schema/type_extension.md',
        git_path: 'system/schema/type_extension.md',
        absolute_path: path.resolve('system/schema/type_extension.md'),
        git_sha: 'test-sha',
        branch: current_system_branch
      }

      // Call function
      const result = await parse_schema_file(file_info)

      // Verify results
      expect(result.frontmatter.type).to.equal('type_definition')
      expect(result.frontmatter.title).to.equal('Type Extension')
    })
  })
})
