import { expect } from 'chai'
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
        type: 'type_definition',
        title: 'Task',
        type_name: 'task',
        description: 'Task schema definition',
        user_id: test_user.user_id,
        extends: 'base',
        properties: {
          status: {
            type: 'string',
            enum: ['In Progress', 'Completed']
          },
          priority: {
            type: 'string',
            enum: ['High', 'Medium', 'Low']
          }
        }
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
        type: 'type_definition',
        title: 'Person',
        type_name: 'person',
        description: 'Person schema definition',
        user_id: test_user.user_id,
        extends: 'base',
        properties: {
          first_name: {
            type: 'string',
            min: 2
          },
          last_name: {
            type: 'string',
            min: 2
          }
        }
      },
      entity_type: 'type_definition',
      branch: 'main',
      entity_content: '# Person Schema Definition',
      commit_message: 'Add person schema'
    })

    // Write user (submodule) schemas
    await write_entity_to_git({
      repo_path: user_base_directory,
      git_relative_path: 'schema/task-extension.md',
      entity_properties: {
        type: 'type_extension',
        extends: 'task',
        title: 'Task Extension',
        type_name: 'task_extension',
        description: 'Task extension schema definition',
        user_id: test_user.user_id,
        properties: {
          custom_field: {
            type: 'string'
          }
        }
      },
      entity_type: 'type_extension',
      branch: 'main',
      entity_content: '# Task Extension Schema',
      commit_message: 'Add task extension schema'
    })

    await write_entity_to_git({
      repo_path: user_base_directory,
      git_relative_path: 'schema/unknown-extension.md',
      entity_properties: {
        type: 'type_extension',
        extends: 'unknown_type',
        title: 'Unknown Extension',
        type_name: 'unknown_extension',
        description: 'Unknown extension schema definition',
        user_id: test_user.user_id,
        properties: {
          custom_field: {
            type: 'string'
          }
        }
      },
      entity_type: 'type_extension',
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

    expect(result.task.properties).to.have.property('status')
    expect(result.task.properties).to.have.property('priority')
    expect(result.task.properties).to.have.property('custom_field')

    expect(result.person.properties).to.have.property('first_name')
    expect(result.person.properties).to.have.property('last_name')

    expect(result.task).to.have.property('type', 'type_definition')
    expect(result.task).to.have.property('type_name', 'task')
    expect(result.task).to.have.property('title', 'Task')
    expect(result.task).to.have.property(
      'git_relative_path',
      'system/schema/task.md'
    )
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

    expect(result.task).to.have.property('extensions')
    expect(result.task.extensions).to.be.an('array').with.lengthOf(1)
    expect(result.task.extensions[0]).to.have.property(
      'type_name',
      'task_extension'
    )
    expect(result.task.extensions[0]).to.have.property(
      'git_relative_path',
      'schema/task-extension.md'
    )

    expect(result.person).to.have.property('type', 'type_definition')
    expect(result.person).to.have.property('type_name', 'person')
    expect(result.person).to.have.property('title', 'Person')
    expect(result.person).to.have.property(
      'git_relative_path',
      'system/schema/person.md'
    )
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

    expect(Object.keys(result)).to.have.lengthOf(2)
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

      expect(warning_message).to.include('references unknown base type')
      expect(result).to.be.an('object')
      expect(Object.keys(result).length).to.be.at.least(1)

      expect(result).to.have.property('task')
      expect(result.task).to.have.property('properties')
      expect(result.task.properties).to.have.property('status')
      expect(result.task.properties).to.have.property('priority')
      expect(result.task.properties).to.have.property('custom_field')

      expect(result.task).to.have.property('extensions')
      expect(result.task.extensions).to.be.an('array')
      expect(result.task.extensions[0]).to.have.property(
        'type_name',
        'task_extension'
      )

      expect(result).to.have.property('person')
      expect(result.person).to.have.property('properties')
      expect(result.person.properties).to.have.property('first_name')
      expect(result.person.properties).to.have.property('last_name')

      expect(result).to.not.have.property('unknown_type')
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
