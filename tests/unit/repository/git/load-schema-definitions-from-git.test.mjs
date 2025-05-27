import { expect } from 'chai'
import { v4 as uuid } from 'uuid'

import { load_schema_definitions_from_git } from '#libs-server/repository/git/load-schema-definitions-from-git.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'
import create_test_user from '#tests/utils/create-test-user.mjs'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'

describe('load_schema_definitions_from_git', () => {
  let root_base_directory
  let user_base_directory
  let test_user
  let cleanup

  before(async () => {
    test_user = await create_test_user()

    // Create a temp root repo and user submodule
    const repo_setup = await create_temp_test_repo()
    root_base_directory = repo_setup.path
    user_base_directory = repo_setup.user_path
    cleanup = repo_setup.cleanup

    // Write system (root) schemas
    await write_entity_to_git({
      repo_path: root_base_directory,
      git_relative_path: 'system/schema/task.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        title: 'Task',
        type_name: 'task',
        description: 'Task schema definition',
        user_id: test_user.user_id,
        extends: 'base',
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
      repo_path: root_base_directory,
      git_relative_path: 'system/schema/person.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        title: 'Person',
        type_name: 'person',
        description: 'Person schema definition',
        user_id: test_user.user_id,
        extends: 'base',
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

    // Write user (submodule) schemas (as type_definition with extends)
    await write_entity_to_git({
      repo_path: user_base_directory,
      git_relative_path: 'schema/task-extension.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        extends: 'task',
        title: 'Task Extension',
        type_name: 'task_extension',
        description: 'Task extension schema definition',
        user_id: test_user.user_id,
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
      repo_path: user_base_directory,
      git_relative_path: 'schema/unknown-extension.md',
      entity_properties: {
        entity_id: uuid(),
        type: 'type_definition',
        extends: 'unknown_type',
        title: 'Unknown Extension',
        type_name: 'unknown_extension',
        description: 'Unknown extension schema definition',
        user_id: test_user.user_id,
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
    if (cleanup) await cleanup()
  })

  it('should load schema definitions from repositories', async () => {
    const result = await load_schema_definitions_from_git({
      root_base_directory,
      user_base_directory
    })

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
    const result = await load_schema_definitions_from_git({
      root_base_directory: '/path/does/not/exist',
      user_base_directory: '/path/does/not/exist'
    })

    expect(result).to.deep.equal({})
    expect(result).to.be.an('object')
    expect(result).to.be.empty
    expect(Object.keys(result)).to.have.lengthOf(0)
    expect(result).to.not.have.property('task')
    expect(result).to.not.have.property('person')
  })

  it('should warn about extensions for unknown base types', async () => {
    const original_warn = console.warn
    let warning_message = null
    console.warn = (message) => {
      warning_message = message
    }

    try {
      const result = await load_schema_definitions_from_git({
        root_base_directory,
        user_base_directory
      })

      expect(warning_message).to.include('extends unknown base type')
      expect(result).to.be.an('object')
      expect(Object.keys(result).length).to.be.at.least(1)
      expect(result).to.have.property('task_extension')
      expect(result.task_extension.properties.map((p) => p.name)).to.include(
        'custom_field'
      )
      expect(result).to.have.property('unknown_extension')
      expect(result.unknown_extension.properties.map((p) => p.name)).to.include(
        'custom_field'
      )
    } finally {
      console.warn = original_warn
    }
  })

  it('should throw an error if root_base_directory is not provided', async () => {
    try {
      await load_schema_definitions_from_git({
        user_base_directory: '/some/path'
      })
      // Should not reach here
      expect.fail('Expected function to throw')
    } catch (error) {
      expect(error.message).to.include('root_base_directory is required')
    }
  })

  it('should throw an error if user_base_directory is not provided', async () => {
    try {
      await load_schema_definitions_from_git({
        root_base_directory: '/some/path'
      })
      // Should not reach here
      expect.fail('Expected function to throw')
    } catch (error) {
      expect(error.message).to.include('user_base_directory is required')
    }
  })
})
