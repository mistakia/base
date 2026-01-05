import { expect } from 'chai'
import { v4 as uuid } from 'uuid'

import { build_validation_schema } from '#libs-server/entity/validate-schema.mjs'
import { load_schema_definitions_from_git } from '#libs-server/repository/git/load-schema-definitions-from-git.mjs'
import {
  clear_registered_directories,
  register_base_directories
} from '#libs-server/base-uri/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'
import create_test_user from '#tests/utils/create-test-user.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'

describe('Entity Schema Module', function () {
  let system_base_directory
  let user_base_directory
  let test_user
  let cleanup

  before(async function () {
    this.timeout(30000) // Set timeout for before hook

    // Clear any existing registry state from previous tests
    clear_registered_directories()

    test_user = await create_test_user()

    // Create a temp root repo and user repository
    const repo_setup = await create_temp_test_repo({
      register_directories: true
    })
    system_base_directory = repo_setup.system_path
    user_base_directory = repo_setup.user_path
    cleanup = repo_setup.cleanup

    // Write system (root) schemas
    await write_entity_to_git({
      base_uri: 'sys:system/schema/task.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        title: 'Task',
        type_name: 'task',
        description: 'Task schema definition',
        user_public_key: test_user.user_public_key,
        extends: 'entity',
        properties: [
          {
            name: 'status',
            type: 'string',
            enum: ['In Progress', 'Completed']
          },
          {
            name: 'priority',
            type: 'string',
            enum: ['High', 'Medium', 'Low']
          }
        ]
      },
      entity_type: 'type_definition',
      branch: 'main',
      entity_content: '# Task Schema Definition',
      commit_message: 'Add task schema'
    })

    await write_entity_to_git({
      base_uri: 'sys:system/schema/person.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        title: 'Person',
        type_name: 'person',
        description: 'Person schema definition',
        user_public_key: test_user.user_public_key,
        extends: 'entity',
        properties: [
          {
            name: 'first_name',
            type: 'string',
            min: 2
          },
          {
            name: 'last_name',
            type: 'string',
            min: 2
          }
        ]
      },
      entity_type: 'type_definition',
      branch: 'main',
      entity_content: '# Person Schema Definition',
      commit_message: 'Add person schema'
    })

    // Write user repository schemas (as type_definition with extends)
    await write_entity_to_git({
      base_uri: 'user:schema/task-extension.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        extends: 'task',
        title: 'Task Extension',
        type_name: 'task_extension',
        description: 'Task extension schema definition',
        user_public_key: test_user.user_public_key,
        properties: [
          {
            name: 'custom_field',
            type: 'string'
          }
        ]
      },
      entity_type: 'type_definition',
      branch: 'main',
      entity_content: '# Task Extension Schema',
      commit_message: 'Add task extension schema'
    })

    await write_entity_to_git({
      base_uri: 'user:schema/unknown-extension.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        extends: 'unknown_type',
        title: 'Unknown Extension',
        type_name: 'unknown_extension',
        description: 'Unknown extension schema definition',
        user_public_key: test_user.user_public_key,
        properties: [
          {
            name: 'custom_field',
            type: 'string'
          }
        ]
      },
      entity_type: 'type_definition',
      branch: 'main',
      entity_content: '# Unknown Extension Schema',
      commit_message: 'Add unknown extension schema'
    })
  })

  after(async () => {
    // Clear registry state
    clear_registered_directories()

    if (cleanup) await cleanup()
  })

  describe('load_schema_definitions_from_git', () => {
    it('should load schema definitions from repositories', async () => {
      const result = await load_schema_definitions_from_git()

      expect(result).to.have.property('task')
      expect(result).to.have.property('person')
      expect(result).to.have.property('task_extension')

      // task_extension should inherit all task properties and add custom_field
      const task_ext_props = result.task_extension.properties
      const prop_names = task_ext_props.map((p) => p.name)
      expect(prop_names).to.include('status')
      expect(prop_names).to.include('priority')
      expect(prop_names).to.include('custom_field')

      // person should have its own properties
      const person_props = result.person.properties
      const person_prop_names = person_props.map((p) => p.name)
      expect(person_prop_names).to.include('first_name')
      expect(person_prop_names).to.include('last_name')

      // task should have its own properties
      const task_props = result.task.properties
      const task_prop_names = task_props.map((p) => p.name)
      expect(task_prop_names).to.include('status')
      expect(task_prop_names).to.include('priority')

      // unknown_extension should not inherit anything (base type missing)
      expect(result.unknown_extension.properties.map((p) => p.name)).to.include(
        'custom_field'
      )
    })

    it('should handle errors during schema loading', async () => {
      // Clear registry and set invalid directories to test error handling
      clear_registered_directories()
      register_base_directories({
        system_base_directory: '/path/does/not/exist',
        user_base_directory: '/path/does/not/exist'
      })

      const result = await load_schema_definitions_from_git()

      expect(result).to.deep.equal({})
      expect(result).to.be.an('object')
      expect(result).to.be.empty
      expect(Object.keys(result)).to.have.lengthOf(0)
      expect(result).to.not.have.property('task')
      expect(result).to.not.have.property('person')

      // Restore original directories
      register_base_directories({
        system_base_directory,
        user_base_directory
      })
    })

    it('should warn about extensions for unknown entity types', async () => {
      const original_warn = console.warn
      let warning_message = null
      console.warn = (message) => {
        warning_message = message
      }
      try {
        const result = await load_schema_definitions_from_git()
        expect(warning_message).to.include('extends unknown entity type')
        expect(result).to.be.an('object')
        expect(Object.keys(result).length).to.be.at.least(1)
        expect(result).to.have.property('task_extension')
        expect(result.task_extension.properties.map((p) => p.name)).to.include(
          'custom_field'
        )
        expect(result).to.have.property('unknown_extension')
        expect(
          result.unknown_extension.properties.map((p) => p.name)
        ).to.include('custom_field')
      } finally {
        console.warn = original_warn
      }
    })
  })

  describe('build_validation_schema', () => {
    it('should build a validation schema for a given entity type', () => {
      const entity_type = 'task'
      const schemas = {
        task: {
          properties: [
            {
              name: 'status',
              type: 'string',
              enum: ['In Progress', 'Completed']
            },
            {
              name: 'priority',
              type: 'string',
              enum: ['High', 'Medium', 'Low']
            }
          ]
        }
      }
      const result = build_validation_schema(entity_type, schemas)
      expect(result).to.deep.equal({
        $$strict: false,
        title: { type: 'string', min: 1 },
        type: { type: 'string', enum: ['task'] },
        status: { type: 'string', enum: ['In Progress', 'Completed'] },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
      })
    })

    it('should return null if no schema exists for the entity type', () => {
      const entity_type = 'unknown_type'
      const schemas = {
        task: {
          properties: [
            {
              name: 'status',
              type: 'string',
              enum: ['In Progress', 'Completed']
            }
          ]
        }
      }
      const result = build_validation_schema(entity_type, schemas)
      expect(result).to.be.null
    })
  })
})
