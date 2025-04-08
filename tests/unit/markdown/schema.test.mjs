import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import { exec } from 'child_process'

import {
  load_schema_definitions,
  build_validation_schema
} from '#libs-server/markdown/schema.mjs'
import { format_repository } from '#libs-server/markdown/index.mjs'
import { get_current_branch } from '#libs-server/git/git_operations.mjs'

const execute = promisify(exec)

describe('Schema Module', () => {
  // Store current branch and test repo paths
  let current_system_branch
  let current_user_branch
  let system_base_directory
  let user_base_directory

  // Set up test repositories with schema files
  before(async () => {
    // Get current branch
    current_system_branch = await get_current_branch('.')

    // Create temporary directories for test repos
    const temp_dir = os.tmpdir()
    system_base_directory = path.join(
      temp_dir,
      `schema-test-system-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    user_base_directory = path.join(
      temp_dir,
      `schema-test-user-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Create system repository with schema files
    await fs.mkdir(path.join(system_base_directory, 'schema'), {
      recursive: true
    })
    await execute('git init', { cwd: system_base_directory })
    await execute('git config user.name "Test User"', {
      cwd: system_base_directory
    })
    await execute('git config user.email "test@example.com"', {
      cwd: system_base_directory
    })

    // Create task schema file
    await fs.writeFile(
      path.join(system_base_directory, 'schema', 'task.md'),
      `---
type: type_definition
name: task
properties:
  status:
    type: string
    enum:
      - In Progress
      - Completed
  priority:
    type: string
    enum:
      - High
      - Medium
      - Low
---
# Task Schema Definition`
    )

    // Create person schema file
    await fs.writeFile(
      path.join(system_base_directory, 'schema', 'person.md'),
      `---
type: type_definition
name: person
properties:
  first_name:
    type: string
    min: 2
  last_name:
    type: string
    min: 2
---
# Person Schema Definition`
    )

    // Commit schema files
    await execute('git add schema/task.md schema/person.md', {
      cwd: system_base_directory
    })
    await execute('git commit -m "Add schema files"', {
      cwd: system_base_directory
    })
    await execute('git branch -M main', { cwd: system_base_directory })
    current_system_branch = 'main'

    // Create user repository with extension schema
    await fs.mkdir(path.join(user_base_directory, 'schema'), {
      recursive: true
    })
    await execute('git init', { cwd: user_base_directory })
    await execute('git config user.name "Test User"', {
      cwd: user_base_directory
    })
    await execute('git config user.email "test@example.com"', {
      cwd: user_base_directory
    })

    // Create task extension schema file
    await fs.writeFile(
      path.join(user_base_directory, 'schema', 'task_extension.md'),
      `---
type: type_extension
extends: task
name: task_extension
properties:
  custom_field:
    type: string
---
# Task Extension Schema`
    )

    // Create a schema extension for an unknown type (for testing warnings)
    await fs.writeFile(
      path.join(user_base_directory, 'schema', 'unknown_extension.md'),
      `---
type: type_extension
extends: unknown_type
name: unknown_extension
properties:
  custom_field:
    type: string
---
# Unknown Extension Schema`
    )

    // Commit schema files
    await execute(
      'git add schema/task_extension.md schema/unknown_extension.md',
      { cwd: user_base_directory }
    )
    await execute('git commit -m "Add extension schemas"', {
      cwd: user_base_directory
    })
    await execute('git branch -M main', { cwd: user_base_directory })
    current_user_branch = 'main'
  })

  // Clean up after tests
  after(async () => {
    try {
      await fs.rm(system_base_directory, { recursive: true, force: true })
      await fs.rm(user_base_directory, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test repositories:', error)
    }
  })

  describe('load_schema_definitions', () => {
    it('should load schema definitions from repositories', async () => {
      // Setup temp repo paths for the test
      const system_repository = {
        type: 'system',
        branch: current_system_branch,
        path: system_base_directory,
        is_submodule: false
      }

      const user_repository = {
        type: 'user',
        branch: current_user_branch,
        path: user_base_directory,
        is_submodule: true
      }

      // Call the function with the test repositories
      const result = await load_schema_definitions({
        system_repository,
        user_repository
      })

      // Verify results
      expect(result).to.have.property('task')
      expect(result).to.have.property('person')

      // Check that the task schema has been extended
      expect(result.task.properties).to.have.property('status')
      expect(result.task.properties).to.have.property('priority')
      expect(result.task.properties).to.have.property('custom_field')

      // Check that the person schema was loaded
      expect(result.person.properties).to.have.property('first_name')
      expect(result.person.properties).to.have.property('last_name')

      // Check detailed structure of the task schema
      expect(result.task).to.have.property('type', 'type_definition')
      expect(result.task).to.have.property('name', 'task')
      expect(result.task).to.have.property('source_file', 'schema/task.md')
      expect(result.task.properties.status).to.have.property('type', 'string')
      expect(result.task.properties.status.enum).to.include('In Progress')
      expect(result.task.properties.status.enum).to.include('Completed')
      expect(result.task.properties.priority).to.have.property('type', 'string')
      expect(result.task.properties.priority.enum).to.deep.equal([
        'High',
        'Medium',
        'Low'
      ])
      expect(result.task.properties.custom_field).to.have.property(
        'type',
        'string'
      )

      // Check extensions array for task
      expect(result.task).to.have.property('extensions')
      expect(result.task.extensions).to.be.an('array').with.lengthOf(1)
      expect(result.task.extensions[0]).to.have.property(
        'name',
        'task_extension'
      )
      expect(result.task.extensions[0]).to.have.property(
        'source_file',
        'schema/task_extension.md'
      )

      // Check detailed structure of the person schema
      expect(result.person).to.have.property('type', 'type_definition')
      expect(result.person).to.have.property('name', 'person')
      expect(result.person).to.have.property('source_file', 'schema/person.md')
      expect(result.person.properties.first_name).to.have.property(
        'type',
        'string'
      )
      expect(result.person.properties.first_name).to.have.property('min', 2)
      expect(result.person.properties.last_name).to.have.property(
        'type',
        'string'
      )
      expect(result.person.properties.last_name).to.have.property('min', 2)

      // Verify schema count
      expect(Object.keys(result)).to.have.lengthOf(2)
    })

    it('should handle errors during schema loading', async () => {
      // Setup with invalid repository paths
      const system_repository = format_repository({
        type: 'system',
        branch: 'nonexistent-branch',
        path: '/path/does/not/exist'
      })

      const user_repository = format_repository({
        type: 'user',
        branch: 'nonexistent-branch',
        path: '/path/does/not/exist'
      })

      // Call the function with invalid repositories
      const result = await load_schema_definitions({
        system_repository,
        user_repository
      })

      // Verify results - should return an empty object on error
      expect(result).to.deep.equal({})

      // Additional checks for the return value
      expect(result).to.be.an('object')
      expect(result).to.be.empty
      expect(Object.keys(result)).to.have.lengthOf(0)
      expect(result).to.not.have.property('task')
      expect(result).to.not.have.property('person')
    })

    it('should warn about extensions for unknown base types', async () => {
      // Setup to capture console warnings
      const original_warn = console.warn
      let warning_message = null
      console.warn = (message) => {
        warning_message = message
      }

      // Setup repositories for the test
      const system_repository = {
        type: 'system',
        branch: current_system_branch,
        path: system_base_directory,
        is_submodule: false
      }

      const user_repository = {
        type: 'user',
        branch: current_user_branch,
        path: user_base_directory,
        is_submodule: true
      }

      try {
        // Call the function
        const result = await load_schema_definitions({
          system_repository,
          user_repository
        })

        // Verify a warning was logged
        expect(warning_message).to.include('references unknown base type')

        // Check the return value structure
        expect(result).to.be.an('object')
        expect(Object.keys(result).length).to.be.at.least(1)

        // Verify the task schema is correct
        expect(result).to.have.property('task')
        expect(result.task).to.have.property('properties')
        expect(result.task.properties).to.have.property('status')
        expect(result.task.properties).to.have.property('priority')
        expect(result.task.properties).to.have.property('custom_field')

        // Verify task extension is correctly applied
        expect(result.task).to.have.property('extensions')
        expect(result.task.extensions).to.be.an('array')
        expect(result.task.extensions[0]).to.have.property(
          'name',
          'task_extension'
        )

        // Verify the person schema is included
        expect(result).to.have.property('person')
        expect(result.person).to.have.property('properties')
        expect(result.person.properties).to.have.property('first_name')
        expect(result.person.properties).to.have.property('last_name')

        // Verify unknown type was not added to schema
        expect(result).to.not.have.property('unknown_type')
      } finally {
        // Restore console.warn
        console.warn = original_warn
      }
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
