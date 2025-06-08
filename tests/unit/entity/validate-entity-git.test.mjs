import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'

import { validate_entity_from_git } from '#libs-server/entity/git/index.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('Entity Git Validator', () => {
  let test_repo

  beforeEach(async () => {
    // Create a test repository for each test
    test_repo = await create_temp_test_repo()
  })

  afterEach(async () => {
    // Clean up after each test
    if (test_repo) {
      await test_repo.cleanup()
    }
  })

  describe('validate_entity_from_git', () => {
    it('should validate a valid entity successfully', async () => {
      // Add a valid task entity to the test repo
      const system_schema_dir = path.join(
        test_repo.system_path,
        'system/schema'
      )
      await fs.mkdir(system_schema_dir, { recursive: true })

      // Create task schema file
      await fs.writeFile(
        path.join(system_schema_dir, 'task.md'),
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
# Task Schema`
      )

      // Create a valid task entity in user directory
      const tasks_dir = path.join(test_repo.user_path, 'task')
      await fs.mkdir(tasks_dir, { recursive: true })

      await fs.writeFile(
        path.join(tasks_dir, 'test-task.md'),
        `---
title: Test Task
type: task
status: In Progress
priority: High
---

# Test Task

This is a test task that should validate successfully.
`
      )

      // Add schema to system repo git and commit
      await exec('git add system/schema/task.md', {
        cwd: test_repo.system_path
      })
      await exec('git commit -m "Add task schema"', {
        cwd: test_repo.system_path
      })

      // Add task to user repo git and commit
      await exec('git add task/test-task.md', {
        cwd: test_repo.user_path
      })
      await exec('git commit -m "Add test task"', { cwd: test_repo.user_path })

      // Create schema map by loading the schema we just added
      const schemas = {
        task: {
          name: 'task',
          type: 'type_definition',
          properties: {
            status: { type: 'string', enum: ['In Progress', 'Completed'] },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          }
        }
      }

      // Entity to validate
      const entity_properties = {
        title: 'Test Task',
        type: 'task',
        status: 'In Progress',
        priority: 'High'
      }

      // The metadata doesn't reference other entities, so it should pass validation
      const formatted_entity_metadata = {
        tags: [],
        relations: [],
        references: []
      }

      // Call the validation function (task is in user repo)
      const result = await validate_entity_from_git({
        entity_properties,
        formatted_entity_metadata,
        repo_path: test_repo.user_path,
        branch: 'main',
        schemas
      })

      // Verify results
      expect(result.success).to.be.true
      expect(result.branch).to.equal('main')
    })

    it('should fail validation for invalid entity properties', async () => {
      // Add a schema to the test repo
      const system_schema_dir = path.join(
        test_repo.system_path,
        'system/schema'
      )
      await fs.mkdir(system_schema_dir, { recursive: true })

      // Create task schema file
      await fs.writeFile(
        path.join(system_schema_dir, 'task.md'),
        `---
type: type_definition
name: task
properties:
  status:
    type: string
    enum:
      - In Progress
      - Completed
---
# Task Schema`
      )

      // Add file to git and commit
      await exec('git add system/schema/task.md', {
        cwd: test_repo.system_path
      })
      await exec('git commit -m "Add schema"', { cwd: test_repo.system_path })

      // Create schema map
      const schemas = {
        task: {
          name: 'task',
          type: 'type_definition',
          properties: [
            {
              name: 'status',
              type: 'string',
              enum: ['In Progress', 'Completed']
            }
          ]
        }
      }

      // Entity to validate with INVALID status
      const entity_properties = {
        title: 'Invalid Task',
        type: 'task',
        status: 'Not a Valid Status' // This is not in the enum
      }

      // Call the validation function
      const result = await validate_entity_from_git({
        entity_properties,
        formatted_entity_metadata: {},
        repo_path: test_repo.system_path,
        branch: 'main',
        schemas
      })

      // Verify results
      expect(result.success).to.be.false
      expect(result.errors).to.be.an('array')
      expect(result.errors.some((err) => err.includes('status'))).to.be.true
    })

    it('should fail validation for nonexistent tag references', async () => {
      // Set up schema
      const system_schema_dir = path.join(
        test_repo.system_path,
        'system/schema'
      )
      await fs.mkdir(system_schema_dir, { recursive: true })

      await fs.writeFile(
        path.join(system_schema_dir, 'task.md'),
        `---
type: type_definition
name: task
---
# Task Schema`
      )

      // Add file to git and commit
      await exec('git add system/schema/task.md', {
        cwd: test_repo.system_path
      })
      await exec('git commit -m "Add schema"', { cwd: test_repo.system_path })

      // Create entity with reference to nonexistent tag
      const entity_properties = {
        title: 'Task with Tag',
        type: 'task'
      }

      const formatted_entity_metadata = {
        property_tags: [{ base_uri: 'sys:nonexistent/tag' }],
        relations: [],
        references: []
      }

      // Call the validation function
      const result = await validate_entity_from_git({
        entity_properties,
        formatted_entity_metadata,
        repo_path: test_repo.system_path,
        branch: 'main',
        schemas: {}
      })

      // Verify results
      expect(result.success).to.be.false
      expect(result.errors).to.be.an('array')
      expect(result.errors.some((err) => err.includes('nonexistent/tag'))).to.be
        .true
    })

    it('should fail validation for nonexistent entity relations', async () => {
      // Set up schema
      const system_schema_dir = path.join(
        test_repo.system_path,
        'system/schema'
      )
      await fs.mkdir(system_schema_dir, { recursive: true })

      await fs.writeFile(
        path.join(system_schema_dir, 'task.md'),
        `---
type: type_definition
name: task
---
# Task Schema`
      )

      // Add file to git and commit
      await exec('git add system/schema/task.md', {
        cwd: test_repo.system_path
      })
      await exec('git commit -m "Add schema"', { cwd: test_repo.system_path })

      // Create entity with reference to nonexistent relation
      const entity_properties = {
        title: 'Task with Relation',
        type: 'task'
      }

      const formatted_entity_metadata = {
        tags: [],
        relations: [
          {
            base_uri: 'sys:nonexistent/entity',
            relation_type: 'depends_on',
            context: null
          }
        ],
        references: []
      }

      // Call the validation function
      const result = await validate_entity_from_git({
        entity_properties,
        formatted_entity_metadata,
        repo_path: test_repo.system_path,
        branch: 'main',
        schemas: {}
      })

      // Verify results
      expect(result.success).to.be.false
      expect(result.errors).to.be.an('array')
      expect(result.errors.some((err) => err.includes('nonexistent/entity'))).to
        .be.true
    })

    it('should fail validation when required parameters are missing', async () => {
      // Missing entity_properties
      let result = await validate_entity_from_git({
        repo_path: test_repo.system_path,
        branch: 'main'
      })

      expect(result.success).to.be.false
      expect(result.error).to.equal('Invalid entity properties')

      // Missing repo_path
      result = await validate_entity_from_git({
        entity_properties: { title: 'Test' },
        branch: 'main'
      })

      expect(result.success).to.be.false
      expect(result.error).to.equal('Repository path is required')

      // Missing branch
      result = await validate_entity_from_git({
        entity_properties: { title: 'Test' },
        repo_path: test_repo.system_path
      })

      expect(result.success).to.be.false
      expect(result.error).to.equal('Branch is required')
    })

    it('should allow entity if no schema exists for its type', async () => {
      // Create an entity with an unknown type
      const entity_properties = {
        title: 'Unknown Type Entity',
        type: 'unknown_type',
        custom_field: 'custom value'
      }

      // Call the validation function with empty schema map
      const result = await validate_entity_from_git({
        entity_properties,
        formatted_entity_metadata: {},
        repo_path: test_repo.system_path,
        branch: 'main',
        schemas: {}
      })

      // Verify results - should pass schema validation since there's no schema for unknown_type
      expect(result.success).to.be.true
    })
  })
})
