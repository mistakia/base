import { expect } from 'chai'
import sinon from 'sinon'
import {
  load_schema_definitions,
  build_validation_schema
} from '#libs-server/markdown/schema.mjs'
import { format_repository } from '#libs-server/markdown/index.mjs'
import scanner from '#libs-server/markdown/scanner.mjs'
import parser from '#libs-server/markdown/parser.mjs'
import { get_current_branch } from '#libs-server/utils/git.mjs'

describe('Schema Module', () => {
  // Store current branch
  let current_system_branch
  let current_user_branch

  // Set up stubs
  let scan_repositories_stub
  let parse_schema_file_stub

  before(async () => {
    // Get current branch
    current_system_branch = await get_current_branch('.')
    current_user_branch = await get_current_branch('./data')
  })

  beforeEach(() => {
    // Create stubs
    scan_repositories_stub = sinon.stub(scanner, 'scan_repositories')
    parse_schema_file_stub = sinon.stub(parser, 'parse_schema_file')
  })

  afterEach(() => {
    // Restore stubs
    sinon.restore()
  })

  describe('load_schema_definitions', () => {
    it('should load schema definitions from repositories', async () => {
      // Set up mocks
      scan_repositories_stub.resolves([
        {
          repo_type: 'system',
          repo_path: './system',
          file_path: 'schema/task.md',
          git_path: 'system/schema/task.md',
          absolute_path: '/Users/trashman/Projects/base/system/schema/task.md',
          git_sha: 'abc123',
          branch: current_system_branch,
          is_submodule: false
        },
        {
          repo_type: 'system',
          repo_path: './system',
          file_path: 'schema/person.md',
          git_path: 'system/schema/person.md',
          absolute_path:
            '/Users/trashman/Projects/base/system/schema/person.md',
          git_sha: 'def456',
          branch: current_system_branch,
          is_submodule: false
        },
        {
          repo_type: 'user',
          repo_path: './data',
          file_path: 'schema/task_extension.md',
          git_path: 'schema/task_extension.md',
          absolute_path:
            '/Users/trashman/Projects/base/data/schema/task_extension.md',
          git_sha: 'ghi789',
          branch: current_user_branch,
          is_submodule: true
        }
      ])

      // Mock parse_schema_file to return different parsed data for each file
      parse_schema_file_stub.callsFake(async (file) => {
        if (file.file_path === 'schema/task.md') {
          return {
            frontmatter: {
              type: 'type_definition',
              name: 'task',
              properties: {
                status: { type: 'string', enum: ['In Progress', 'Completed'] },
                priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
              }
            }
          }
        } else if (file.file_path === 'schema/person.md') {
          return {
            frontmatter: {
              type: 'type_definition',
              name: 'person',
              properties: {
                first_name: { type: 'string', min: 2 },
                last_name: { type: 'string', min: 2 }
              }
            }
          }
        } else if (file.file_path === 'schema/task_extension.md') {
          return {
            frontmatter: {
              type: 'type_extension',
              extends: 'task',
              name: 'task_extension',
              properties: {
                custom_field: { type: 'string' }
              }
            }
          }
        }
        return null
      })

      // Call the function with branch parameter
      const result = await load_schema_definitions({
        system_repository: format_repository({
          type: 'system',
          branch: current_system_branch
        }),
        user_repository: format_repository({
          type: 'user',
          branch: current_user_branch
        })
      })

      // Verify results
      expect(scan_repositories_stub.called).to.be.true
      expect(parse_schema_file_stub.callCount).to.equal(3)

      // Check the schema map contains the expected schemas
      expect(result).to.have.property('task')
      expect(result).to.have.property('person')

      // Check that the task schema has been extended
      expect(result.task.properties).to.have.property('status')
      expect(result.task.properties).to.have.property('priority')
      expect(result.task.properties).to.have.property('custom_field')

      // Check that the person schema was loaded
      expect(result.person.properties).to.have.property('first_name')
      expect(result.person.properties).to.have.property('last_name')
    })

    it('should handle errors during schema loading', async () => {
      // Set up mocks
      scan_repositories_stub.resolves([
        {
          repo_type: 'system',
          repo_path: './system',
          file_path: 'schema/task.md',
          git_path: 'system/schema/task.md',
          absolute_path: '/Users/trashman/Projects/base/system/schema/task.md',
          git_sha: 'abc123',
          branch: current_system_branch,
          is_submodule: false
        }
      ])

      // Mock parse_schema_file to throw an error
      parse_schema_file_stub.rejects(new Error('Failed to parse schema file'))

      // Call the function
      const result = await load_schema_definitions({
        system_repository: format_repository({ type: 'system' }),
        user_repository: format_repository({ type: 'user' })
      })

      // Verify results - should return an empty object
      expect(result).to.deep.equal({})
    })

    it('should warn about extensions for unknown base types', async () => {
      // Set up spy for console.warn
      const warn_spy = sinon.spy(console, 'warn')

      // Set up mocks
      scan_repositories_stub.resolves([
        {
          repo_type: 'user',
          repo_path: './data',
          file_path: 'schema/unknown_extension.md',
          git_path: 'schema/unknown_extension.md',
          absolute_path:
            '/Users/trashman/Projects/base/data/schema/unknown_extension.md',
          git_sha: 'abc123',
          branch: current_user_branch,
          is_submodule: true
        }
      ])

      // Mock parse_schema_file to return an extension for an unknown type
      parse_schema_file_stub.resolves({
        frontmatter: {
          type: 'type_extension',
          extends: 'unknown_type',
          name: 'unknown_extension',
          properties: {
            custom_field: { type: 'string' }
          }
        }
      })

      // Call the function
      await load_schema_definitions({
        system_repository: format_repository({ type: 'system' }),
        user_repository: format_repository({ type: 'user' })
      })

      // Verify a warning was logged
      expect(warn_spy.calledWith(sinon.match(/references unknown base type/)))
        .to.be.true
    })
  })

  describe('build_validation_schema', () => {
    it('should build a validation schema for a given entity type', () => {
      // Set up test data
      const entity_type = 'task'
      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      // Call the function
      const result = build_validation_schema(entity_type, schemas)

      // Verify results
      expect(result).to.deep.equal({
        $$strict: false,
        title: { type: 'string', min: 1 },
        type: { type: 'string', enum: ['task'] },
        status: { type: 'string', enum: ['In Progress', 'Completed'] },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
      })
    })

    it('should return null if no schema exists for the entity type', () => {
      // Set up test data
      const entity_type = 'unknown_type'
      const schemas = {
        task: {
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] }
          }
        }
      }

      // Call the function
      const result = build_validation_schema(entity_type, schemas)

      // Verify results
      expect(result).to.be.null
    })
  })
})
